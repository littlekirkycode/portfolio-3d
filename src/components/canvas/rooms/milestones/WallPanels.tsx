"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FameMats } from "./kit";

/* ── gallery wall dressing for the left wall ─────────────────────────────────
 * Just a brass picture rail with its shadow line, the way a gallery wall is
 * dressed above hung pieces. (A lacquered backdrop panel used to sit behind
 * the two exhibits; from the dwell camera it read as a blank banner or a door
 * and crowded the left column, so the wall stays clean below the rail.)
 * Local frame (mounted with rotation-y = +π/2 on the LEFT wall): y up, +z out
 * of the wall into the room, local +x runs toward the BACK wall (room −z). */

const RAIL_Y = 2.62;

export function WallPanels({ m, length = 4.1, start = -2.25 }: { m: FameMats; length?: number; start?: number }) {
  const g = useMemo(
    () => ({
      rail: new THREE.BoxGeometry(length, 0.026, 0.028).translate(start + length / 2, RAIL_Y, 0.014),
      railShadow: new THREE.BoxGeometry(length, 0.05, 0.012).translate(start + length / 2, RAIL_Y - 0.03, 0.006),
    }),
    [length, start],
  );
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return (
    <group>
      <mesh geometry={g.rail} material={m.brass} />
      <mesh geometry={g.railShadow} material={m.lacquerDeep} />
    </group>
  );
}
