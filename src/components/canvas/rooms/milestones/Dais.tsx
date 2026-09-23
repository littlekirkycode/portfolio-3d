"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FameMats } from "./kit";

/* ── the ceremony dais ───────────────────────────────────────────────────────
 * A low round stage of dark honed stone, laid over the bay's round accent mat
 * (MAT_SPECS.trophy: r 1.7 at room-local z 0.15) and its painted laurel arcs.
 * Read from the dwell camera the old mat was a full saturated gold ellipse —
 * a vinyl decal. The dais replaces it with stone and keeps the gold to two
 * thin brass lines: a chamfered brass edge band and one inlay ring. It also
 * gives the podium a real plinth to stand on, so the hero reads as staged. */

export const DAIS_R = 1.82;
export const DAIS_H = 0.07;
/** room-local centre of the bay mat it sits over */
export const DAIS_Z = 0.15;

export function Dais({ m }: { m: FameMats }) {
  const g = useMemo(
    () => ({
      // stone drum, very slightly tapered so the brass band catches light
      drum: new THREE.CylinderGeometry(DAIS_R, DAIS_R + 0.012, DAIS_H - 0.012, 96, 1),
      // brass edge band round the top arris
      band: new THREE.CylinderGeometry(DAIS_R + 0.006, DAIS_R + 0.006, 0.014, 96, 1, true),
      // one thin brass inlay ring, flush in the top
      inlay: new THREE.RingGeometry(DAIS_R - 0.2, DAIS_R - 0.18, 128),
      // recessed shadow reveal at the foot (reads as a floating stone slab)
      reveal: new THREE.CylinderGeometry(DAIS_R - 0.03, DAIS_R - 0.03, 0.012, 96, 1),
    }),
    [],
  );
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return (
    <group position-z={DAIS_Z}>
      <mesh geometry={g.reveal} material={m.lacquerDeep} position-y={0.006} />
      <mesh geometry={g.drum} material={m.dais} position-y={0.012 + (DAIS_H - 0.012) / 2} />
      <mesh geometry={g.band} material={m.brass} position-y={DAIS_H - 0.007} />
      <mesh geometry={g.inlay} material={m.brass} rotation-x={-Math.PI / 2} position-y={DAIS_H + 0.0015} />
    </group>
  );
}
