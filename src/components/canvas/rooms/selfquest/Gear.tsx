"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { MATERIALS, NEUTRAL, tintNeutral } from "../../theme";
import { getPuckTex } from "../shared";
import { stripForMerge } from "./geo";
import { useDisposable } from "./useDisposable";

/* ── SelfQuest training gear: clean procedural equipment in ONE material
 * family (satin steel, matte rubber, cast grey, brass + chrome details); the
 * accent stays in the light. Replaces the mismatched low-poly GLB set. ── */

/* ── rubber training floor ───────────────────────────────────────────────── */

/** Matte rubber over the whole alcove floor (covers the generic accent mat —
 *  a gym floor is dark neutral rubber; the accent belongs in the light). No
 *  tile seams: 12 mm joints are sub-pixel from the corridor and alias into
 *  stray dashes that crawl while scrolling. */
export function TrainingFloor({ accent }: { accent: string }) {
  const W = 7.36;
  const D = 4.3;
  const mat = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: tintNeutral(NEUTRAL.hullShadow, accent, 0.05).lerp(new THREE.Color(NEUTRAL.rubber), 0.4),
        roughness: 0.9,
        metalness: 0.02,
      }),
    accent,
  );
  const nose = useDisposable(() => MATERIALS.steel());
  return (
    <group>
      {/* top at 0.06: sits over the generic mat + floor-story ring */}
      <mesh position={[0, 0.03, 2.45 - D / 2]} material={mat}>
        <boxGeometry args={[W, 0.06, D]} />
      </mesh>
      {/* satin steel nosing along the threshold, where the rubber meets the hall */}
      <mesh position={[0, 0.032, 2.44]} material={nose}>
        <boxGeometry args={[W, 0.066, 0.05]} />
      </mesh>
    </group>
  );
}

/* ── dumbbell rack ───────────────────────────────────────────────────────── */

/** Aged brass: darker + more saturated than WARM so it reads as metal, not peach. */
export const BRASS = "#b58a45";

const DB_SIZES = [0.072, 0.082, 0.092, 0.102, 0.112, 0.124]; // head radius per pair
const LOW_Y = 0.16;
const LOW_Z = 0.08;
const HIGH_Y = 0.31;
const HIGH_Z = -0.32;

function frameBox(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return stripForMerge(g);
}

/** A low two-tier commercial dumbbell rack with six graded pairs of hex
 *  dumbbells: dark powder-coated frame with bevelled trays, rubber saddles,
 *  charcoal urethane heads (resting on a FLAT face) with chrome end plates
 *  and brass collars — the chrome + brass are the detail, not the frame. Frame parts are merged per material and the
 *  dumbbells are instanced: ~7 draw calls for the whole unit. */
export function DumbbellRack({ length = 1.9 }: { length?: number }) {
  // dark powder-coat frame: it recedes, so the heads, chrome and brass read
  const frame = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: NEUTRAL.hullShadow, roughness: 0.55, metalness: 0.35 }),
  );
  const saddle = useDisposable(() => MATERIALS.rubber({ color: "#3a3f4a" }));
  // charcoal urethane heads with a real sheen (clearcoat catches the key)
  const headMat = useDisposable(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#2b2f37",
        roughness: 0.34,
        metalness: 0.05,
        clearcoat: 0.8,
        clearcoatRoughness: 0.22,
      }),
  );
  const brass = useDisposable(() => new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.26, metalness: 0.9 }));
  const chrome = useDisposable(() => MATERIALS.polished());
  const shadow = useDisposable(
    () => new THREE.MeshBasicMaterial({ map: getPuckTex(), color: "#000000", transparent: true, opacity: 0.55, depthWrite: false }),
  );
  const headGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 6);
    g.rotateZ(Math.PI / 2); // axis along x (the dumbbell's length)
    return g;
  });
  const barGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(0.019, 0.019, 1, 12);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const discGeo = useDisposable(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 24);
    g.rotateX(Math.PI / 2); // axis along z (the dumbbell's length on the rack)
    return g;
  });
  const half = length / 2;
  // legs: low front, high back pair; the static frame merged into 3 meshes
  const legs = useMemo(
    () => [
      { z: LOW_Z + 0.24, y: LOW_Y },
      { z: HIGH_Z - 0.2, y: HIGH_Y },
      { z: HIGH_Z + 0.2, y: HIGH_Y },
    ],
    [],
  );
  const frameGeo = useDisposable(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [-half, half]) {
      parts.push(frameBox(0.07, 0.035, 0.9, x, 0.0175, -0.1)); // foot runner
      for (const l of legs) parts.push(frameBox(0.05, l.y, 0.05, x, l.y / 2, l.z));
    }
    // bevelled tray pans: the edges catch light instead of showing hard boxes
    for (const [d, y, z] of [
      [0.52, LOW_Y - 0.02, LOW_Z],
      [0.46, HIGH_Y - 0.02, HIGH_Z],
    ]) {
      const pan = new RoundedBoxGeometry(length + 0.05, 0.03, d, 2, 0.008);
      pan.translate(0, y, z);
      parts.push(stripForMerge(pan));
      pan.dispose();
    }
    const g = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return g;
  }, `${length}`);
  const saddleGeo = useDisposable(() => {
    const parts = [
      frameBox(length - 0.08, 0.006, 0.46, 0, LOW_Y - 0.003, LOW_Z),
      frameBox(length - 0.08, 0.006, 0.4, 0, HIGH_Y - 0.003, HIGH_Z),
    ];
    const g = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return g;
  }, `${length}`);
  const capGeo = useDisposable(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [-half, half]) for (const l of legs) parts.push(frameBox(0.056, 0.012, 0.056, x, l.y + 0.008, l.z));
    const g = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return g;
  }, `${length}`);

  const heads = useRef<THREE.InstancedMesh>(null);
  const bars = useRef<THREE.InstancedMesh>(null);
  const plates = useRef<THREE.InstancedMesh>(null);
  const collars = useRef<THREE.InstancedMesh>(null);

  // front/low tier = the heavier pairs, back/high tier = the lighter (per real racks)
  const slots = useMemo(() => {
    const out: { x: number; y: number; z: number; r: number }[] = [];
    const place = (tier: { y: number; z: number }, sizes: number[]) => {
      const n = sizes.length * 2;
      const span = length - 0.26;
      for (let i = 0; i < n; i++) {
        const r = sizes[Math.floor(i / 2)];
        // pairs sit together, a clear gap between pairs
        const pair = Math.floor(i / 2);
        const x = -span / 2 + (span * (pair + 0.5)) / sizes.length + (i % 2 ? 1 : -1) * (r + 0.02);
        out.push({ x, y: tier.y + r * 0.866, z: tier.z, r });
      }
    };
    place({ y: LOW_Y, z: LOW_Z }, DB_SIZES.slice(3));
    place({ y: HIGH_Y, z: HIGH_Z }, DB_SIZES.slice(0, 3));
    return out;
  }, [length]);

  useEffect(() => {
    const h = heads.current;
    const b = bars.current;
    const pl = plates.current;
    const co = collars.current;
    if (!h || !b || !pl || !co) return;
    const one = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    // the 6-sided head already has a flat face down (y = ±0.866 r); only turn
    // its axis front-to-back — no roll, so every head rests on a flat
    const qh = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    slots.forEach((s, i) => {
      const len = 0.18 + s.r * 1.1; // grip + collars
      const hw = s.r * 0.95; // head width along the bar
      // dumbbells lie front-to-back on the saddles (axis along z)
      for (const side of [-1, 1] as const) {
        m.compose(new THREE.Vector3(s.x, s.y, s.z + side * (len / 2 + hw / 2)), qh, new THREE.Vector3(hw, s.r, s.r));
        h.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), m);
        // polished end plate on the outer face, brass collar on the inner
        m.compose(
          new THREE.Vector3(s.x, s.y, s.z + side * (len / 2 + hw + 0.004)),
          one,
          new THREE.Vector3(s.r * 0.66, s.r * 0.66, 0.008),
        );
        pl.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), m);
        m.compose(new THREE.Vector3(s.x, s.y, s.z + side * (len / 2 - 0.006)), one, new THREE.Vector3(0.028, 0.028, 0.014));
        co.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), m);
      }
      m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(len + hw * 2, 1, 1));
      b.setMatrixAt(i, m);
    });
    for (const im of [h, b, pl, co]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }, [slots]);

  return (
    <group>
      {/* contact shadow: the rack sits ON the rubber */}
      <mesh position={[0, 0.003, -0.1]} rotation-x={-Math.PI / 2} scale={[length + 0.5, 1.2, 1]} material={shadow} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh geometry={frameGeo} material={frame} />
      <mesh geometry={saddleGeo} material={saddle} />
      <mesh geometry={capGeo} material={chrome} />
      <instancedMesh ref={heads} args={[headGeo, headMat, slots.length * 2]} />
      <instancedMesh ref={bars} args={[barGeo, chrome, slots.length]} />
      <instancedMesh ref={plates} args={[discGeo, chrome, slots.length * 2]} />
      <instancedMesh ref={collars} args={[discGeo, brass, slots.length * 2]} />
    </group>
  );
}

/* ── lifting platform + a used pair ──────────────────────────────────────── */

/** A recessed lifting platform: a darker rubber field inside a satin steel
 *  frame (≥45 mm edges so it never aliases), flush-ish with the training
 *  floor. It gives the front strip its floor story and grounds the rack.
 *  Two draw calls. Origin = centre, on the training floor's top. */
export function LiftingPlatform({ w = 2.4, d = 1.2 }: { w?: number; d?: number }) {
  const rubber = useDisposable(() => MATERIALS.rubber({ color: "#17191e" }));
  const edge = useDisposable(() => new THREE.MeshStandardMaterial({ color: NEUTRAL.steel, roughness: 0.5, metalness: 0.7 }));
  const E = 0.05;
  const frameGeo = useDisposable(() => {
    const parts = [
      frameBox(w, 0.012, E, 0, 0.006, d / 2 - E / 2),
      frameBox(w, 0.012, E, 0, 0.006, -d / 2 + E / 2),
      frameBox(E, 0.012, d - E * 2, w / 2 - E / 2, 0.006, 0),
      frameBox(E, 0.012, d - E * 2, -w / 2 + E / 2, 0.006, 0),
    ];
    const g = mergeGeometries(parts, false)!;
    parts.forEach((p) => p.dispose());
    return g;
  }, `${w}x${d}`);
  return (
    <group>
      <mesh position-y={0.004} material={rubber}>
        <boxGeometry args={[w - E * 2, 0.008, d - E * 2]} />
      </mesh>
      <mesh geometry={frameGeo} material={edge} />
    </group>
  );
}

/** One hex dumbbell lying on the floor beside the rack, as if just racked
 *  out: head flats down, chrome bar, brass collars. Origin = on the floor. */
export function FloorDumbbell({ r = 0.1 }: { r?: number }) {
  const head = useDisposable(
    () => new THREE.MeshPhysicalMaterial({ color: "#2b2f37", roughness: 0.34, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.22 }),
  );
  const chrome = useDisposable(() => MATERIALS.polished());
  const brass = useDisposable(() => new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.26, metalness: 0.9 }));
  const len = 0.18 + r * 1.1;
  const hw = r * 0.95;
  const geos = useDisposable(() => {
    const h: THREE.BufferGeometry[] = [];
    const c: THREE.BufferGeometry[] = [];
    const b: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const hg = new THREE.CylinderGeometry(r, r, hw, 6);
      hg.rotateZ(Math.PI / 2);
      hg.translate(s * (len / 2 + hw / 2), r * 0.866, 0);
      h.push(stripForMerge(hg));
      const pg = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.008, 24);
      pg.rotateZ(Math.PI / 2);
      pg.translate(s * (len / 2 + hw + 0.004), r * 0.866, 0);
      c.push(stripForMerge(pg));
      const cg = new THREE.CylinderGeometry(0.028, 0.028, 0.014, 20);
      cg.rotateZ(Math.PI / 2);
      cg.translate(s * (len / 2 - 0.006), r * 0.866, 0);
      b.push(stripForMerge(cg));
    }
    const bar = new THREE.CylinderGeometry(0.019, 0.019, len + hw * 2, 12);
    bar.rotateZ(Math.PI / 2);
    bar.translate(0, r * 0.866, 0);
    c.push(stripForMerge(bar));
    const m = (a: THREE.BufferGeometry[]) => {
      const g = mergeGeometries(a, false)!;
      a.forEach((p) => p.dispose());
      return g;
    };
    const out = {
      heads: m(h),
      chrome: m(c),
      brass: m(b),
      dispose() {
        out.heads.dispose();
        out.chrome.dispose();
        out.brass.dispose();
      },
    };
    return out;
  }, `${r}`);
  return (
    <group>
      <mesh geometry={geos.heads} material={head} />
      <mesh geometry={geos.chrome} material={chrome} />
      <mesh geometry={geos.brass} material={brass} />
    </group>
  );
}
