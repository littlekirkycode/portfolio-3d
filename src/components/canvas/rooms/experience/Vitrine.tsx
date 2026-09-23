"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EXPERIENCE } from "@/lib/constants";
import { roundRect, useTextTexture } from "../../canvas2d";
import { GLOW, INK, MATERIALS, NEUTRAL, WARM, tintNeutral } from "../../theme";
import { fonts, track, type Painter } from "../holo";
import { getPuckTex } from "../shared";
import { cellUV, merge, place } from "./geo";
import { getGrainTex } from "./textures";

/* ── the pass case ────────────────────────────────────────────────────────────
 * "Where I've worked", as the things you actually keep: a museum display desk
 * on the centre floor holding the six access passes — one per role in
 * EXPERIENCE, in start order left → right, each laid on felt with its lanyard
 * coiled above it. The two current passes carry the accent header + lanyard.
 *
 *  - Case: a tilted walnut slab (the stair's timber — one joinery family)
 *    with a raised frame, glass lid and an accent case-light strip under the
 *    top rail, on a slim four-leg steel stand. The ~40° pitch presents the
 *    passes to the dwell camera; the top edge stays ≤ 1.0 m so it sits under
 *    the hero poster (DESIGN_SYSTEM §5), fully on the floor mat.
 *  - Bed + passes share ONE atlas and ONE lit material (felt, lanyards and
 *    soft shadows are painted into the bed; the passes are separate cards
 *    laid a hair proud so they catch the light on their own).
 *
 * 8 draw calls, one 1024×800 canvas texture. Static. */

type Pass = { name: string; year: string; now: boolean };

const PASSES: Pass[] = EXPERIENCE.map((e) => ({
  name: /accelerator/i.test(e.org) ? e.role : e.org.split(" · ")[0],
  year: e.dates.split(/\s*[—–-]\s*/)[0],
  now: /now/i.test(e.dates),
}))
  .reverse()
  .map((r, i) => ({ r, i }))
  .sort((a, b) => +a.r.year - +b.r.year || a.i - b.i)
  .map(({ r }) => r);

/* case (vitrine-local metres; origin on the floor at the footprint centre) */
const W = 1.22; // width (x)
const D = 0.56; // plan depth of the slope (z)
const FRONT_H = 0.54; // front top edge
const BACK_H = 1.0; // back top edge — stays under the hero poster
const PHI = Math.atan2(BACK_H - FRONT_H, D); // slope angle from horizontal
const SLOPE_L = Math.hypot(D, BACK_H - FRONT_H);
const SLOPE_MID: [number, number, number] = [0, (FRONT_H + BACK_H) / 2, 0];
const SLAB = 0.07; // walnut slab thickness (perpendicular to the slope)
const RAIL_T = 0.03; // frame rail height above the slab

/* bed + passes on the slope (slope-local u across, v up-slope) */
const BED_W = 1.12;
const BED_H = 0.6;
const RAIL_U = (W - BED_W) / 2;
const RAIL_V = (SLOPE_L - BED_H) / 2;
const CARD_W = 0.15;
const CARD_H = 0.21;
const CARD_GAP = (BED_W - PASSES.length * CARD_W) / (PASSES.length + 1);
const CARD_V = -BED_H / 2 + 0.04 + CARD_H / 2;
const cardU = (k: number) => -BED_W / 2 + CARD_GAP * (k + 1) + CARD_W * (k + 0.5);

/* atlas: bed on top (1024 px across BED_W), passes in a row below */
const AW = 1024;
const BED_PX = Math.round((AW * BED_H) / BED_W);
const CW = 168;
const CH = 236;
const cellX = (k: number) => 4 + k * (CW + 2);
const CELL_Y = BED_PX + 8;
const AH = Math.ceil((CELL_Y + CH + 4) / 8) * 8;

const u2px = (u: number) => ((u + BED_W / 2) / BED_W) * AW;
const v2py = (v: number) => ((BED_H / 2 - v) / BED_H) * BED_PX;

function rgb(c: THREE.Color, a = 1) {
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

function usePassPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx) => {
      const { ser, mono, sans } = fonts();
      const bs = ctx.getTransform().a || 1; // shadowBlur ignores the CTM
      const acc = new THREE.Color(accent);

      /* ── bed: felt, case-light spill, pass shadows, coiled lanyards ── */
      const felt = tintNeutral(NEUTRAL.hull, accent, 0.1);
      ctx.fillStyle = rgb(felt);
      ctx.fillRect(0, 0, AW, BED_PX);
      // fine felt nap
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 2600; k++) {
        ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.05)";
        ctx.fillRect(rnd() * AW, rnd() * BED_PX, 2, 2);
      }
      // the case light under the top rail spills down the felt
      const spill = ctx.createLinearGradient(0, 0, 0, BED_PX * 0.7);
      spill.addColorStop(0, rgb(acc.clone().lerp(new THREE.Color(INK), 0.5), 0.2));
      spill.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spill;
      ctx.fillRect(0, 0, AW, BED_PX);
      // soft inner vignette at the frame edges
      const vg = ctx.createRadialGradient(AW / 2, BED_PX / 2, BED_PX * 0.3, AW / 2, BED_PX / 2, AW * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.28)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, AW, BED_PX);

      const cw = (CARD_W / BED_W) * AW;
      const ch = (CARD_H / BED_H) * BED_PX;
      PASSES.forEach((p, k) => {
        const cx = u2px(cardU(k));
        const top = v2py(CARD_V + CARD_H / 2);
        // lanyard: a flat ribbon loop coiled up the felt from the clip
        const ribbon = p.now ? acc.clone().multiplyScalar(0.72) : new THREE.Color(k % 2 ? "#4b5467" : "#5a6376");
        const lw = 15;
        const loopW = 58 + (k % 3) * 6;
        const loopTop = 26 + (k % 2) * 14;
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(cx - 8, top + 4);
          ctx.bezierCurveTo(cx - 10, top - 60, cx - loopW / 2 - 6, loopTop + 70, cx - loopW / 2, loopTop + 30);
          ctx.bezierCurveTo(cx - loopW / 2 + 4, loopTop - 4, cx + loopW / 2 - 4, loopTop - 4, cx + loopW / 2, loopTop + 30);
          ctx.bezierCurveTo(cx + loopW / 2 + 6, loopTop + 70, cx + 10, top - 60, cx + 8, top + 4);
        };
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 8 * bs;
        ctx.shadowOffsetY = 4 * bs;
        path();
        ctx.strokeStyle = rgb(ribbon);
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.restore();
        // woven edge highlight down the ribbon
        path();
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.lineWidth = 2;
        ctx.stroke();
        // the pass's own shadow on the felt
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 14 * bs;
        ctx.shadowOffsetY = 7 * bs;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        roundRect(ctx, cx - cw / 2 + 2, top + 2, cw - 4, ch - 4, 8);
        ctx.fill();
        ctx.restore();
      });

      /* ── the passes ── */
      PASSES.forEach((p, k) => {
        const x = cellX(k);
        const y = CELL_Y;
        ctx.save();
        roundRect(ctx, x, y, CW, CH, 12);
        ctx.fillStyle = "#bdb9b0";
        ctx.fill();
        ctx.clip();
        // header band: graphite for past roles, accent for current
        const band = 64;
        ctx.fillStyle = p.now ? accent : "#2c3444";
        ctx.fillRect(x, y, CW, band);
        // slot punch
        ctx.fillStyle = "#1a1f2b";
        roundRect(ctx, x + CW / 2 - 18, y + 9, 36, 8, 4);
        ctx.fill();
        // organisation on the band (auto-fit)
        let fs = 26;
        ctx.font = `600 ${fs}px ${ser}`;
        const nw = ctx.measureText(p.name).width;
        if (nw > CW - 20) {
          fs *= (CW - 20) / nw;
          ctx.font = `600 ${fs}px ${ser}`;
        }
        ctx.fillStyle = p.now ? "#0b1510" : INK;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(p.name, x + CW / 2, y + 48);
        // photo block
        ctx.fillStyle = "#a3a9b3";
        roundRect(ctx, x + 14, y + band + 14, 58, 68, 6);
        ctx.fill();
        ctx.fillStyle = "#737b89";
        ctx.beginPath();
        ctx.arc(x + 43, y + band + 38, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 43, y + band + 82, 24, 18, 0, Math.PI, 0);
        ctx.fill();
        // holder name + access lines
        ctx.textAlign = "left";
        ctx.fillStyle = "#232a38";
        ctx.font = `700 15px ${sans}`;
        ctx.fillText("J. KIRKHAM", x + 80, y + band + 30);
        ctx.fillStyle = "#8a909b";
        ctx.fillRect(x + 80, y + band + 42, 70, 6);
        ctx.fillRect(x + 80, y + band + 56, 52, 6);
        // start year
        ctx.fillStyle = "#232a38";
        ctx.font = `700 34px ${mono}`;
        track(ctx, 0.02, 34);
        ctx.fillText(p.year, x + 14, y + CH - 22);
        track(ctx, 0);
        // barcode
        ctx.fillStyle = "#3a4152";
        let bx = x + CW - 60;
        for (let b = 0; b < 16; b++) {
          const bw = (b * 7) % 3 === 0 ? 3 : 1.5;
          ctx.fillRect(bx, y + CH - 50, bw, 30);
          bx += bw + 1.6;
        }
        if (p.now) {
          ctx.fillStyle = accent;
          ctx.fillRect(x, y + CH - 8, CW, 8);
        }
        ctx.restore();
      });
    },
    [accent],
  );
}

function useCaseGeo() {
  return useMemo(() => {
    // slope frame: the tilted display top, baked in slope-local space
    // (u across, v up-slope, n out of the glass)
    const slope = new THREE.Matrix4().compose(
      new THREE.Vector3(...SLOPE_MID),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-(Math.PI / 2 - PHI), 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );

    // walnut: the tilted slab + its raised frame rails
    const wood: THREE.BufferGeometry[] = [
      place(new THREE.BoxGeometry(W, SLOPE_L, SLAB), [0, 0, -SLAB / 2], [0, 0, 0], slope),
      place(new THREE.BoxGeometry(RAIL_U, SLOPE_L, RAIL_T), [-W / 2 + RAIL_U / 2, 0, RAIL_T / 2], [0, 0, 0], slope),
      place(new THREE.BoxGeometry(RAIL_U, SLOPE_L, RAIL_T), [W / 2 - RAIL_U / 2, 0, RAIL_T / 2], [0, 0, 0], slope),
      place(new THREE.BoxGeometry(BED_W, RAIL_V, RAIL_T), [0, SLOPE_L / 2 - RAIL_V / 2, RAIL_T / 2], [0, 0, 0], slope),
      place(new THREE.BoxGeometry(BED_W, RAIL_V, RAIL_T), [0, -SLOPE_L / 2 + RAIL_V / 2, RAIL_T / 2], [0, 0, 0], slope),
    ];

    // bed (felt) + the six passes → one geometry into one atlas
    const lit: THREE.BufferGeometry[] = [];
    lit.push(place(cellUV(new THREE.PlaneGeometry(BED_W, BED_H), 0, 0, AW, BED_PX, AW, AH), [0, 0, 0.002], [0, 0, 0], slope));
    const clips: THREE.BufferGeometry[] = [];
    PASSES.forEach((_, k) => {
      const u = cardU(k);
      const tilt = ((k % 3) - 1) * 0.02; // laid by hand, not by a machine
      lit.push(place(cellUV(new THREE.PlaneGeometry(CARD_W, CARD_H), cellX(k), CELL_Y, CW, CH, AW, AH), [u, CARD_V, 0.006], [0, 0, tilt], slope));
      clips.push(place(new THREE.BoxGeometry(0.03, 0.022, 0.007), [u, CARD_V + CARD_H / 2 - 0.002, 0.009], [0, 0, tilt], slope));
    });

    // steel stand: four slim legs to the slab's underside + side stretchers
    const steel: THREE.BufferGeometry[] = [];
    const glides: THREE.BufferGeometry[] = [];
    const feet: THREE.Vector3[] = [];
    for (const su of [-1, 1]) {
      for (const sv of [-1, 1]) {
        const top = new THREE.Vector3(su * (W / 2 - 0.08), sv * (SLOPE_L / 2 - 0.09), -SLAB).applyMatrix4(slope);
        feet.push(top);
        const h = top.y - 0.02;
        steel.push(place(new THREE.CylinderGeometry(0.014, 0.012, h, 14), [top.x, 0.02 + h / 2, top.z]));
        steel.push(place(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), [top.x, top.y - 0.006, top.z]));
        glides.push(place(new THREE.CylinderGeometry(0.022, 0.024, 0.02, 16), [top.x, 0.01, top.z]));
      }
    }
    for (const su of [-1, 1]) {
      const x = su * (W / 2 - 0.08);
      const z0 = feet[0].z;
      const z1 = feet[1].z;
      steel.push(place(new THREE.CylinderGeometry(0.009, 0.009, Math.abs(z1 - z0), 10), [x, 0.16, (z0 + z1) / 2], [Math.PI / 2, 0, 0]));
    }
    steel.push(place(new THREE.CylinderGeometry(0.009, 0.009, W - 0.16, 10), [0, 0.16, Math.min(feet[0].z, feet[1].z)], [0, 0, Math.PI / 2]));

    // accent case-light strip tucked under the top rail
    const caseLight = place(new THREE.BoxGeometry(BED_W - 0.02, 0.006, 0.008), [0, BED_H / 2 - 0.006, RAIL_T - 0.01], [0, 0, 0], slope);
    const glass = place(new THREE.PlaneGeometry(BED_W, BED_H), [0, 0, RAIL_T - 0.004], [0, 0, 0], slope);

    return {
      wood: merge(wood),
      lit: merge(lit),
      clips: merge(clips),
      steel: merge(steel),
      glides: merge(glides),
      caseLight,
      glass,
    };
  }, []);
}

export default function Vitrine({ accent, position }: { accent: string; position: [number, number, number] }) {
  const geo = useCaseGeo();
  const paintPasses = usePassPainter(accent);
  const atlas = useTextTexture(AW, AH, paintPasses);
  const mats = useMemo(
    () => ({
      wood: (() => {
        // the stair's walnut, so the room reads as one joinery family
        const m = MATERIALS.wood({ color: new THREE.Color(NEUTRAL.wood).lerp(new THREE.Color(WARM), 0.16) });
        m.map = getGrainTex();
        m.roughness = 0.52;
        return m;
      })(),
      steel: MATERIALS.steel(),
      glides: MATERIALS.rubber(),
      // felt + passes: lit, with a little self-light from the case strip so
      // the passes read in the dim bay
      lit: new THREE.MeshStandardMaterial({
        map: atlas,
        emissiveMap: atlas,
        emissive: new THREE.Color(1, 1, 1),
        emissiveIntensity: 0.1,
        roughness: 0.86,
        metalness: 0,
      }),
      clips: MATERIALS.polished(),
      caseLight: MATERIALS.emit(accent, GLOW.trim),
      // the glass preset, reflections dialled back: at this pitch the full
      // preset mirrors the bay light across the passes and washes them out
      glass: (() => {
        const m = MATERIALS.glass();
        m.metalness = 0.45;
        m.opacity = 0.06;
        return m;
      })(),
      shadow: new THREE.MeshBasicMaterial({ map: getPuckTex(), color: "#000000", transparent: true, opacity: 0.55, depthWrite: false }),
    }),
    [accent, atlas],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group position={position} name="experience-pass-case">
      <mesh position={[0, 0.008, 0]} rotation-x={-Math.PI / 2} scale={[1.7, 0.95, 1]} material={mats.shadow} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh geometry={geo.glides} material={mats.glides} />
      <mesh geometry={geo.steel} material={mats.steel} />
      <mesh geometry={geo.wood} material={mats.wood} />
      <mesh geometry={geo.lit} material={mats.lit} />
      <mesh geometry={geo.clips} material={mats.clips} />
      <mesh geometry={geo.caseLight} material={mats.caseLight} />
      <mesh geometry={geo.glass} material={mats.glass} renderOrder={3} />
    </group>
  );
}
