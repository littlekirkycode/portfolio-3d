"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { atlasPlane, box, merge, softBox, turned, type Piece, type V3 } from "./geo";
import { contactGeo } from "./contact";
import { ATLAS, useLabelAtlas } from "./labels";
import { useGeoSet, type AlliedMats } from "./mats";

/* ── secondary kit: ruggedised transit cases + an LRU on the vibration shaker ─
 * The product leaving the cell: slate transit cases with aluminium valances,
 * ball corners, butterfly latches and painted stencils; and in the right lane,
 * a finned ruggedised line-replaceable unit bolted to an electrodynamic shaker
 * (environmental qualification — "ruggedised systems", literally). All pieces
 * are merged per material; every painted marking comes from ONE atlas. */

type CaseSpec = { w: number; h: number; d: number; pos: V3; ry: number; label: keyof typeof ATLAS };

/* The qualified unit's transit case with the spares case on top, authored
 * around the stack's own floor origin (Kit places it via `cases`, turning it
 * square to the dwell camera). */
const CASES: CaseSpec[] = [
  { w: 0.74, h: 0.4, d: 0.5, pos: [0, 0, 0], ry: -0.02, label: "caseA" },
  { w: 0.6, h: 0.3, d: 0.44, pos: [-0.01, 0.4, 0.03], ry: 0.07, label: "caseB" },
];

/** Place a local piece into a case's frame. */
function inCase(c: CaseSpec, pc: Piece): Piece {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...(pc.p ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pc.r ?? [0, 0, 0]))),
    new THREE.Vector3(...(pc.s ?? [1, 1, 1])),
  );
  const outer = new THREE.Matrix4().compose(new THREE.Vector3(...c.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, c.ry, 0)), new THREE.Vector3(1, 1, 1));
  const g = pc.g.index ? pc.g.toNonIndexed() : pc.g;
  if (g !== pc.g) pc.g.dispose();
  g.applyMatrix4(outer.multiply(m));
  return { g };
}

function buildCases(spares: boolean) {
  const shell: Piece[] = [];
  const metal: Piece[] = [];
  const rubber: Piece[] = [];
  const decals: Piece[] = [];
  for (const c of spares ? CASES : CASES.slice(0, 1)) {
    const { w, h, d } = c;
    shell.push(inCase(c, { g: softBox(w, h, d, 0.016), p: [0, h / 2, 0] }));
    // aluminium valances: lid seam + base
    for (const [y, t] of [[h * 0.72, 0.024], [0.012, 0.022], [h - 0.012, 0.022]] as const) {
      metal.push(inCase(c, { g: box(w + 0.012, t, d + 0.012), p: [0, y, 0] }));
    }
    // ball corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.02, h - 0.02]) {
      metal.push(inCase(c, { g: new THREE.SphereGeometry(0.03, 12, 8), p: [sx * (w / 2 - 0.004), y, sz * (d / 2 - 0.004)] }));
    }
    // butterfly latches across the lid seam
    for (const x of [-w * 0.3, w * 0.3]) {
      metal.push(
        inCase(c, { g: box(0.09, 0.075, 0.012), p: [x, h * 0.72, d / 2 + 0.01] }),
        inCase(c, { g: turned([[0, 0], [0.024, 0], [0.02, 0.012], [0, 0.012]], 16), p: [x, h * 0.72, d / 2 + 0.016], r: [Math.PI / 2, 0, 0] }),
      );
    }
    // recessed carry handle on the lid
    rubber.push(
      inCase(c, { g: box(0.2, 0.022, 0.034), p: [0, h + 0.03, 0] }),
      inCase(c, { g: box(0.024, 0.03, 0.034), p: [-0.1, h + 0.012, 0] }),
      inCase(c, { g: box(0.024, 0.03, 0.034), p: [0.1, h + 0.012, 0] }),
    );
    // painted stencil on the front face, below the seam
    const [u0, v0, u1, v1] = ATLAS[c.label];
    const aspect = ((v1 - v0) / (u1 - u0)) * 0.5; // atlas is 2:1
    const lw = Math.min(w * 0.74, (h * 0.52) / aspect);
    decals.push(inCase(c, { g: atlasPlane(lw, lw * aspect, ATLAS[c.label]), p: [0, h * 0.72 * 0.5, d / 2 + 0.0025] }));
  }
  return {
    shell: merge(shell),
    metal: merge(metal),
    rubber: merge(rubber),
    decals: merge(decals),
    shadow: contactGeo([{ x: 0, z: 0.01, w: 1.08, d: 0.82 }], 0.004),
  };
}

function buildLru() {
  const body: Piece[] = [];
  const frame: Piece[] = [];
  const dark: Piece[] = [];
  const anod: Piece[] = [];
  const chrome: Piece[] = [];
  const oxide: Piece[] = [];
  /* electrodynamic shaker */
  body.push({ g: turned([[0, 0], [0.15, 0], [0.15, 0.2], [0.13, 0.215], [0, 0.215]], 40), p: [0, 0.06, 0] });
  frame.push(
    { g: box(0.42, 0.05, 0.36), p: [0, 0.025, 0] },
    { g: box(0.035, 0.2, 0.26), p: [-0.19, 0.15, 0] },
    { g: box(0.035, 0.2, 0.26), p: [0.19, 0.15, 0] },
  );
  anod.push(
    { g: turned([[0, 0], [0.155, 0], [0.155, 0.03], [0, 0.03]], 40), p: [0, 0.14, 0] }, // cooling band
    { g: turned([[0, 0], [0.1, 0], [0.1, 0.02], [0, 0.02]], 32), p: [0, 0.275, 0] }, // armature
    { g: box(0.32, 0.022, 0.4), p: [0, 0.306, 0] }, // head expander
  );
  // trunnion hubs on the outside of the side plates
  for (const sx of [-1, 1]) chrome.push({ g: turned([[0, 0], [0.04, 0], [0.04, 0.024], [0.034, 0.03], [0, 0.03]], 20), p: [sx * 0.2075, 0.19, 0], r: [0, 0, -sx * Math.PI / 2] });
  /* the LRU */
  const Y = 0.317;
  anod.push({ g: box(0.3, 0.012, 0.38), p: [0, Y + 0.006, 0] }); // mounting flange
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) oxide.push({ g: turned([[0, 0], [0.011, 0], [0.011, 0.012], [0.009, 0.014], [0, 0.014]], 16), p: [sx * 0.13, Y + 0.012, sz * 0.17] });
  const chassis: Piece[] = [{ g: softBox(0.25, 0.19, 0.33, 0.012), p: [0, Y + 0.012 + 0.095, -0.005] }];
  for (let i = 0; i < 9; i++) chassis.push({ g: box(0.007, 0.042, 0.3), p: [-0.108 + i * 0.027, Y + 0.012 + 0.19 + 0.02, -0.01] });
  anod.push({ g: box(0.27, 0.205, 0.014), p: [0, Y + 0.012 + 0.1, 0.165] }); // front panel
  // MIL circular connectors
  for (const [x, r] of [[-0.075, 0.03], [0.0, 0.024], [0.068, 0.024]] as const) {
    chrome.push({ g: turned([[0, 0], [r, 0], [r, 0.024], [r * 0.86, 0.03], [r * 0.62, 0.03], [r * 0.62, 0.022], [0, 0.022]], 24), p: [x, Y + 0.08, 0.172], r: [Math.PI / 2, 0, 0] });
    dark.push({ g: new THREE.CircleGeometry(r * 0.6, 20), p: [x, Y + 0.08, 0.194] });
  }
  // grab handles
  for (const sx of [-1, 1]) chrome.push({ g: new THREE.TorusGeometry(0.05, 0.0065, 8, 18, Math.PI), p: [sx * 0.118, Y + 0.012 + 0.1, 0.176], r: [0, Math.PI / 2, Math.PI / 2] });
  // accelerometer block on the head plate + its cable
  anod.push({ g: box(0.03, 0.026, 0.03), p: [0.12, 0.33, 0.17] });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.12, 0.345, 0.17),
    new THREE.Vector3(0.16, 0.36, 0.19),
    new THREE.Vector3(0.2, 0.31, 0.16),
    new THREE.Vector3(0.214, 0.24, 0.09),
  ]);
  dark.push({ g: new THREE.TubeGeometry(curve, 32, 0.006, 6, false) });
  chrome.push({ g: turned([[0, 0], [0.012, 0], [0.012, 0.016], [0, 0.016]], 16), p: [0.2075, 0.24, 0.09], r: [0, 0, -Math.PI / 2] }); // cable gland
  /* seismic base: a T-slotted cast-iron block the shaker is bolted to */
  const base: Piece[] = [{ g: softBox(0.64, 0.09, 0.56, 0.012), p: [0, -0.045, 0] }];
  for (const x of [-0.24, 0.24]) for (const z of [-0.2, 0.2]) oxide.push({ g: turned([[0, 0], [0.014, 0], [0.014, 0.01], [0, 0.012]], 6), p: [x, 0, z] });
  return {
    // contact shadow just above the mat slab (top ≈ 0.012 world); the group is
    // scaled by S and lifted 0.09·S, so this is authored in scaled-local units
    shadow: contactGeo([{ x: 0, z: 0, w: 0.98, d: 0.88 }], -0.09 + 0.013),
    base: merge(base),
    trimLine: box(0.6, 0.008, 0.004),
    body: merge(body),
    frame: merge(frame),
    chassis: merge(chassis),
    dark: merge(dark),
    anod: merge(anod),
    chrome: merge(chrome),
    oxide: merge(oxide),
    plate: atlasPlane(0.1, 0.066, ATLAS.plate),
    led: box(0.014, 0.014, 0.006),
  };
}

export default function Kit({
  accent,
  m,
  showCases = true,
  showLru = true,
  lru: lruAt = [-0.72, 1.3],
  cases: casesAt = [2.75, 1.85],
  spares = true,
}: {
  accent: string;
  m: AlliedMats;
  showCases?: boolean;
  showLru?: boolean;
  /** LRU + shaker floor position (room-local x, z) */
  lru?: [number, number];
  /** case stack floor position (room-local x, z) */
  cases?: [number, number];
  /** stack the spares case on top (dropped when the frame is tight) */
  spares?: boolean;
}) {
  const atlas = useLabelAtlas(accent);
  const decal = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: atlas,
        // a faint self-lift so white stencils hold their contrast in the
        // cell's darker front corners (paint, not a glow: ≈ 0.3)
        emissive: "#ffffff",
        emissiveMap: atlas,
        emissiveIntensity: 0.3,
        transparent: true,
        roughness: 0.6,
        metalness: 0.1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    [atlas],
  );
  useEffect(() => () => decal.dispose(), [decal]);
  const cases = useGeoSet(() => buildCases(spares), spares ? "s" : "");
  const lru = useGeoSet(buildLru);
  // face the dwell camera (room-local ≈ (0, 1.62, 6.15)), then a slight
  // three-quarter turn so the fins and side read as a volume, not a front
  const face = Math.atan2(-lruAt[0], 6.15 - lruAt[1]) + 0.42;
  const S = 1.3;
  const caseFace = Math.atan2(-casesAt[0], 6.15 - casesAt[1]);
  return (
    <group>
      {showCases && (
        <group position={[casesAt[0], 0, casesAt[1]]} rotation-y={caseFace}>
          <mesh geometry={cases.shadow} material={m.contact} renderOrder={-1} />
          <mesh geometry={cases.shell} material={m.slate} />
          <mesh geometry={cases.metal} material={m.anod} />
          <mesh geometry={cases.rubber} material={m.rubber} />
          <mesh geometry={cases.decals} material={decal} />
        </group>
      )}
      {/* LRU bolted to the vibration shaker on its seismic base — the qualified
          unit, centre stage on the mat */}
      {showLru && (
        <group position={[lruAt[0], 0.09 * S, lruAt[1]]} rotation-y={face} scale={S}>
          <mesh geometry={lru.shadow} material={m.contact} renderOrder={-1} />
          <mesh geometry={lru.base} material={m.paintDark} />
          <mesh geometry={lru.trimLine} material={m.trim} position={[0, -0.02, 0.281]} />
          <mesh geometry={lru.body} material={m.paint} />
          <mesh geometry={lru.frame} material={m.paintDark} />
          <mesh geometry={lru.chassis} material={m.chassis} />
          <mesh geometry={lru.dark} material={m.shadow} />
          <mesh geometry={lru.anod} material={m.anodDark} />
          <mesh geometry={lru.chrome} material={m.chrome} />
          <mesh geometry={lru.oxide} material={m.oxide} />
          <mesh geometry={lru.plate} material={decal} position={[-0.06, 0.317 + 0.012 + 0.16, 0.1735]} />
          {/* status LED — steady, never blinks */}
          <mesh geometry={lru.led} material={m.hot} position={[0.1, 0.317 + 0.012 + 0.165, 0.174]} />
        </group>
      )}
    </group>
  );
}
