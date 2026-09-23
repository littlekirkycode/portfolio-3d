"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EXPERIENCE } from "@/lib/constants";
import { roundRect, useTextTexture } from "../canvas2d";
import { GLOW, INK, MATERIALS, NEUTRAL, WARM } from "../theme";
import { accentInk, fonts, track, type Painter } from "./holo";
import { cellUV, merge, paint, place } from "./experience/geo";
import { getGrainTex } from "./experience/textures";

/* ── Experience: "The Ascent" ─────────────────────────────────────────────────
 * The career as a piece of architecture: a cantilevered walnut stair climbing
 * the LEFT wall from the front of the bay to a landing where the NOW lamp
 * stands. ONE TREAD PER ROLE, in start order (EXPERIENCE in constants.ts), so
 * the six treads are the six roles — "six roles. one guy." Each tread's nose
 * carries its start year (mono) and the organisation (serif) as flush inlaid
 * lettering; the two current roles carry an accent NOW tag.
 *
 *  - Treads: 0.115 m walnut slabs (WARM is the ship's one secondary hue —
 *    wood) keyed straight into the wall, a satin steel arris on the top
 *    front edge. The landing is a thicker slab.
 *  - Light: a static accent line along the foot of every nose (brighter on
 *    the current roles) and a soft LED wash on the wall beneath each tread —
 *    the architectural "lit cantilever" detail, and what grounds each slab.
 *  - PLACEMENT: the stair is deliberately compact (0.32 m going, 0.26 m
 *    rise) and starts right at the front of the column: the dwell camera
 *    sees the side wall in perspective, so anything deep on the left wall
 *    crosses the lit back-alcove corner on screen. Every tread's outer back
 *    corner is raked back to stay ≥ 20 px left of that corner at 1440×900
 *    (camera at room-local [0, 1.62, 6.15], vfov 62°).
 *
 * Merged geometry (5 draw calls) + ONE label atlas. */

type Role = { name: string; year: string; now: boolean };

/** Six roles in start order, straight from constants (never invented). The
 *  accelerator entry keeps its programme name (its `org` is a description). */
const ROLES: Role[] = EXPERIENCE.map((e) => ({
  name: /accelerator/i.test(e.org) ? e.role : e.org.split(" · ")[0],
  year: e.dates.split(/\s*[—–-]\s*/)[0],
  now: /now/i.test(e.dates),
}))
  .reverse()
  .map((r, i) => ({ r, i }))
  .sort((a, b) => +a.r.year - +b.r.year || a.i - b.i)
  .map(({ r }) => r);
const N = ROLES.length;

/* layout (room-local metres) */
const WALL = -3.7; // left side-wall face
const KEY = 0.06; // how far each slab is keyed into the wall
const Z0 = 1.9; // tread 0 centre z (its wall end stays in frame)
const GO = 0.32; // going (z step toward the back wall)
const TD = 0.36; // tread depth — 4 cm lap over the tread below
const Y0 = 0.28; // tread 0 top
const RISE = 0.26;
const TT = 0.115; // tread thickness
const LAND_T = 0.16; // landing slab thickness
const LAND_D = 0.42; // landing depth (the lamp stands on it)

const isLanding = (i: number) => i === N - 1;
export const depthAt = (i: number) => (isLanding(i) ? LAND_D : TD);
export const thickAt = (i: number) => (isLanding(i) ? LAND_T : TT);
export const frontAt = (i: number) => Z0 - i * GO + TD / 2;
export const zAt = (i: number) => frontAt(i) - depthAt(i) / 2;
export const topAt = (i: number) => Y0 + i * RISE;
/** Tread length out of the wall along its NOSE. Every free end is cut on the
 *  same rake (the back corner shorter by RAKE per metre of depth): the dwell
 *  camera sees the wall in perspective, so the deep corners are the ones
 *  that would cross the back-alcove corner on screen. */
export const lengthAt = (i: number) => (isLanding(i) ? 0.8 : 1.0 - 0.02 * i);
const RAKE = 0.34; // m of length lost per m of depth
export const backLengthAt = (i: number) => lengthAt(i) - RAKE * depthAt(i);

/** Where the NOW lamp stands (room-local, back half of the landing). */
export const LAMP_AT: [number, number, number] = [WALL + 0.3, topAt(N - 1), zAt(N - 1) - 0.1];

/* nose labels: one atlas row per tread, 1024 px across the label width */
const LPAD = 0.03; // label inset from each end of the nose
const LBOT = 0.016; // clear of the light line at the foot of the nose
const labelW = (i: number) => lengthAt(i) - 2 * LPAD;
const labelH = (i: number) => thickAt(i) - LBOT - 0.012;
const AW = 1024;
const rowH = (i: number) => Math.round((AW * labelH(i)) / labelW(i));
const rowY = (i: number) => {
  let y = 0;
  for (let k = 0; k < i; k++) y += rowH(k) + 4;
  return y;
};
const AH = Math.ceil((rowY(N - 1) + rowH(N - 1)) / 8) * 8;

function useLabelPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx) => {
      const { ser, mono } = fonts();
      const yearInk = accentInk(accent, 0.34);
      ROLES.forEach((r, i) => {
        const y = rowY(i);
        const h = rowH(i);
        const pxm = AW / labelW(i); // texture px per metre on this nose
        // type sized in METRES so it reads the same on every tread; the
        // landing (furthest from the camera) is set larger
        const k = isLanding(i) ? 1.08 : 1;
        let serPx = 0.088 * k * pxm;
        let monoPx = 0.066 * k * pxm;
        let nowPx = 0.086 * k * pxm;
        const gap = 0.034 * pxm;
        const measure = () => {
          ctx.font = `600 ${monoPx}px ${mono}`;
          track(ctx, 0.04, monoPx);
          const yw = ctx.measureText(r.year).width;
          track(ctx, 0);
          ctx.font = `500 ${serPx}px ${ser}`;
          const nw = ctx.measureText(r.name).width;
          ctx.font = `700 ${nowPx}px ${mono}`;
          track(ctx, 0.12, nowPx);
          const pw = r.now ? ctx.measureText("NOW").width + nowPx * 0.7 : 0;
          track(ctx, 0);
          return { yw, nw, pw, total: yw + gap + nw + (r.now ? gap + pw : 0) };
        };
        let m = measure();
        if (m.total > AW - 8) {
          const s = (AW - 8) / m.total;
          serPx *= s;
          monoPx *= s;
          nowPx *= s;
          m = measure();
        }
        const base = y + h * 0.5 + serPx * 0.34; // optical centre of the caps
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        // inlaid lettering: a thin dark bed under each glyph reads as a cut
        // into the timber, the light fill as the inlay
        const inlay = (text: string, x: number, fill: string) => {
          ctx.fillStyle = "rgba(18,10,6,0.55)";
          ctx.fillText(text, x + 1.5, base + 2.5);
          ctx.fillStyle = fill;
          ctx.fillText(text, x, base);
        };
        let x = 4;
        ctx.font = `600 ${monoPx}px ${mono}`;
        track(ctx, 0.04, monoPx);
        inlay(r.year, x, yearInk); // years in the timeline panel's accent ink
        track(ctx, 0);
        x += m.yw + gap;
        ctx.font = `500 ${serPx}px ${ser}`;
        inlay(r.name, x, INK);
        x += m.nw + gap;
        if (r.now) {
          // accent NOW tag at the end of the line
          const ph = nowPx * 1.18;
          const py = base - nowPx * 0.72 - (ph - nowPx * 0.72) / 2;
          roundRect(ctx, x, py, m.pw, ph, ph * 0.22);
          ctx.fillStyle = accent;
          ctx.fill();
          ctx.fillStyle = "#0a1410";
          ctx.font = `700 ${nowPx}px ${mono}`;
          track(ctx, 0.12, nowPx);
          ctx.fillText("NOW", x + nowPx * 0.35, py + ph / 2 + nowPx * 0.36);
          track(ctx, 0);
        }
      });
    },
    [accent],
  );
}

/** A box whose +x end is cut on a rake: the back (−z) outer edge pulled in
 *  by `rake`. BoxGeometry keeps separate vertices per face, so the normals
 *  recompute flat per face. */
function rakeBox(w: number, h: number, d: number, rake: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) {
    if (p.getX(k) > 0 && p.getZ(k) < 0) p.setX(k, p.getX(k) - rake);
  }
  g.computeVertexNormals();
  return g;
}

function useStair(accent: string) {
  return useMemo(() => {
    const acc = new THREE.Color(accent);
    const body: THREE.BufferGeometry[] = [];
    const arris: THREE.BufferGeometry[] = [];
    const light: THREE.BufferGeometry[] = [];
    const labels: THREE.BufferGeometry[] = [];
    const wash: THREE.BufferGeometry[] = [];

    for (let i = 0; i < N; i++) {
      const r = ROLES[i];
      const L = lengthAt(i);
      const d = depthAt(i);
      const T = thickAt(i);
      const z = zAt(i);
      const t = topAt(i);
      const front = frontAt(i);
      const xc = WALL + (L - KEY) / 2;
      // walnut slab keyed into the wall
      body.push(place(rakeBox(L + KEY, T, d, L - backLengthAt(i)), [xc, t - T / 2, z]));
      // polished steel arris along the top front edge (flush, a hair proud)
      arris.push(place(new THREE.BoxGeometry(L + 0.002, 0.009, 0.01), [WALL + L / 2 + 0.001, t - 0.0045 + 0.0005, front - 0.005 + 0.0008]));
      // static accent line at the foot of the nose — the career's trajectory,
      // brighter on the roles that are still running
      const k = r.now ? GLOW.trim * 1.25 : GLOW.trim * (0.5 + 0.28 * (i / (N - 1)));
      light.push(paint(place(new THREE.BoxGeometry(L - 0.05, 0.007, 0.003), [WALL + L / 2, t - T + 0.008, front + 0.0016]), acc.clone().multiplyScalar(k)));
      // LED wash on the wall beneath the tread (separable falloff; the top edge
      // tucks under the slab so there is no hard end)
      const wh = 0.46;
      wash.push(place(new THREE.PlaneGeometry(d + 0.34, wh), [WALL + 0.004, t - T - wh / 2 + 0.02, z], [0, Math.PI / 2, 0]));
      // flush inlaid label on the nose
      const lw = labelW(i);
      const lh = labelH(i);
      const face = cellUV(new THREE.PlaneGeometry(lw, lh), 0, rowY(i), AW, rowH(i), AW, AH);
      labels.push(place(face, [WALL + L / 2, t - T + LBOT + lh / 2, front + 0.0012]));
    }

    return {
      body: merge(body),
      arris: merge(arris),
      light: merge(light),
      labels: merge(labels),
      wash: merge(wash),
    };
  }, [accent]);
}

/** Separable falloff: fades to 0 at both sides and downward from a bright
 *  top edge — a light wash with no hard edge anywhere. */
let _washTex: THREE.CanvasTexture | null = null;
function getWashTex() {
  if (!_washTex) {
    const S = 64;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const v = Math.pow(1 - y / (S - 1), 2.2);
      for (let x = 0; x < S; x++) {
        const u = Math.sin((Math.PI * (x + 0.5)) / S);
        const a = v * u * u;
        const k = (y * S + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        img.data[k + 3] = Math.round(255 * a);
      }
    }
    ctx.putImageData(img, 0, 0);
    _washTex = new THREE.CanvasTexture(c);
  }
  return _washTex;
}

export default function ExperienceRoom({ accent }: { accent: string; animate: boolean }) {
  const geo = useStair(accent);
  const labelPaint = useLabelPainter(accent);
  const atlas = useTextTexture(AW, AH, labelPaint);

  const mats = useMemo(
    () => ({
      body: (() => {
        // a lighter, warmer walnut than the stock wood so the grain reads
        const m = MATERIALS.wood({ color: new THREE.Color(NEUTRAL.wood).lerp(new THREE.Color(WARM), 0.16) });
        m.map = getGrainTex();
        m.roughness = 0.52;
        return m;
      })(),
      // satin light metal: reads as a crisp lit edge (a polished strip
      // mirrors the dark room and reads as a groove)
      arris: new THREE.MeshStandardMaterial({ color: NEUTRAL.steelLight, roughness: 0.34, metalness: 0.3 }),
      light: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      labels: new THREE.MeshBasicMaterial({
        map: atlas,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        color: new THREE.Color(0.8, 0.8, 0.8), // INK stays under the bloom threshold
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      wash: new THREE.MeshBasicMaterial({
        map: getWashTex(),
        color: new THREE.Color(accent).lerp(new THREE.Color(WARM), 0.25).multiplyScalar(0.55),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    }),
    [accent, atlas],
  );

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  return (
    <group name="experience-ascent">
      <mesh geometry={geo.wash} material={mats.wash} renderOrder={1} />
      <mesh geometry={geo.body} material={mats.body} />
      <mesh geometry={geo.arris} material={mats.arris} />
      <mesh geometry={geo.light} material={mats.light} />
      <mesh geometry={geo.labels} material={mats.labels} renderOrder={2} />
    </group>
  );
}
