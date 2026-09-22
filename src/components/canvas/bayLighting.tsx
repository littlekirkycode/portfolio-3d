"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { WALL_H, ALCOVE_OPEN_W, ALCOVE_DEPTH, type Room } from "./hallConfig";
import {
  makeDiffuserMaterial,
  makeHaloMaterial,
  makeWashMaterial,
} from "./corridorFx";

/* ── bay light architecture ──────────────────────────────────────────────────
 * The architectural lighting inside each recessed bay, in alcove-local space
 * (opening on the z=0 wall line, room running to -z). Emissive geometry +
 * additive washes only — the real light for the focused bay comes from
 * Walls' BayLightPool (whose spot slot sits exactly under PANEL below, so the
 * visible fixture and the light it casts line up).
 *
 *  - linear ceiling light (housing + diffuser + halo) just inside the opening
 *  - accent cove lines where the ceiling meets the back and side walls, each
 *    with a soft down-wash on the wall below
 *  - an accent base line + up-wash along the back wall's floor edge
 *  - accent corner lines in both back corners
 * ──────────────────────────────────────────────────────────────────────── */

/** Back wall inner face (the kit back wall sits 0.3 past ALCOVE_DEPTH). */
const BACK_Z = -(ALCOVE_DEPTH + 0.3);
/** Niche side wall inner faces (tiles centred on the opening edges, 0.3 thick). */
const SIDE_X = ALCOVE_OPEN_W / 2 - 0.3;
const INNER_W = SIDE_X * 2;
const INNER_D = -BACK_Z;

/** Ceiling light placement — a slim linear fixture just inside the opening.
 *  Up there it frames ABOVE the room label (a mid-room panel sat right behind
 *  the label from the dwell camera and washed it out), and the spot slot in
 *  Walls' BayLightPool hangs here too, so the exhibit gets a front-top key
 *  light instead of rendering its props as silhouettes. */
export const BAY_PANEL = { x: 0, z: -0.72, w: 5.0, d: 0.34 } as const;

const COVE_Y = WALL_H - 0.1;
const CEIL_Y = WALL_H;

// shared geometry (module scope, lazily built — this module is client-only
// but keep construction out of SSR import paths anyway)
let geos: {
  panelHousing: THREE.BoxGeometry;
  panel: THREE.PlaneGeometry;
  halo: THREE.PlaneGeometry;
  coveBack: THREE.BoxGeometry;
  coveSide: THREE.BoxGeometry;
  washBack: THREE.PlaneGeometry;
  washSide: THREE.PlaneGeometry;
  baseWash: THREE.PlaneGeometry;
  corner: THREE.BoxGeometry;
} | null = null;
function getGeos() {
  if (geos) return geos;
  geos = {
    panelHousing: new THREE.BoxGeometry(BAY_PANEL.w + 0.1, 0.05, BAY_PANEL.d + 0.08),
    panel: new THREE.PlaneGeometry(BAY_PANEL.w, BAY_PANEL.d),
    halo: new THREE.PlaneGeometry(BAY_PANEL.w + 1.8, BAY_PANEL.d + 1.0),
    coveBack: new THREE.BoxGeometry(INNER_W - 0.1, 0.045, 0.05),
    coveSide: new THREE.BoxGeometry(0.05, 0.045, INNER_D - 0.1),
    washBack: new THREE.PlaneGeometry(INNER_W - 0.1, 1.6),
    washSide: new THREE.PlaneGeometry(INNER_D - 0.1, 1.3),
    baseWash: new THREE.PlaneGeometry(INNER_W - 0.1, 0.9),
    corner: new THREE.BoxGeometry(0.04, WALL_H - 0.22, 0.04),
  };
  return geos;
}

const PANEL_WHITE = /* @__PURE__ */ new THREE.Color("#fff3e4");

export function BayArchitecture({ room }: { room: Room }) {
  const g = getGeos();
  const mats = useMemo(() => {
    const accent = new THREE.Color(room.accent);
    const panelTint = PANEL_WHITE.clone().lerp(accent, 0.18);
    return {
      housing: new THREE.MeshStandardMaterial({ color: "#161a25", roughness: 0.45, metalness: 0.7 }),
      panel: makeDiffuserMaterial(panelTint, 1.6, BAY_PANEL.w / BAY_PANEL.d),
      halo: makeHaloMaterial(panelTint, 0.24),
      line: new THREE.MeshBasicMaterial({
        color: accent.clone().multiplyScalar(1.25),
        toneMapped: false,
      }),
      corner: new THREE.MeshBasicMaterial({
        color: accent.clone().multiplyScalar(0.75),
        toneMapped: false,
      }),
      washTop: makeWashMaterial(accent, 0.34),
      washSide: makeWashMaterial(accent, 0.24),
      washBase: makeWashMaterial(accent, 0.26),
    };
  }, [room.accent]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const cz = BACK_Z / 2; // side-wall midpoint
  return (
    <group>
      {/* linear ceiling light */}
      <mesh geometry={g.panelHousing} material={mats.housing} position={[BAY_PANEL.x, CEIL_Y - 0.03, BAY_PANEL.z]} />
      <mesh
        geometry={g.panel}
        material={mats.panel}
        position={[BAY_PANEL.x, CEIL_Y - 0.057, BAY_PANEL.z]}
        rotation-x={Math.PI / 2}
      />
      <mesh
        geometry={g.halo}
        material={mats.halo}
        position={[BAY_PANEL.x, CEIL_Y - 0.006, BAY_PANEL.z]}
        rotation-x={Math.PI / 2}
      />

      {/* accent cove at the ceiling line: back + both sides, each washing down */}
      <mesh geometry={g.coveBack} material={mats.line} position={[0, COVE_Y, BACK_Z + 0.035]} />
      <mesh geometry={g.washBack} material={mats.washTop} position={[0, COVE_Y - 0.8, BACK_Z + 0.012]} />
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <mesh geometry={g.coveSide} material={mats.line} position={[s * (SIDE_X - 0.035), COVE_Y, cz]} />
          <mesh
            geometry={g.washSide}
            material={mats.washSide}
            position={[s * (SIDE_X - 0.012), COVE_Y - 0.65, cz]}
            rotation-y={-s * (Math.PI / 2)}
          />
          {/* back-corner accent lines */}
          <mesh geometry={g.corner} material={mats.corner} position={[s * (SIDE_X - 0.03), (WALL_H - 0.22) / 2 + 0.05, BACK_Z + 0.03]} />
        </group>
      ))}

      {/* base line along the back wall's floor edge, washing up the wall */}
      <mesh geometry={g.coveBack} material={mats.line} position={[0, 0.045, BACK_Z + 0.035]} />
      <mesh
        geometry={g.baseWash}
        material={mats.washBase}
        position={[0, 0.5, BACK_Z + 0.012]}
        rotation-z={Math.PI}
      />
    </group>
  );
}
