"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useKitPiece } from "./ModelLoader";
import {
  PACK_SCALE,
  TILE,
  HALF_W,
  WALL_Z,
  WALL_H,
  FLOOR_Y,
  CEIL_Y,
  ALCOVE_OPEN_W,
  ALCOVE_DEPTH,
  WALL_START,
  WALL_END,
  ROOMS,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
  FEATURE_X,
  FEATURE_RECESS_DEPTH,
} from "./hallConfig";

/** Wall front-normal orientation. Kit walls are authored facing +Z; flip to PI
 *  if a verification screenshot shows them facing outward. */
const WALL_FACE = 0;

type Inst = { p: [number, number, number]; r: [number, number, number] };

/** Half-width (in columns × TILE) of the showreel recess cut — 3 columns spans
 *  the casing (FW 4.8 + trim) with a jamb margin either side (Lobby dresses it). */
const FEATURE_CUT_HALF = TILE * 1.5;

/** Double-height atrium over the entrance lobby: the ~5 tile columns ending at
 *  FEATURE_X + 4 lose their ceiling and gain a third (clerestory) wall row. */
const ATRIUM_C = FEATURE_X - TILE; // centre column of the 5-column run
const inAtrium = (x: number) => Math.abs(x - ATRIUM_C) < TILE * 2.5;

/** Build every shell tile transform (corridor + niches) once, grouped by mesh.
 *  Wall rows split by height: the ground row keeps the shell tone, everything
 *  at y ≥ TILE goes to `wallsUpper` (darkened toward black — see InstancedTiles). */
function buildShell(): { walls: Inst[]; wallsUpper: Inst[]; floors: Inst[] } {
  const walls: Inst[] = [];
  const wallsUpper: Inst[] = [];
  const floors: Inst[] = []; // floor tiles + (flipped) ceiling tiles share one geo

  const pushWall = (p: [number, number, number], r: [number, number, number]) =>
    (p[1] >= TILE ? wallsUpper : walls).push({ p, r });

  // X columns spanning the whole hall
  const cols: number[] = [];
  const nCols = Math.ceil((WALL_END - WALL_START) / TILE);
  for (let i = 0; i < nCols; i++) cols.push(WALL_START + TILE * (i + 0.5));
  const zc = [-3, -1, 1, 3]; // corridor floor lanes (cover ±4 = ±WALL_Z)
  const yRows = [0, TILE]; // two wall rows → WALL_H

  const floorCeil = (x: number, z: number, skipCeil = false) => {
    floors.push({ p: [x, FLOOR_Y, z], r: [0, 0, 0] });
    if (!skipCeil) floors.push({ p: [x, CEIL_Y, z], r: [Math.PI, 0, 0] }); // flipped → ceiling
  };

  // corridor floor + ceiling (the atrium run is open — no ceiling tiles)
  for (const x of cols) for (const z of zc) floorCeil(x, z, inAtrium(x));

  // corridor side walls — skip each room's opening on its own side, the gallery
  // glazing cut on the +z wall, and the showreel recess columns at FEATURE_X
  for (const side of [-1, 1] as const) {
    const z = side * WALL_Z;
    const ry = WALL_FACE + (side < 0 ? 0 : Math.PI);
    for (const x of cols) {
      const bay =
        ROOMS.some((r) => r.side === side && Math.abs(x - r.x) < ALCOVE_OPEN_W / 2) ||
        (side === GALLERY_SIDE && Math.abs(x - GALLERY_X) < GALLERY_SPAN / 2);
      const feat = side === 1 && Math.abs(x - FEATURE_X) < FEATURE_CUT_HALF;
      if (!bay && !feat) for (const y of yRows) pushWall([x, y, z], [0, ry, 0]);
      // atrium clerestory row — kept even over the showreel recess (whose back
      // wall is only two rows tall) so the raised rim runs unbroken
      if (!bay && inAtrium(x)) pushWall([x, 2 * TILE, z], [0, ry, 0]);
    }
  }

  // showreel recess (+z): rebuild the cut columns half a tile further out so the
  // screen sits in a shallow apse. FeatureScreen positions its glass with the
  // same FEATURE_RECESS_DEPTH; Lobby dresses the jambs/hood.
  for (const x of cols) {
    if (Math.abs(x - FEATURE_X) >= FEATURE_CUT_HALF) continue;
    for (const y of yRows)
      pushWall([x, y, WALL_Z + FEATURE_RECESS_DEPTH], [0, WALL_FACE + Math.PI, 0]);
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
    for (const x of xcols) for (const y of yRows) pushWall([x, y, backZ], [0, backRy, 0]);

    // side walls at the opening edges (face inward toward room centre x)
    for (const z of zslots) {
      for (const y of yRows) {
        pushWall([room.x - half, y, z], [0, WALL_FACE + Math.PI / 2, 0]);
        pushWall([room.x + half, y, z], [0, WALL_FACE - Math.PI / 2, 0]);
      }
    }
  }

  return { walls, wallsUpper, floors };
}

function InstancedTiles({
  piece,
  instances,
  upper = false,
}: {
  piece: "kit-wall" | "kit-floor";
  instances: Inst[];
  upper?: boolean;
}) {
  const { geometry, material } = useKitPiece(piece);
  // Darken + cool the shared kit atlas material: the raw colormap reads as
  // washed-out pale lavender under the hall lights; multiplying it down makes
  // the shell sit as deep blue-grey steel and lets panel seams read. Floors
  // (and ceilings) face the down-lights head-on so they need a deeper cut than
  // the walls to sit in the same moody band. Cloned so the source GLB material
  // (reused by non-shell props) is untouched.
  const shellMaterial = useMemo(() => {
    const m = material.clone();
    if (m instanceof THREE.MeshStandardMaterial) {
      const k = piece === "kit-floor" ? 0.6 : 0.78;
      m.color.multiplyScalar(k).multiply(new THREE.Color("#dfe6f7"));
      // UPPER wall rows fall toward true black (#0d0f16) so the ceiling zone
      // reads near-black — "dark ship, lit exhibits" colourist direction.
      if (upper) m.color.lerp(new THREE.Color("#0d0f16"), 0.62);
    }
    return m;
  }, [material, piece, upper]);
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
      args={[geometry, shellMaterial, instances.length]}
      frustumCulled={false}
    />
  );
}

/** The cohesive sci-fi corridor + recessed bays, tiled from the Kenney kit and
 *  drawn in three instanced meshes (ground walls, darkened upper walls,
 *  floor/ceiling) plus two flat atrium closure bands. */
export default function KitShell() {
  const { walls, wallsUpper, floors } = useMemo(() => buildShell(), []);
  return (
    <group>
      <InstancedTiles piece="kit-wall" instances={walls} />
      <InstancedTiles piece="kit-wall" instances={wallsUpper} upper />
      <InstancedTiles piece="kit-floor" instances={floors} />
      {/* atrium upper band — flat near-black closure above the clerestory row so
          the open (ceiling-less) entrance top reads as a tall dark void, not a
          hole in the shell. Unlit on purpose: it must sit at true black. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          position={[ATRIUM_C, WALL_H + TILE + 1.5, side * (HALF_W + 0.02)]}
          rotation-y={side < 0 ? 0 : Math.PI}
        >
          <planeGeometry args={[TILE * 5 + 0.4, 3]} />
          <meshBasicMaterial color="#0d0f16" />
        </mesh>
      ))}
    </group>
  );
}
