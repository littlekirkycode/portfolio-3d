"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLOW, MATERIALS, NEUTRAL, WARM, tintNeutral } from "../../theme";
import { getPuckTex } from "../shared";
import { MON_L, MON_R, PHONE, atlasPlane } from "./atlas";
import { box, cyl, merge, rod } from "./geo";

/* ── the operator's station, seen over the shoulder ──────────────────────────
 * Sits under the wall terminal (the room's hero) and stays below it: a walnut
 * + steel desk, twin monitors on one arm (SelfQuest's Flutter client in the
 * editor, the deploy log across the stack on the right), the test phone on a
 * stand, keyboard + mouse, a mug, and ONE warm practical — the task lamp, whose
 * pool on the walnut is the room's warm, human zone (kept on the desktop: a
 * lamp over a solid top can't light the floor). No chair: from the dwell camera any seat sits across the monitors. */

const DESK_W = 1.7;
const DESK_D = 0.66;
const TOP_Y = 0.74;
const MON_W = 0.6;
const MON_H = (MON_W * MON_L.h) / MON_L.w;
const ARM_Y = 1.0;

/** Monitor placements (desk-local): slight V toward the seat. */
const MONS = [
  { x: -0.32, ry: 0.2, r: MON_L },
  { x: 0.32, ry: -0.2, r: MON_R },
] as const;
const MON_Z = -0.17;


/** Task lamp (desk-local): base back-left, head reaching forward over the
 *  keyboard with its open, lit shade tipped toward the seat (and the camera). */
const LAMP_BASE: [number, number, number] = [-0.74, 0, -0.2];
const LAMP_ELBOW: [number, number, number] = [-0.8, TOP_Y + 0.34, -0.14];
const LAMP_HEAD: [number, number, number] = [-0.72, TOP_Y + 0.3, 0.1];
const LAMP_TILT = 0.95;

export default function Workstation({
  accent,
  atlas,
  position,
  ry = 0,
}: {
  accent: string;
  atlas: THREE.Texture;
  position: [number, number, number];
  ry?: number;
}) {
  const built = useMemo(() => {
    const frameC = tintNeutral("#4b5366", accent, 0.08);
    const dark = NEUTRAL.hullShadow;
    const deck = tintNeutral(NEUTRAL.hullLight, accent, 0.08);

    const wood = [
      box(DESK_W, 0.034, DESK_D, "#ffffff", { p: [0, TOP_Y - 0.017, 0] }),
    ];
    const paint: THREE.BufferGeometry[] = [
      // dark edge band so the walnut top reads as a slab
      box(DESK_W + 0.006, 0.012, DESK_D + 0.006, dark, { p: [0, TOP_Y - 0.04, 0] }),
      // monitor bezels + backs
      ...MONS.map(({ x, ry: r }) => {
        const g = box(MON_W + 0.024, MON_H + 0.024, 0.024, dark);
        g.rotateY(r).translate(x, ARM_Y, MON_Z - 0.014);
        return g;
      }),
      ...MONS.map(({ x, ry: r }) => {
        const g = box(0.12, 0.1, 0.03, NEUTRAL.hull);
        g.rotateY(r).translate(x, ARM_Y, MON_Z - 0.04);
        return g;
      }),
      // keyboard: deck + key field; mouse; mug
      box(0.44, 0.016, 0.14, NEUTRAL.hull, { p: [-0.02, TOP_Y + 0.008, 0.13] }),
      box(0.41, 0.01, 0.115, deck, { p: [-0.02, TOP_Y + 0.019, 0.13] }),
      box(0.06, 0.022, 0.1, NEUTRAL.hull, { p: [0.3, TOP_Y + 0.011, 0.14] }),
      cyl(0.04, 0.036, 0.1, deck, { p: [0.56, TOP_Y + 0.05, 0.02] }),
      cyl(0.034, 0.034, 0.004, "#3a2a20", { p: [0.56, TOP_Y + 0.094, 0.02] }),
      // phone stand + phone body
      box(0.1, 0.012, 0.08, NEUTRAL.hull, { p: [0.38, TOP_Y + 0.006, -0.02] }),
      box(0.082, 0.16, 0.01, dark, { p: [0.38, TOP_Y + 0.09, -0.03], r: [-0.22, -0.25, 0] }),
      // lamp shade (outside), head tipped toward the seat
      cyl(0.035, 0.088, 0.12, NEUTRAL.hullLight, { p: LAMP_HEAD, r: [-LAMP_TILT, 0, 0] }, 28, true),
      cyl(0.036, 0.036, 0.004, NEUTRAL.hullLight, { p: [0, 0.06, 0], r: [0, 0, 0] }, 20).rotateX(-LAMP_TILT).translate(...LAMP_HEAD),
    ];
    // powder-coated frame parts (satin paint, not bare metal)
    const steel: THREE.BufferGeometry[] = [
      // T-legs: column, foot, top rail each side
      ...[-1, 1].flatMap((s) => [
        box(0.06, TOP_Y - 0.1, 0.06, frameC, { p: [s * (DESK_W / 2 - 0.1), (TOP_Y - 0.08) / 2 + 0.02, -0.06] }),
        box(0.07, 0.03, DESK_D - 0.04, frameC, { p: [s * (DESK_W / 2 - 0.1), 0.015, 0] }),
        box(0.05, 0.03, DESK_D - 0.08, frameC, { p: [s * (DESK_W / 2 - 0.1), TOP_Y - 0.055, 0] }),
      ]),
      box(DESK_W - 0.24, 0.04, 0.04, frameC, { p: [0, TOP_Y - 0.06, -0.2] }),
      // monitor arm: clamp, post, crossbar
      box(0.08, 0.05, 0.08, frameC, { p: [0, TOP_Y + 0.025, -0.25] }),
      rod([0, TOP_Y, -0.25], [0, ARM_Y + 0.02, -0.25], 0.018, frameC),
      rod([-0.36, ARM_Y, MON_Z - 0.06], [0.36, ARM_Y, MON_Z - 0.06], 0.014, frameC),
      rod([0, ARM_Y + 0.02, -0.25], [0, ARM_Y, MON_Z - 0.06], 0.014, frameC),
      // task lamp: base, two arms, knuckle
      cyl(0.08, 0.085, 0.02, frameC, { p: [LAMP_BASE[0], TOP_Y + 0.01, LAMP_BASE[2]] }, 28),
      rod([LAMP_BASE[0], TOP_Y + 0.02, LAMP_BASE[2]], LAMP_ELBOW, 0.01, frameC),
      rod(LAMP_ELBOW, [LAMP_HEAD[0], LAMP_HEAD[1] + 0.07, LAMP_HEAD[2] - 0.03], 0.01, frameC),
      cyl(0.018, 0.018, 0.034, NEUTRAL.steelLight, { p: LAMP_ELBOW, r: [0, 0, Math.PI / 2] }, 12),
    ];
    const screens = merge([
      ...MONS.map(({ x, ry: r, r: reg }) => {
        const g = atlasPlane(MON_W, MON_H, reg);
        g.rotateY(r).translate(x, ARM_Y, MON_Z);
        return g;
      }),
      (() => {
        const g = atlasPlane(0.072, 0.152, PHONE);
        g.rotateX(-0.22).rotateY(-0.25).translate(0.38 + 0.0, TOP_Y + 0.09, -0.024);
        return g;
      })(),
    ]);
    return { wood: merge(wood), paint: merge(paint), steel: merge(steel), screens };
  }, [accent]);

  const mats = useMemo(() => {
    const wood = MATERIALS.wood();
    const paint = MATERIALS.paint({ color: "#ffffff" });
    paint.vertexColors = true;
    const steel = MATERIALS.paintLight({ color: "#ffffff" });
    steel.vertexColors = true;
    steel.roughness = 0.6;
    steel.metalness = 0.2;
    const screens = new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(0.8, 0.8, 0.8), toneMapped: false });
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(WARM).multiplyScalar(GLOW.hot), toneMapped: false });
    const pool = new THREE.MeshBasicMaterial({
      map: getPuckTex(),
      color: WARM,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lining = new THREE.MeshBasicMaterial({ color: new THREE.Color(WARM).multiplyScalar(GLOW.trim * 0.8), side: THREE.BackSide, toneMapped: false });
    const shade = new THREE.MeshBasicMaterial({ map: getPuckTex(), color: NEUTRAL.void, transparent: true, opacity: 0.4, depthWrite: false });
    const foot = new THREE.MeshBasicMaterial({ map: getPuckTex(), color: NEUTRAL.void, transparent: true, opacity: 0.6, depthWrite: false });
    return { wood, paint, steel, screens, bulb, pool, lining, shade, foot };
  }, [atlas]);

  useEffect(() => () => Object.values(built).forEach((g) => g.dispose()), [built]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  return (
    <group position={position} rotation-y={ry}>
      <mesh geometry={built.wood} material={mats.wood} />
      <mesh geometry={built.paint} material={mats.paint} />
      <mesh geometry={built.steel} material={mats.steel} />
      <mesh geometry={built.screens} material={mats.screens} />
      {/* lamp bulb (inside the shade, facing down onto the desk) */}
      <group position={LAMP_HEAD} rotation-x={-LAMP_TILT}>
        {/* lit lining inside the open shade + the bulb face */}
        <mesh material={mats.lining}>
          <cylinderGeometry args={[0.033, 0.085, 0.118, 28, 1, true]} />
        </mesh>
        <mesh position-y={-0.02} rotation-x={Math.PI / 2} material={mats.bulb}>
          <circleGeometry args={[0.045, 24]} />
        </mesh>
      </group>
      {/* the warm pool it throws across the walnut (kept on the desktop) */}
      <mesh position={[-0.4, TOP_Y + 0.002, 0.02]} rotation-x={-Math.PI / 2} material={mats.pool} renderOrder={1}>
        <planeGeometry args={[0.9, 0.62]} />
      </mesh>
      {/* grounding: a broad soft shadow under the desk + a tighter, darker
          one under each T-foot, so the frame stands ON the tiles */}
      <mesh position={[0, 0.016, 0]} rotation-x={-Math.PI / 2} material={mats.shade} renderOrder={1}>
        <planeGeometry args={[DESK_W + 0.4, DESK_D + 0.45]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (DESK_W / 2 - 0.1), 0.017, 0]} rotation-x={-Math.PI / 2} material={mats.foot} renderOrder={1}>
          <planeGeometry args={[0.34, DESK_D + 0.22]} />
        </mesh>
      ))}
    </group>
  );
}
