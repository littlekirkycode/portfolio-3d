"use client";

import * as THREE from "three";
import { GLOW, NEUTRAL, tintNeutral } from "../../theme";
import { FACE_W, atlasPlane, rackUnits, type Region } from "./atlas";
import { box, matrixOf, plane, rod, tube, withMatrix } from "./geo";

/* ── Capabilities: the room's shell, authored ────────────────────────────────
 * The bare back wall read as the brightest surface in the bay (a pale,
 * lavender-lit slab behind the hero). It is clad here as a machine-room
 * service wall: dark reveals, a darker service tier with louvre grilles under
 * a steel rail, an upper field of cool steel panels, a kick plinth whose top
 * edge is a steel-cyan cove, and — desktop only — a cable tray across the top
 * with its own cyan under-cove, fed by a riser from the left-wall ladder. The
 * same cyan line language now runs round the whole room (left ladder cove →
 * riser → back tray → base cove) instead of stopping at the racks.
 * Everything is merged into the room's existing material groups. */

export const WALL_Z = -1.85;
const X0 = -3.69;
const X1 = 3.69;
const WW = X1 - X0;
const PANELS = 12;
const PW = WW / PANELS;
const KICK = 0.14;
const RAIL_Y = 1.02;
const TOP_Y = 3.92;
/** Back cable tray (desktop). */
export const TRAY_Y = 3.36;
const TRAY_Z = WALL_Z + 0.2;

export type WallOut = {
  paint: THREE.BufferGeometry[];
  steel: THREE.BufferGeometry[];
  emit: THREE.BufferGeometry[];
  rubber: THREE.BufferGeometry[];
  /** additive vertical-gradient glows: rising (bottom-lit) */
  rise: THREE.BufferGeometry[];
  /** additive vertical-gradient glows: falling (top-lit) */
  fall: THREE.BufferGeometry[];
};

export function backWallParts(cool: string, mobile: boolean): WallOut {
  const coolC = new THREE.Color(cool);
  // cladding plane: 16 mm proud of the wall face, so it sits IN FRONT of the
  // shell's own lavender wall washes (BACK_Z + 0.012) and hides them, yet
  // stays inside the hero fixture's 50 mm wall standoff
  const CZ = WALL_Z + 0.016;
  const reveal = "#0f1219";
  const field = tintNeutral("#262d3a", cool, 0.1);
  const fieldAlt = tintNeutral("#222834", cool, 0.1);
  const service = tintNeutral("#191d27", cool, 0.08);
  const grille = NEUTRAL.hullShadow;
  const slat = tintNeutral("#4a5468", cool, 0.08);

  const paint: THREE.BufferGeometry[] = [
    // dark backer: the reveals between panels read as shadow lines, never the wall
    box(WW, TOP_Y, 0.004, reveal, { p: [0, TOP_Y / 2, CZ + 0.002] }),
    // kick plinth
    box(WW, KICK, 0.04, NEUTRAL.hullShadow, { p: [0, KICK / 2, CZ + 0.02] }),
  ];
  const steel: THREE.BufferGeometry[] = [
    // steel chair rail dividing the service tier from the field
    box(WW, 0.03, 0.03, NEUTRAL.steel, { p: [0, RAIL_Y, CZ + 0.02] }),
    // top closer
    box(WW, 0.03, 0.03, NEUTRAL.steel, { p: [0, TOP_Y - 0.1, CZ + 0.02] }),
  ];
  for (let k = 0; k < PANELS; k++) {
    const x = X0 + (k + 0.5) * PW;
    // service tier: darker, every other panel a louvre grille
    const sh = RAIL_Y - KICK - 0.04;
    paint.push(box(PW - 0.016, sh, 0.012, service, { p: [x, KICK + 0.01 + sh / 2, CZ + 0.01] }));
    if (k % 2 === 1) {
      paint.push(box(PW - 0.16, sh - 0.22, 0.004, grille, { p: [x, KICK + 0.01 + sh / 2, CZ + 0.018] }));
      for (let s = 0; s < 7; s++) paint.push(box(PW - 0.18, 0.018, 0.012, slat, { p: [x, KICK + 0.16 + s * ((sh - 0.3) / 6), CZ + 0.022], r: [-0.5, 0, 0] }));
    }
    // upper field: tall steel panels, alternating tone so the wall has grain
    const fh = TOP_Y - 0.05 - RAIL_Y - 0.02;
    paint.push(box(PW - 0.016, fh, 0.012, k % 3 === 1 ? fieldAlt : field, { p: [x, RAIL_Y + 0.02 + fh / 2, CZ + 0.01] }));
    // one fastener pair per panel, top and bottom (steel)
    for (const y of [RAIL_Y + 0.1, TOP_Y - 0.14]) {
      steel.push(box(0.018, 0.018, 0.006, NEUTRAL.steelLight, { p: [x - PW / 2 + 0.05, y, CZ + 0.019] }));
      steel.push(box(0.018, 0.018, 0.006, NEUTRAL.steelLight, { p: [x + PW / 2 - 0.05, y, CZ + 0.019] }));
    }
  }

  // base cove: the top edge of the plinth, the length of the wall
  const emit: THREE.BufferGeometry[] = [
    box(WW - 0.1, 0.012, 0.012, coolC.clone().multiplyScalar(GLOW.trim), { p: [0, KICK + 0.004, CZ + 0.044] }),
  ];
  const rise: THREE.BufferGeometry[] = [plane(WW - 0.2, 1.25, "#ffffff", { p: [0, KICK + 0.62, CZ + 0.03] })];
  const fall: THREE.BufferGeometry[] = [];
  const rubber: THREE.BufferGeometry[] = [];

  if (!mobile) {
    // back cable tray across the top of the wall
    const L = WW - 0.12;
    steel.push(
      box(L, 0.06, 0.02, NEUTRAL.steel, { p: [0, TRAY_Y, TRAY_Z + 0.15] }),
      box(L, 0.06, 0.02, NEUTRAL.steel, { p: [0, TRAY_Y, TRAY_Z - 0.15] }),
    );
    for (let x = X0 + 0.2; x < X1 - 0.1; x += 0.26) steel.push(box(0.025, 0.012, 0.3, NEUTRAL.steel, { p: [x, TRAY_Y - 0.024, TRAY_Z] }));
    // trapeze hangers: a strut under the tray on two threaded drops to the ceiling
    for (let x = X0 + 0.6; x < X1; x += 1.2) {
      steel.push(box(0.03, 0.03, 0.36, NEUTRAL.steel, { p: [x, TRAY_Y - 0.05, TRAY_Z] }));
      for (const dz of [-0.17, 0.17]) steel.push(rod([x, TRAY_Y - 0.05, TRAY_Z + dz], [x, 4.0, TRAY_Z + dz], 0.007, NEUTRAL.steel, 6));
    }
    // looms in the tray
    const loom = tintNeutral(NEUTRAL.rubber, cool, 0.06);
    for (const o of [-0.07, 0, 0.07]) rubber.push(tube([[X0 + 0.25, TRAY_Y - 0.005, TRAY_Z + o], [0, TRAY_Y - 0.005, TRAY_Z + o * 1.15], [X1 - 0.1, TRAY_Y - 0.005, TRAY_Z + o]], 0.015, loom));
    // riser in the back-left corner: left-wall ladder (y 2.46) up to the back tray
    const RX = -3.44;
    const RZ = WALL_Z + 0.16;
    steel.push(
      box(0.02, TRAY_Y - 2.4, 0.06, NEUTRAL.steel, { p: [RX - 0.16, (TRAY_Y + 2.4) / 2, RZ] }),
      box(0.02, TRAY_Y - 2.4, 0.06, NEUTRAL.steel, { p: [RX + 0.16, (TRAY_Y + 2.4) / 2, RZ] }),
    );
    for (let y = 2.5; y < TRAY_Y; y += 0.2) steel.push(box(0.32, 0.025, 0.012, NEUTRAL.steel, { p: [RX, y, RZ - 0.02] }));
    for (const o of [-0.06, 0, 0.06]) rubber.push(tube([[RX + o, 2.46, -1.3], [RX + o, 2.5, RZ + 0.02], [RX + o, (TRAY_Y + 2.46) / 2, RZ - 0.01], [RX + o * 0.8, TRAY_Y - 0.02, RZ - 0.01], [RX + 0.3, TRAY_Y - 0.005, TRAY_Z + o]], 0.014, loom));
    // under-cove on the tray's front rail + its light falling down the wall
    emit.push(box(L - 0.1, 0.008, 0.012, coolC.clone().multiplyScalar(GLOW.trim), { p: [0, TRAY_Y - 0.036, TRAY_Z + 0.14] }));
    // (turned 180° about z so the ramp's bright end sits at the top)
    fall.push(plane(WW - 0.3, 0.9, "#ffffff", { p: [0, TRAY_Y - 0.48, CZ + 0.03], r: [0, 0, Math.PI] }));
  }
  return { paint, steel, emit, rubber, rise, fall };
}

/* ── the field kit: a portable 4U road case on the front-right floor ──────────
 * Front cover off and leaning against its flank; inside, a patch panel over a
 * rack UPS — generic hardware painted from the same atlas as the cabinets.
 * Kept under 0.42 m so it stays below the info panel's bottom edge on screen. */
const RC_FACE_W = 0.44;
const RC_PX = RC_FACE_W / FACE_W;

export function roadCaseParts(cool: string, p: [number, number, number], ry: number) {
  const units = rackUnits(0);
  const patch = units.find((u) => u.kind === "patch")!;
  const ups = units.find((u) => u.kind === "ups")!;
  const faces: { r: Region; h: number }[] = [
    { r: { x: 0, y: patch.y, w: FACE_W, h: patch.h }, h: patch.h * RC_PX },
    { r: { x: 0, y: ups.y, w: FACE_W, h: ups.h }, h: ups.h * RC_PX },
  ];
  const FH = faces.reduce((s, f) => s + f.h, 0);
  const W = RC_FACE_W + 0.1;
  const D = 0.46;
  const SK = 0.025; // skids
  const H = FH + 0.07;
  const shell = "#1a1e28";
  const alu = NEUTRAL.steel;
  const edge = "#4d5669"; // low-contrast extrusions: bright thin edges alias into dashes

  const paint: THREE.BufferGeometry[] = [
    // shell (laminate ply) with the recessed rack opening
    box(W, H, D, shell, { p: [0, SK + H / 2, -D / 2] }),
    box(RC_FACE_W + 0.02, FH + 0.02, 0.01, NEUTRAL.hullShadow, { p: [0, SK + H / 2, 0.001] }),
    // skids
    box(0.06, SK, D - 0.04, NEUTRAL.rubber, { p: [-W / 2 + 0.06, SK / 2, -D / 2] }),
    box(0.06, SK, D - 0.04, NEUTRAL.rubber, { p: [W / 2 - 0.06, SK / 2, -D / 2] }),
  ];
  const steel: THREE.BufferGeometry[] = [];
  // aluminium edge extrusions on the front frame + back frame + four long edges
  // (no bottom rail on the front frame: its lit top face was a sub-pixel
  // ledge that aliased into a dashed white line at dwell distance)
  for (const z of [0.004, -D + 0.004]) {
    steel.push(box(W + 0.02, 0.03, 0.03, edge, { p: [0, SK + H - 0.01, z] }));
    if (z < 0) steel.push(box(W + 0.02, 0.03, 0.03, edge, { p: [0, SK + 0.01, z] }));
    steel.push(
      box(0.03, H, 0.03, edge, { p: [-W / 2, SK + H / 2, z] }),
      box(0.03, H, 0.03, edge, { p: [W / 2, SK + H / 2, z] }),
    );
  }
  for (const sx of [-1, 1]) for (const y of [SK + 0.01, SK + H - 0.01]) steel.push(box(0.03, 0.03, D, edge, { p: [sx * (W / 2), y, -D / 2] }));
  // ball corners
  for (const sx of [-1, 1]) for (const y of [SK + 0.012, SK + H - 0.012]) steel.push(box(0.036, 0.036, 0.036, alu, { p: [sx * (W / 2), y, 0.004] }));
  // rack rails inside the opening
  steel.push(box(0.018, FH, 0.01, NEUTRAL.steel, { p: [-RC_FACE_W / 2 + 0.009, SK + H / 2, 0.004] }));
  steel.push(box(0.018, FH, 0.01, NEUTRAL.steel, { p: [RC_FACE_W / 2 - 0.009, SK + H / 2, 0.004] }));
  // recessed side handle + two butterfly latches on the top
  steel.push(box(0.006, 0.05, 0.14, alu, { p: [W / 2 + 0.006, SK + H * 0.6, -D / 2] }));
  for (const sx of [-1, 1]) steel.push(box(0.06, 0.008, 0.05, alu, { p: [sx * 0.14, SK + H + 0.004, -0.06] }));

  // the removed front cover, leaning against the left flank
  const LW = W;
  const LH = H;
  const cover = new THREE.Matrix4().compose(
    new THREE.Vector3(-W / 2 - 0.05, SK, -0.12),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + 0.35, -0.22, "YXZ")),
    new THREE.Vector3(1, 1, 1),
  );
  const coverParts = [box(LW, LH, 0.05, shell, { p: [0, LH / 2, 0] })];
  const coverSteel = [
    box(LW + 0.012, 0.02, 0.056, edge, { p: [0, LH - 0.01, 0] }),
    box(LW + 0.012, 0.02, 0.056, edge, { p: [0, 0.01, 0] }),
    box(0.02, LH, 0.056, edge, { p: [-LW / 2, LH / 2, 0] }),
    box(0.02, LH, 0.056, edge, { p: [LW / 2, LH / 2, 0] }),
  ];
  paint.push(...withMatrix(coverParts, cover));
  steel.push(...withMatrix(coverSteel, cover));

  const emit: THREE.BufferGeometry[] = [];

  const labels: THREE.BufferGeometry[] = [];
  let y = SK + H / 2 + FH / 2;
  for (const f of faces) {
    const g = atlasPlane(RC_FACE_W - 0.02, f.h - 0.004, f.r);
    g.translate(0, y - f.h / 2, 0.009);
    labels.push(g);
    y -= f.h;
  }
  // soft contact shadow
  const shade = [plane(W + 0.5, D + 0.45, "#ffffff", { p: [-0.08, 0.009, -D / 2], r: [-Math.PI / 2, 0, 0] })];

  const m = matrixOf(p, ry);
  return {
    paint: withMatrix(paint, m),
    steel: withMatrix(steel, m),
    emit: withMatrix(emit, m),
    labels: withMatrix(labels, m),
    shade: withMatrix(shade, m),
  };
}

/** Shared 32×64 vertical alpha ramp (soft ends) for the wall glows (not a canvas). */
let _ramp: THREE.DataTexture | null = null;
export function getRampTex() {
  if (_ramp) return _ramp;
  const n = 64;
  const M = 32;
  const data = new Uint8Array(n * M * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0 = bottom row (v=0)
    const a = Math.pow(1 - t, 2.2) * (1 - Math.pow(1 - Math.min(1, t * 12), 2) * 0.35);
    for (let j = 0; j < M; j++) {
      // ends fade over the outer ~12% so a long glow never stops on a hard edge
      const e = Math.min(1, Math.min(j + 0.5, M - j - 0.5) / (M * 0.12));
      data.set([255, 255, 255, Math.round(a * e * e * (3 - 2 * e) * 255)], (i * M + j) * 4);
    }
  }
  _ramp = new THREE.DataTexture(data, M, n, THREE.RGBAFormat);
  _ramp.magFilter = THREE.LinearFilter;
  _ramp.minFilter = THREE.LinearFilter;
  _ramp.needsUpdate = true;
  return _ramp;
}
