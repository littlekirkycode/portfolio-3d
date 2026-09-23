"use client";

import { createContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollRefs } from "@/lib/scrollStore";
import { playPowerUp } from "@/lib/useShipAudio";
import { ROOMS, focusAt, ALCOVE_OPEN_W, ALCOVE_DEPTH, WALL_H } from "../hallConfig";

/* ── room arrival ("the room powers up") ─────────────────────────────────────
 * One 0→1 timeline per bay. It starts when the camera settles on the bay
 * (focus ease ≈ 1), runs over RISE_S, and falls back quickly when the
 * visitor leaves, so every arrival replays. Consumers read sub-windows of
 * it with stage(): the scan sweep first, then the accent coves in sequence,
 * then the info panel settles. Under reduced motion it snaps to its target
 * (no sweep, no ramps). One driver mounts in Walls; everything else just
 * reads the shared array inside its own useFrame — no React state.
 * ──────────────────────────────────────────────────────────────────────── */

export const ARRIVAL = new Float32Array(ROOMS.length);
/** The bay index for components inside a bay (provided by RoomProps). */
export const BayIndex = createContext(-1);
export const roomIndex = (id: string) => ROOMS.findIndex((r) => r.id === id);

const RISE_S = 1.8;
const FALL_S = 0.7;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Eased progress of the sub-window [a, b] of an arrival value. */
export function stage(v: number, a: number, b: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Mount once (Walls). Advances every bay's arrival timeline. */
export function ArrivalDriver({ animate }: { animate: boolean }) {
  const armed = useRef<boolean[]>(ROOMS.map(() => true));
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const f = focusAt(scrollRefs.cameraProgress);
    for (let i = 0; i < ROOMS.length; i++) {
      // start once the head has fully turned in (the scan shouldn't play
      // while the camera is still swinging round)
      const on = f.room === ROOMS[i] && f.ease > 0.995;
      if (!animate) {
        ARRIVAL[i] = on ? 1 : 0;
        continue;
      }
      const v = ARRIVAL[i];
      if (on) {
        if (v === 0 && armed.current[i]) {
          armed.current[i] = false;
          playPowerUp();
        }
        ARRIVAL[i] = Math.min(1, v + dt / RISE_S);
      } else {
        ARRIVAL[i] = Math.max(0, v - dt / FALL_S);
        if (ARRIVAL[i] === 0) armed.current[i] = true;
      }
    }
  });
  return null;
}

/* ── the scan sweep ──────────────────────────────────────────────────────── */

const SCAN_W = ALCOVE_OPEN_W - 0.62;
const SCAN_D = ALCOVE_DEPTH + 0.05;

/** A horizontal plane of accent light that rises floor → ceiling through the
 *  bay once on arrival: faint 0.5 m grid, bright rim where it meets the
 *  walls. Alcove-local (opening on z = 0, room toward −z). */
export function ArrivalScan({ idx, accent, animate }: { idx: number; accent: string; animate: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(accent) }, uA: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uA;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * vec2(${SCAN_W.toFixed(2)}, ${SCAN_D.toFixed(2)});
          vec2 g = abs(fract(p * 2.0) - 0.5);
          float grid = 1.0 - smoothstep(0.0, 0.04, min(g.x, g.y));
          vec2 e = min(vUv, 1.0 - vUv) * vec2(${SCAN_W.toFixed(2)}, ${SCAN_D.toFixed(2)});
          float rim = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
          float k = (0.05 + 0.22 * grid + 0.9 * rim) * uA;
          gl_FragColor = vec4(uColor * k, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    m.toneMapped = false;
    return m;
  }, [accent]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const s = animate ? stage(ARRIVAL[idx], 0.0, 0.5) : 1;
    const live = s > 0.001 && s < 0.999;
    m.visible = live;
    if (!live) return;
    m.position.y = 0.04 + s * (WALL_H - 0.12);
    mat.uniforms.uA.value = Math.sin(Math.PI * s) * 0.85;
  });
  return (
    <mesh ref={mesh} material={mat} position={[0, 0, -SCAN_D / 2]} rotation-x={-Math.PI / 2} visible={false}>
      <planeGeometry args={[SCAN_W, SCAN_D]} />
    </mesh>
  );
}

/* ── settle-in wrapper ───────────────────────────────────────────────────── */

/** Children rise into place and fade up over a window of the arrival
 *  timeline. `floor` is the resting opacity factor while not arrived (so
 *  panels still read obliquely from the corridor). Remembers each
 *  material's own opacity and scales it — never writes absolute values. */
export function Settle({
  idx,
  window: [a, b],
  lift = 0.12,
  floor = 0.35,
  children,
}: {
  idx: number;
  window: [number, number];
  lift?: number;
  floor?: number;
  children: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  const last = useRef(-1);
  useFrame(() => {
    const grp = g.current;
    if (!grp) return;
    const e = stage(ARRIVAL[idx], a, b);
    if (Math.abs(e - last.current) < 0.002) return;
    last.current = e;
    grp.position.y = -lift * (1 - e);
    const k = floor + (1 - floor) * e;
    grp.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mm = m as THREE.Material & { userData: { baseOpacity?: number } };
        if (mm.userData.baseOpacity === undefined) {
          mm.userData.baseOpacity = mm.opacity;
          mm.transparent = true;
        }
        mm.opacity = mm.userData.baseOpacity * k;
      }
    });
  });
  return <group ref={g}>{children}</group>;
}
