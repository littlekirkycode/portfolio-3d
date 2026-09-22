"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { familyVar, roundRect, useTextTexture } from "../canvas2d";

/* ── shared kit for the per-room installations ───────────────────────────────
 * Every bay gets a bespoke installation that visualises its project (see the
 * sibling files). They share one visual language with the existing floating
 * info panel: translucent dark slab, accent rim, mono kicker, serif display
 * numerals — painted into CanvasTextures — plus a few emissive/line helpers.
 *
 * Coordinates in every installation are RoomProps-local: origin on the niche
 * floor 1.55 in front of the back wall, +z toward the opening (z≈+2.45), side
 * walls at x = ±3.7, back wall face at z ≈ -1.85. The dwell camera looks
 * straight in, so the free "showcase" zone is the LEFT column (x < -2.4); the
 * hero screen owns the back wall at x∈[-3.1, 0] and the info panel owns
 * x∈[0, 3.15] (see RoomProps' OCCLUSION BAND note).
 * ──────────────────────────────────────────────────────────────────────── */

export const INK = "#f4f1ea";

export function fonts() {
  return {
    ser: familyVar("--ff-display", "Georgia, serif"),
    mono: familyVar("--ff-mono", "ui-monospace, monospace"),
    sans: familyVar("--ff-body", "system-ui, sans-serif"),
  };
}

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Holo slab background shared by every board (matches InfoPanel). */
export function paintSlab(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, r = 26) {
  roundRect(ctx, 5, 5, w - 10, h - 10, r);
  ctx.fillStyle = "rgba(8,10,18,0.72)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(244,241,234,0.14)";
  ctx.stroke();
}

/** Mono kicker line with an accent tick, e.g. "◆ DAILY QUESTS". */
export function paintKicker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, accent: string, size = 30) {
  const { mono } = fonts();
  ctx.fillStyle = accent;
  roundRect(ctx, x, y - size * 0.62, size * 0.36, size * 0.36, 3);
  ctx.fill();
  ctx.font = `600 ${size}px ${mono}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x + size * 0.7, y);
}

/**
 * A flat canvas-painted board. `paint` MUST be referentially stable (wrap it
 * in useMemo) — it's an effect dependency of the texture painter.
 * `slab` paints the standard holo background first.
 */
export function Board({
  w,
  h,
  res = 768,
  paint,
  accent,
  slab = true,
  opacity = 1,
  ...group
}: {
  w: number;
  h: number;
  res?: number;
  paint: Painter;
  accent: string;
  slab?: boolean;
  opacity?: number;
} & Omit<ThreeElements["group"], "children">) {
  const cw = res;
  const ch = Math.round((res * h) / w);
  const draw = useMemo<Painter>(
    () => (ctx, W, H) => {
      if (slab) paintSlab(ctx, W, H, accent);
      paint(ctx, W, H);
    },
    [paint, accent, slab],
  );
  const tex = useTextTexture(cw, ch, draw);
  return (
    <group {...group}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Slim floor stand under a board (post + foot), so boards read as installed
 *  hardware rather than floating decals. `top` = board bottom edge height. */
export function Stand({ top, x = 0, z = 0, accent }: { top: number; x?: number; z?: number; accent: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.04, 24]} />
        <meshStandardMaterial color="#1a1e2a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, top / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, top, 10]} />
        <meshStandardMaterial color="#2a3040" roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.19, 0.205, 40]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Emissive accent material (memoised per colour/strength). */
export function useGlow(color: string, k = 1, opacity = 1) {
  const m = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(k),
        toneMapped: false,
        transparent: opacity < 1,
        opacity,
      }),
    [color, k, opacity],
  );
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/** Soft additive glow material (holograms, beams). */
export function useAdditive(color: string, opacity: number) {
  const m = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [color, opacity],
  );
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/**
 * Flowing tube: a thin tube along `points` whose surface carries soft dashes
 * that stream from the first point to the last — data moving along a path
 * (token streams, routes, career trajectory). Smooth motion, no blinking.
 */
export function FlowTube({
  points,
  color,
  radius = 0.012,
  speed = 0.6,
  dashes = 14,
  animate = true,
  base = 0.25,
}: {
  points: [number, number, number][];
  color: string;
  radius?: number;
  speed?: number;
  dashes?: number;
  animate?: boolean;
  base?: number;
}) {
  // points is a fresh literal per render at most call sites — key the
  // geometry on its serialisation, not its identity
  const key = JSON.stringify(points);
  const geo = useMemo(() => {
    const pts = JSON.parse(key) as [number, number, number][];
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(curve, 96, radius, 8, false);
  }, [key, radius]);
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uT: { value: 0 },
        uN: { value: dashes },
        uBase: { value: base },
      },
      vertexShader: /* glsl */ `
        varying float vS;
        void main() {
          vS = uv.x;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uT;
        uniform float uN;
        uniform float uBase;
        varying float vS;
        void main() {
          float ph = fract(vS * uN - uT);
          float dash = smoothstep(0.0, 0.25, ph) * (1.0 - smoothstep(0.45, 0.8, ph));
          float ends = smoothstep(0.0, 0.04, vS) * smoothstep(1.0, 0.96, vS);
          float k = (uBase + (1.0 - uBase) * dash) * ends;
          gl_FragColor = vec4(uColor * (0.6 + 1.1 * dash), k);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    m.toneMapped = false;
    return m;
  }, [color, dashes, base]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame((_, dt) => {
    if (animate) mat.uniforms.uT.value += Math.min(dt, 1 / 30) * speed;
  });
  return <mesh geometry={geo} material={mat} />;
}

/** Continuous Y rotation (rad/s) — frozen under reduced motion. */
export function Spin({ speed, animate, children, ...group }: { speed: number; animate: boolean; children: ReactNode } & Omit<ThreeElements["group"], "children">) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (animate && ref.current) ref.current.rotation.y += Math.min(dt, 1 / 30) * speed;
  });
  return (
    <group {...group}>
      <group ref={ref}>{children}</group>
    </group>
  );
}

/** Line segments from a flat [x,y,z, x,y,z, …] array. */
export function Segments({ positions, color, opacity = 1 }: { positions: number[]; color: string; opacity?: number }) {
  const key = positions.join(",");
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(key.split(",").map(Number), 3));
    return g;
  }, [key]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </lineSegments>
  );
}

/** CAD-style edge overlay for any geometry (accent wireframe of hard edges). */
export function Edges({ geometry, color, opacity = 0.9, threshold = 20 }: { geometry: THREE.BufferGeometry; color: string; opacity?: number; threshold?: number }) {
  const g = useMemo(() => new THREE.EdgesGeometry(geometry, threshold), [geometry, threshold]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <lineSegments geometry={g}>
      <lineBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} />
    </lineSegments>
  );
}
