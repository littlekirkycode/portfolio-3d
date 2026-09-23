"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SKILLS } from "@/lib/constants";
import { GLOW, MATERIALS, NEUTRAL, tintNeutral } from "../theme";
import { getPuckTex } from "./shared";
import { FACE_H, FACE_W, HEAD_PX, VENT, atlasPlane, coolOf, rackRegion, rackUnits } from "./capabilities/atlas";
import { box, matrixOf, merge, plane, rod, tube, withMatrix } from "./capabilities/geo";
import { backWallParts, getRampTex, roadCaseParts } from "./capabilities/wall";

/* ── Capabilities: the stack as racked production hardware ───────────────────
 * One 19" cabinet per SKILLS group (01 Mobile → 04 Tools, reading left→right
 * from the dwell camera): three full cabinets and a half-height network
 * cabinet closing the row. Each is built for real — side panels with louvred
 * vents, a top cap with a cool light bar, machined edge highlights, steel
 * rails, and a unit stack (patch panel, a 2U server + 1U units per
 * technology, cable manager, growth blanks, UPS) whose faceplates are painted
 * into the bay's one shared atlas from the SAME layout the geometry uses.
 * A perforated cold-aisle tile in front of each cabinet is where the cool
 * light comes from; a cable ladder along the wall feeds every cabinet top.
 *
 * Phones never see the left wall, so on mobile the row is replaced by four
 * wall-mount enclosures flanking the terminal above the stacked info card.
 *
 * Every part is merged per material: the whole row is seven draw calls.
 * Nothing animates. */

// cabinet dims (local: front face at z=0, body toward −z, origin on the floor)
const RW = 0.62;
const RD = 0.48;
const PL = 0.08; // plinth
const SIDE = 0.03;
const TOP = 0.07;
const IN_W = RW - SIDE * 2; // 0.58
const LBL_W = 0.55;
const PX = LBL_W / FACE_W; // metres per atlas px
const faceH = (i: number) => FACE_H[i] * PX;
const rackH = (i: number) => faceH(i) + 0.28;

/** Sawtooth along the left wall; index 0 at the FRONT so 01→04 reads L→R.
 *  Turned 69° off the opening, stepped 8 cm into the room and 0.95 m back per
 *  cabinet: a top-down occlusion solve from the dwell camera (room-local
 *  ≈ (0±0.3, 1.62, 6.15)) shows every face fully clear of the one in front. */
const RACK_RY = 1.2;
const RACK_X0 = -3.7 + (RW / 2) * Math.cos(RACK_RY) + RD * Math.sin(RACK_RY) + 0.02;
const RACKS = [0, 1, 2, 3].map((i) => ({ x: RACK_X0 + i * 0.08, z: 1.8 - i * 0.95, ry: RACK_RY }));

/** Machined highlight used on every cabinet edge so the bodies read against
 *  the dark aisle instead of merging into it. */
const EDGE = "#8e98ad";

function rackParts(i: number, accent: string) {
  const cool = new THREE.Color(coolOf(accent));
  const RH = rackH(i);
  const LBL_H = faceH(i);
  const LBL_Y = PL + 0.06 + LBL_H / 2;
  const LBL_TOP = LBL_Y + LBL_H / 2;
  const body = tintNeutral("#3b4357", coolOf(accent), 0.07);
  const cap = tintNeutral("#5b667d", coolOf(accent), 0.06);
  const blade = tintNeutral("#384055", accent, 0.05);
  const blank = tintNeutral("#4a5468", accent, 0.05);
  const shadow = NEUTRAL.hullShadow;

  const paint: THREE.BufferGeometry[] = [
    // plinth (recessed kick plate)
    box(RW - 0.06, PL, RD - 0.06, shadow, { p: [0, PL / 2, -RD / 2] }),
    // side panels + top cap + sill + back
    box(SIDE, RH - PL, RD, body, { p: [-RW / 2 + SIDE / 2, PL + (RH - PL) / 2, -RD / 2] }),
    box(SIDE, RH - PL, RD, body, { p: [RW / 2 - SIDE / 2, PL + (RH - PL) / 2, -RD / 2] }),
    box(RW + 0.02, TOP, RD + 0.02, cap, { p: [0, RH - TOP / 2, -RD / 2] }),
    box(IN_W, 0.04, RD, body, { p: [0, PL + 0.02, -RD / 2] }),
    box(IN_W, RH - PL, 0.02, shadow, { p: [0, PL + (RH - PL) / 2, -RD + 0.01] }),
    // interior backdrop close behind the faceplates (reads as depth, not a void)
    box(IN_W, LBL_H + 0.06, 0.01, shadow, { p: [0, LBL_Y, -0.16] }),
    // header plate behind the painted header
    box(LBL_W, (HEAD_PX - 12) * PX, 0.02, shadow, { p: [0, LBL_TOP - ((HEAD_PX - 12) * PX) / 2 - 6 * PX, -0.035] }),
  ];
  // louvred vent insets on both side panels (scaled to the cabinet)
  const vents = Math.max(5, Math.round((RH - 0.9) / 0.068));
  for (const sx of [-1, 1]) {
    const x = sx * (RW / 2 + 0.002);
    paint.push(box(0.004, vents * 0.068 + 0.03, RD - 0.16, shadow, { p: [x, 0.5 + (vents * 0.068) / 2, -RD / 2] }));
    for (let k = 0; k < vents; k++) {
      paint.push(box(0.012, 0.016, RD - 0.2, cap, { p: [x + sx * 0.004, 0.52 + k * 0.068, -RD / 2] }));
    }
  }
  // the unit stack: faceplates proud of the rails, blanking plates set back
  for (const u of rackUnits(i)) {
    const cy = LBL_TOP - (u.y + u.h / 2) * PX;
    const h = u.h * PX - 0.008;
    if (u.kind === "blank") {
      paint.push(box(IN_W - 0.05, h, 0.02, blank, { p: [0, cy, -0.04] }));
      paint.push(box(IN_W - 0.16, 0.008, 0.004, shadow, { p: [0, cy, -0.028] }));
    } else {
      paint.push(box(IN_W - 0.05, h, u.u > 1 ? 0.05 : 0.04, blade, { p: [0, cy, u.u > 1 ? -0.055 : -0.05] }));
    }
  }

  const steel: THREE.BufferGeometry[] = [
    // front rails
    box(0.026, LBL_H + 0.04, 0.02, NEUTRAL.steel, { p: [-IN_W / 2 + 0.013, LBL_Y, -0.026] }),
    box(0.026, LBL_H + 0.04, 0.02, NEUTRAL.steel, { p: [IN_W / 2 - 0.013, LBL_Y, -0.026] }),
    // brushed front bezel framing the opening
    box(0.02, RH - PL - TOP, 0.012, "#7d879c", { p: [-RW / 2 + 0.01, PL + (RH - PL - TOP) / 2, 0.004] }),
    box(0.02, RH - PL - TOP, 0.012, "#7d879c", { p: [RW / 2 - 0.01, PL + (RH - PL - TOP) / 2, 0.004] }),
    box(RW, 0.02, 0.012, "#7d879c", { p: [0, PL + 0.01, 0.004] }),
    // machined edge highlights: side-panel front edges + top-cap front lip
    box(0.006, RH - PL - 0.02, 0.006, EDGE, { p: [-RW / 2 - 0.001, PL + (RH - PL) / 2 - 0.01, 0.012] }),
    box(0.006, RH - PL - 0.02, 0.006, EDGE, { p: [RW / 2 + 0.001, PL + (RH - PL) / 2 - 0.01, 0.012] }),
    box(RW + 0.022, 0.008, 0.008, EDGE, { p: [0, RH - 0.004, 0.012] }),
    box(RW + 0.022, 0.006, 0.006, EDGE, { p: [0, RH - TOP, 0.012] }),
    // levelling feet
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.05, 0.03, 0.05, NEUTRAL.steelLight, { p: [sx * (RW / 2 - 0.05), 0.015, -RD / 2 + sz * (RD / 2 - 0.05)] }))),
  ];

  // cool trims: top light bar + the inner front edge strip
  const emit: THREE.BufferGeometry[] = [
    box(RW - 0.04, 0.014, 0.006, cool.clone().multiplyScalar(GLOW.line), { p: [0, RH - TOP / 2, 0.016] }),
    box(0.008, RH - PL - TOP - 0.1, 0.006, cool.clone().multiplyScalar(GLOW.trim), { p: [RW / 2 - 0.004, PL + (RH - PL - TOP) / 2 + 0.02, 0.006] }),
  ];

  const lbl = atlasPlane(LBL_W, LBL_H, rackRegion(i));
  lbl.translate(0, LBL_Y, -0.024);

  return { paint, steel, emit, lbl, RH };
}

/** Phone layout: four 12U wall-mount enclosures flanking the terminal, high on
 *  the back wall — the one band a portrait frame shows above the info card.
 *  Each face samples its cabinet's header + top units from the atlas. */
const ENC_FACE_PX = 352;
const ENC_W = 0.52;
const ENC_H = (ENC_W * ENC_FACE_PX) / FACE_W;
const ENC_D = 0.34;
const ENC_Y = 2.95;
const ENC_Z = -1.85 + ENC_D; // front face (back wall at z≈−1.85)
const ENC_X = [-1.94, -1.3, 1.3, 1.94];

function enclosureParts(i: number, accent: string) {
  const cool = new THREE.Color(coolOf(accent));
  const x = ENC_X[i];
  const W = ENC_W + 0.07;
  const H = ENC_H + 0.1;
  const body = tintNeutral("#3b4357", coolOf(accent), 0.07);
  const paint = [
    box(W, H, ENC_D, body, { p: [x, ENC_Y, ENC_Z - ENC_D / 2] }),
    box(ENC_W + 0.02, ENC_H + 0.02, 0.01, NEUTRAL.hullShadow, { p: [x, ENC_Y, ENC_Z + 0.002] }),
  ];
  const steel = [
    // door frame
    box(W, 0.024, 0.02, EDGE, { p: [x, ENC_Y + H / 2 - 0.012, ENC_Z + 0.01] }),
    box(W, 0.024, 0.02, EDGE, { p: [x, ENC_Y - H / 2 + 0.012, ENC_Z + 0.01] }),
    box(0.024, H, 0.02, EDGE, { p: [x - W / 2 + 0.012, ENC_Y, ENC_Z + 0.01] }),
    box(0.024, H, 0.02, EDGE, { p: [x + W / 2 - 0.012, ENC_Y, ENC_Z + 0.01] }),
    // conduit up to the ceiling tray
    rod([x, ENC_Y + H / 2, ENC_Z - ENC_D / 2], [x, 4.0, ENC_Z - ENC_D / 2], 0.022, NEUTRAL.steel),
  ];
  const emit = [box(W - 0.06, 0.012, 0.006, cool.clone().multiplyScalar(GLOW.line), { p: [x, ENC_Y + H / 2 - 0.012, ENC_Z + 0.022] })];
  const lbl = atlasPlane(ENC_W, ENC_H, rackRegion(i, ENC_FACE_PX));
  lbl.translate(x, ENC_Y, ENC_Z + 0.008);
  const wash = plane(W + 0.9, 1.4, "#ffffff", { p: [x, ENC_Y - 0.1, -1.8] }); // just proud of the clad wall
  return { paint, steel, emit, lbl, wash };
}

export default function CapabilitiesRoom({ accent, atlas, mobile = false }: { accent: string; atlas: THREE.Texture; mobile?: boolean }) {
  const built = useMemo(() => {
    const paint: THREE.BufferGeometry[] = [];
    const steel: THREE.BufferGeometry[] = [];
    const emit: THREE.BufferGeometry[] = [];
    const labels: THREE.BufferGeometry[] = [];
    const wash: THREE.BufferGeometry[] = [];
    const rubber: THREE.BufferGeometry[] = [];
    const shade: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    const coolC = new THREE.Color(coolOf(accent));

    if (mobile) {
      SKILLS.forEach((_, i) => {
        const e = enclosureParts(i, accent);
        paint.push(...e.paint);
        steel.push(...e.steel);
        emit.push(...e.emit);
        labels.push(e.lbl);
        wash.push(e.wash);
      });
      // one tray across the back wall that all four conduits rise into
      steel.push(box(4.4, 0.05, 0.3, NEUTRAL.steel, { p: [0, 3.9, ENC_Z - ENC_D / 2] }));
      rubber.push(box(4.4, 0.03, 0.2, NEUTRAL.rubber, { p: [0, 3.94, ENC_Z - ENC_D / 2] }));
    } else {
      const tops: { t: THREE.Vector3; h: number }[] = [];
      RACKS.forEach((r, i) => {
        const m = matrixOf([r.x, 0, r.z], r.ry);
        const parts = rackParts(i, accent);
        paint.push(...withMatrix(parts.paint, m));
        steel.push(...withMatrix(parts.steel, m));
        emit.push(...withMatrix(parts.emit, m));
        labels.push(parts.lbl.applyMatrix4(m));
        // cool pool over the vent tile in front of each cabinet
        wash.push(withMatrix([plane(1.35, 1.1, "#ffffff", { p: [0, 0.014, 0.46], r: [-Math.PI / 2, 0, 0] })], m)[0]);
        tops.push({ t: new THREE.Vector3(0, parts.RH, -RD / 2).applyMatrix4(m), h: parts.RH });
        // soft contact shadow grounding the cabinet
        shade.push(withMatrix([plane(RW + 0.4, RD + 0.4, "#ffffff", { p: [0, 0.008, -RD / 2], r: [-Math.PI / 2, 0, 0] })], m)[0]);
        // perforated cold-aisle tile, square to the room grid, in front of the cabinet
        const c = new THREE.Vector3(0, 0, 0.42).applyMatrix4(m);
        const vt = atlasPlane(0.52, 0.52, VENT);
        vt.rotateX(-Math.PI / 2).translate(c.x, 0.011, c.z);
        labels.push(vt);
        steel.push(box(0.56, 0.008, 0.56, NEUTRAL.steel, { p: [c.x, 0.006, c.z] }));
      });

      // cable ladder along the left wall, above the cabinets
      const TX = -3.44;
      const TY = 2.46;
      const Z0 = -1.35;
      const Z1 = 2.25;
      const len = Z1 - Z0;
      const zc = (Z0 + Z1) / 2;
      steel.push(
        box(0.02, 0.06, len, NEUTRAL.steel, { p: [TX - 0.16, TY, zc] }),
        box(0.02, 0.06, len, NEUTRAL.steel, { p: [TX + 0.16, TY, zc] }),
      );
      for (let z = Z0 + 0.12; z < Z1; z += 0.24) steel.push(box(0.32, 0.012, 0.025, NEUTRAL.steel, { p: [TX, TY - 0.024, z] }));
      for (const z of [Z0 + 0.3, zc, Z1 - 0.3]) steel.push(rod([-3.7, TY + 0.26, z], [TX + 0.16, TY - 0.02, z], 0.012, NEUTRAL.steel), rod([-3.7, TY - 0.03, z], [TX + 0.16, TY - 0.03, z], 0.012, NEUTRAL.steel));
      const loom = tintNeutral(NEUTRAL.rubber, accent, 0.06);
      for (const o of [-0.06, 0, 0.06]) rubber.push(tube([[TX + o, TY - 0.005, Z0 + 0.05], [TX + o * 1.2, TY - 0.005, zc], [TX + o, TY - 0.005, Z1 - 0.05]], 0.014, loom));
      // one tidy drop per cabinet: two looms in a clean S-bend, laced together
      const lace = tintNeutral(NEUTRAL.hullLight, accent, 0.1);
      tops.forEach(({ t, h }) => {
        [-0.035, 0.035].forEach((o) => {
          const sx = t.x + o * Math.cos(RACK_RY);
          const sz = t.z - o * Math.sin(RACK_RY);
          rubber.push(
            tube(
              [
                [TX + 0.06, TY - 0.01, sz + o],
                [TX + 0.1, TY - 0.08, sz + o * 0.8],
                [sx, Math.min(TY - 0.2, h + 0.3), sz],
                [sx, h + 0.1, sz],
                [sx, h + 0.005, sz],
              ],
              0.016,
              loom,
            ),
          );
        });
        rubber.push(box(0.05, 0.02, 0.1, lace, { p: [t.x, h + 0.12, t.z], r: [0, RACK_RY, 0] }));
      });

      // cool cove under the ladder + its wash on the wall: the aisle's own light
      emit.push(box(0.012, 0.008, len - 0.1, coolC.clone().multiplyScalar(GLOW.trim), { p: [TX + 0.15, TY - 0.034, zc] }));
      wash.push(plane(len + 0.4, 2.0, "#ffffff", { p: [-3.69, TY - 0.6, zc], r: [0, Math.PI / 2, 0] }));
    }

    // the clad service wall behind everything (+ desktop tray / riser)
    const wall = backWallParts(coolOf(accent), mobile);
    paint.push(...wall.paint);
    steel.push(...wall.steel);
    emit.push(...wall.emit);
    rubber.push(...wall.rubber);
    glow.push(...wall.rise, ...wall.fall);

    // the field kit on the front-right floor: fills the bare corner under
    // the info panel with one low, authored prop (desktop framing only)
    if (!mobile) {
      const rc = roadCaseParts(coolOf(accent), [1.25, 0, 1.3], -0.55);
      paint.push(...rc.paint);
      steel.push(...rc.steel);
      emit.push(...rc.emit);
      labels.push(...rc.labels);
      shade.push(...rc.shade);
    }

    // raised access floor: 600 mm tile seams across the mat (x ±2.1,
    // z −1.55…1.85) — the dead slab becomes the machine-room floor the
    // workstation and racks stand on
    const seam = tintNeutral("#343c4d", coolOf(accent), 0.08);
    for (let k = 1; k < 7; k++) paint.push(box(0.012, 0.002, 3.36, seam, { p: [-2.1 + k * 0.6, 0.0135, 0.15] }));
    for (let k = 1; k < 6; k++) paint.push(box(4.16, 0.002, 0.012, seam, { p: [0, 0.0135, -1.55 + k * 0.6 - 0.05] }));

    const out: Record<string, THREE.BufferGeometry> = {
      paint: merge(paint),
      steel: merge(steel),
      emit: merge(emit),
      labels: merge(labels),
      wash: merge(wash),
      rubber: merge(rubber),
      glow: merge(glow),
    };
    if (shade.length) out.shade = merge(shade);
    return out;
  }, [accent, mobile]);

  const mats = useMemo(() => {
    const paint = MATERIALS.paint({ color: "#ffffff" });
    paint.vertexColors = true;
    const steel = MATERIALS.steel({ color: "#ffffff" });
    steel.vertexColors = true;
    const rubber = MATERIALS.rubber({ color: "#ffffff" });
    rubber.vertexColors = true;
    const emit = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // labels at 0.7: the terminal (hero) keeps the highest luminance in frame
    const labels = new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(0.7, 0.7, 0.7), transparent: true, toneMapped: false, depthWrite: false });
    const wash = new THREE.MeshBasicMaterial({
      map: getPuckTex(),
      color: coolOf(accent),
      transparent: true,
      // phones: the wash sits right behind the enclosures on a lit wall
      opacity: mobile ? 0.2 : 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shade = new THREE.MeshBasicMaterial({ map: getPuckTex(), color: NEUTRAL.void, transparent: true, opacity: 0.55, depthWrite: false });
    // the coves' light on the clad wall: a vertical ramp, steady
    const glow = new THREE.MeshBasicMaterial({
      map: getRampTex(),
      color: coolOf(accent),
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return { paint, steel, rubber, emit, labels, wash, shade, glow };
  }, [accent, atlas, mobile]);

  useEffect(
    () => () => {
      Object.values(built).forEach((g) => g.dispose());
    },
    [built],
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );

  return (
    <group>
      <mesh geometry={built.paint} material={mats.paint} />
      <mesh geometry={built.steel} material={mats.steel} />
      <mesh geometry={built.rubber} material={mats.rubber} />
      <mesh geometry={built.emit} material={mats.emit} />
      <mesh geometry={built.labels} material={mats.labels} renderOrder={2} />
      {built.shade && <mesh geometry={built.shade} material={mats.shade} renderOrder={1} />}
      <mesh geometry={built.wash} material={mats.wash} renderOrder={1} />
      <mesh geometry={built.glow} material={mats.glow} renderOrder={1} />
    </group>
  );
}
