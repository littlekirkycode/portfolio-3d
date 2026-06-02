"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useKitPiece } from "./ModelLoader";
import {
  PACK_SCALE,
  TILE,
  WALL_Z,
  WALL_H,
  FLOOR_Y,
  CEIL_Y,
  ALCOVE_OPEN_W,
  ALCOVE_DEPTH,
  WALL_START,
  WALL_END,
  ROOMS,
} from "./hallConfig";

/** Wall front-normal orientation. Kit walls are authored facing +Z; flip to PI
 *  if a verification screenshot shows them facing outward. */
const WALL_FACE = 0;

type Inst = { p: [number, number, number]; r: [number, number, number] };

/** Build every shell tile transform (corridor + niches) once, grouped by mesh. */
function buildShell(): { walls: Inst[]; floors: Inst[] } {
  const walls: Inst[] = [];
  const floors: Inst[] = []; // floor tiles + (flipped) ceiling tiles share one geo

  // X columns spanning the whole hall
  const cols: number[] = [];
  const nCols = Math.ceil((WALL_END - WALL_START) / TILE);
  for (let i = 0; i < nCols; i++) cols.push(WALL_START + TILE * (i + 0.5));
  const zc = [-3, -1, 1, 3]; // corridor floor lanes (cover ±4 = ±WALL_Z)
  const yRows = [0, TILE]; // two wall rows → WALL_H

  const floorCeil = (x: number, z: number) => {
    floors.push({ p: [x, FLOOR_Y, z], r: [0, 0, 0] });
    floors.push({ p: [x, CEIL_Y, z], r: [Math.PI, 0, 0] }); // flipped → ceiling
  };

  // corridor floor + ceiling
  for (const x of cols) for (const z of zc) floorCeil(x, z);

  // corridor side walls (skip each room's opening on its own side)
  for (const side of [-1, 1] as const) {
    const z = side * WALL_Z;
    const ry = WALL_FACE + (side < 0 ? 0 : Math.PI);
    for (const x of cols) {
      const blocked = ROOMS.some(
        (r) => r.side === side && Math.abs(x - r.x) < ALCOVE_OPEN_W / 2,
      );
      if (blocked) continue;
      for (const y of yRows) walls.push({ p: [x, y, z], r: [0, ry, 0] });
    }
  }

  // recessed niches
  for (const room of ROOMS) {
    const side = room.side;
    const half = ALCOVE_OPEN_W / 2;
    const xcols: number[] = [];
    const nx = Math.round(ALCOVE_OPEN_W / TILE);
    for (let i = 0; i < nx; i++) xcols.push(room.x - half + TILE * (i + 0.5));
    const zslots: number[] = [];
    const nz = Math.round(ALCOVE_DEPTH / TILE);
    for (let i = 0; i < nz; i++) zslots.push(side * (WALL_Z + TILE * (i + 0.5)));

    // niche floor + ceiling
    for (const x of xcols) for (const z of zslots) floorCeil(x, z);

    // back wall (faces the corridor, like the corridor wall on that side)
    const backZ = side * (WALL_Z + ALCOVE_DEPTH + 0.3);
    const backRy = WALL_FACE + (side < 0 ? 0 : Math.PI);
    for (const x of xcols) for (const y of yRows) walls.push({ p: [x, y, backZ], r: [0, backRy, 0] });

    // side walls at the opening edges (face inward toward room centre x)
    for (const z of zslots) {
      for (const y of yRows) {
        walls.push({ p: [room.x - half, y, z], r: [0, WALL_FACE + Math.PI / 2, 0] });
        walls.push({ p: [room.x + half, y, z], r: [0, WALL_FACE - Math.PI / 2, 0] });
      }
    }
  }

  return { walls, floors };
}

function InstancedTiles({
  piece,
  instances,
}: {
  piece: "kit-wall" | "kit-floor";
  instances: Inst[];
}) {
  const { geometry, material } = useKitPiece(piece);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(PACK_SCALE, PACK_SCALE, PACK_SCALE);
    const p = new THREE.Vector3();
    instances.forEach((it, i) => {
      e.set(it.r[0], it.r[1], it.r[2]);
      q.setFromEuler(e);
      p.set(it.p[0], it.p[1], it.p[2]);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances, geometry]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, instances.length]}
      frustumCulled={false}
    />
  );
}

/** The cohesive sci-fi corridor + recessed bays, tiled from the Kenney kit and
 *  drawn in two instanced meshes (walls, floor/ceiling). */
export default function KitShell() {
  const { walls, floors } = useMemo(buildShell, []);
  return (
    <group>
      <InstancedTiles piece="kit-wall" instances={walls} />
      <InstancedTiles piece="kit-floor" instances={floors} />
    </group>
  );
}
