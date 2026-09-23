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

/* ── the glass-card language ─────────────────────────────────────────────────
 * One painter for every see-through card in the ship (bay info panels, the
 * timeline, plaques, room boards) — the in-world twin of the DOM `.ui-glass`
 * surface. Built as a real pane of smoked, frosted glass:
 *
 *   body    thin smoked vertical gradient (lighter at the top, like the DOM
 *           card), a whisper of the room colour in the neutral — ~70% dense,
 *           so a soft band round the edge shows the room behind the glass
 *   frost   a feathered inner box that lifts the reading zone to ~96% (sharp
 *           emissive trims behind a card used to read straight through the
 *           copy); bay cards add a depth-writing back plate under it
 *   light   soft accent light caught inside the pane from the upper-left, a
 *           diagonal sheen, and a soft neutral inner edge glow
 *   bevel   a lit top/left inner edge + a shadowed bottom inner edge (the
 *           pane's thickness), a hairline ink rim, and an accent rim with a
 *           steady floor on every edge (so pale and deep accents read the
 *           same), brightest where the light catches the top-left corner
 *
 * Everything is static paint: no per-frame work. */

/** An accent lifted toward ink so accent-coloured TEXT stays legible on the
 *  dark glass even for deep accents (Xuabelle red, SelfAware blue). */
export function accentInk(accent: string, t = 0.38): string {
  return "#" + new THREE.Color(accent).lerp(new THREE.Color(INK), t).getHexString();
}

function rgba(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

/** Smoke neutral with a hint of the accent (≤ 0.15 per the colour system). */
function smoke(rgb: [number, number, number], accent: string, t: number, a: number): string {
  const c = new THREE.Color(accent);
  const mix = (v: number, k: number) => Math.round(v + (k * 255 - v) * t);
  return `rgba(${mix(rgb[0], c.r)},${mix(rgb[1], c.g)},${mix(rgb[2], c.b)},${Math.min(1, a).toFixed(3)})`;
}

/** Set canvas letter-spacing in em of the CURRENT font size (Chrome/Edge/
 *  Firefox support ctx.letterSpacing; elsewhere it's a harmless no-op).
 *  Always reset with `track(ctx, 0)` so the spacing never leaks into a
 *  caller's later draws. */
export function track(ctx: CanvasRenderingContext2D, em: number, size = 0) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = em && size ? `${(em * size).toFixed(2)}px` : "0px";
}

export type GlassOpts = {
  /** corner radius (canvas px) */
  r?: number;
  /** inset from the canvas edge (room for the rim's outer half) */
  inset?: number;
  /** glass density multiplier (1 = standard card) */
  density?: number;
  /** painted height (defaults to the full canvas) — cards sized to content */
  height?: number;
  /** soft accent glow seeping in from the upper-left */
  glow?: boolean;
};

/** Paint the shared glass card body into [inset, inset] … [w-inset, h-inset]. */
export function paintGlass(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, o: GlassOpts = {}) {
  const r = o.r ?? 26;
  const i = o.inset ?? 5;
  const d = o.density ?? 1;
  const H = Math.min(h, o.height ?? h);
  const x0 = i;
  const y0 = i;
  const cw = w - i * 2;
  const chh = H - i * 2;
  const s = Math.max(1, Math.min(w, H) / 400); // stroke scale for tiny/huge boards

  ctx.save();
  roundRect(ctx, x0, y0, cw, chh, r);
  // body: thin smoked glass, a touch lighter at the top (DOM .ui-glass twin).
  // On its own it is only ~70% dense — the rim band reads as real glass with
  // the room faintly behind it.
  const body = ctx.createLinearGradient(0, y0, 0, y0 + chh);
  body.addColorStop(0, smoke([32, 35, 48], accent, 0.08, 0.72 * d));
  body.addColorStop(0.45, smoke([19, 21, 30], accent, 0.05, 0.68 * d));
  body.addColorStop(1, smoke([12, 13, 20], accent, 0.04, 0.74 * d));
  ctx.fillStyle = body;
  ctx.fill();
  ctx.clip();

  // frost: a FEATHERED inner box (not a radial blob) that lifts the reading
  // zone to ~95% density — copy anywhere on the card sits on dense glass,
  // while a soft band round the edge stays see-through. Built from stacked
  // concentric rounded rects (each a thin layer), so the falloff is smooth
  // and works in every browser (no ctx.filter / shadow tricks).
  const A = Math.min(0.9, 0.84 * d);
  const N = 10;
  const la = 1 - Math.pow(1 - A, 1 / N);
  const fOut = 3 * s;
  const fIn = Math.max(26 * s, Math.min(cw, chh) * 0.1);
  ctx.fillStyle = `rgba(13,15,22,${la.toFixed(4)})`;
  for (let k = 0; k < N; k++) {
    const f = fOut + ((fIn - fOut) * k) / (N - 1);
    roundRect(ctx, x0 + f, y0 + f, cw - f * 2, chh - f * 2, Math.max(4, r - f * 0.6));
    ctx.fill();
  }

  if (o.glow !== false) {
    // inner accent light — the projector's colour caught inside the glass
    const R = Math.max(cw, chh) * 0.95;
    const g = ctx.createRadialGradient(x0 + cw * 0.06, y0, 0, x0 + cw * 0.06, y0, R);
    g.addColorStop(0, rgba(accent, 0.16));
    g.addColorStop(0.42, rgba(accent, 0.04));
    g.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, cw, chh);
  }
  // diagonal sheen across the upper-left — reads as a glass face, not a decal
  const sh = ctx.createLinearGradient(x0, y0, x0 + cw * 0.5, y0 + chh * 0.62);
  sh.addColorStop(0, "rgba(255,255,255,0.075)");
  sh.addColorStop(0.5, "rgba(255,255,255,0.018)");
  sh.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(x0, y0, cw, chh);

  // soft inner edge glow (light caught in the pane's edges) — a wide stroke
  // on the clipped path, so only its inner half lands on the glass. Neutral,
  // with only a breath of accent: an accent-heavy edge glow is what made
  // the lower-right rim (backlit by the room) read heavier than the top.
  roundRect(ctx, x0, y0, cw, chh, r);
  ctx.lineWidth = 22 * s;
  ctx.strokeStyle = smoke([150, 160, 185], accent, 0.35, 0.035);
  ctx.stroke();

  // bevel: lit top inner edge, shadowed bottom inner edge (the pane's depth)
  const bi = 3.5 * s;
  roundRect(ctx, x0 + bi, y0 + bi, cw - bi * 2, chh - bi * 2, Math.max(2, r - bi));
  const bv = ctx.createLinearGradient(0, y0, 0, y0 + chh);
  bv.addColorStop(0, "rgba(255,255,255,0.17)");
  bv.addColorStop(0.12, "rgba(255,255,255,0.05)");
  bv.addColorStop(0.82, "rgba(255,255,255,0.015)");
  bv.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = bv;
  ctx.stroke();
  ctx.restore();

  // hairline ink rim
  ctx.save();
  roundRect(ctx, x0, y0, cw, chh, r);
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = "rgba(244,241,234,0.1)";
  ctx.stroke();
  // accent rim: light falls from the top-left — bright lit corner, a steady
  // floor along the rest so pale and deep accents read alike, and the far
  // corner kept LOW (the room's own backlight already adds there)
  const lit = accentInk(accent, 0.18);
  const e = ctx.createLinearGradient(x0, y0, x0 + cw, y0 + chh);
  e.addColorStop(0, rgba(lit, 0.95));
  e.addColorStop(0.28, rgba(accent, 0.58));
  e.addColorStop(0.62, rgba(accent, 0.34));
  e.addColorStop(1, rgba(accent, 0.3));
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = e;
  ctx.stroke();
  // top highlight inside the rim, fading out at both ends
  const hl = ctx.createLinearGradient(x0 + r, 0, x0 + cw - r, 0);
  hl.addColorStop(0, "rgba(255,255,255,0)");
  hl.addColorStop(0.24, "rgba(255,255,255,0.28)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.strokeStyle = hl;
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0 + 2.5 * s);
  ctx.lineTo(x0 + cw - r, y0 + 2.5 * s);
  ctx.stroke();
  ctx.restore();
}

/** Holo slab background shared by every board — the shared glass card. */
export function paintSlab(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, r = 26) {
  paintGlass(ctx, w, h, accent, { r });
}

/** Mono kicker line with an accent tick, e.g. "■ DAILY QUESTS". */
export function paintKicker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, accent: string, size = 30) {
  const { mono } = fonts();
  const t = size * 0.34;
  ctx.fillStyle = accent;
  ctx.fillRect(x, y - size * 0.36 - t / 2, t, t);
  ctx.font = `600 ${size}px ${mono}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = accentInk(accent);
  track(ctx, 0.08, size);
  ctx.fillText(text, x + size * 0.72, y);
  track(ctx, 0);
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
