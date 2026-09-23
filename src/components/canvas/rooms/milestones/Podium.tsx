"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SITE } from "@/lib/constants";
import { useTextTexture } from "../../canvas2d";
import { fonts } from "../holo";
import { Laurel, atlasPlane, chamferBar, ContactShadow, type FameMats } from "./kit";

/* ── the numbers podium (room hero) ──────────────────────────────────────────
 * A three-step winners' podium standing on the round stone dais. Its RISERS
 * carry the headline numbers in gilt — 1.3M+ downloads on the top step, 100K
 * daily users second, 72K TikTok followers third (SITE.stats, ordered by
 * size). The silhouette is a true 1 : 0.72 : 0.55 winners' stair; every step
 * is a lacquered body on a recessed shadow gap, with a satin-brass kick plate
 * at the foot, a chamfered brass nosing and a polished black-stone top that
 * picks up the ceiling fixture. A gilt laurel crowns the top step, seated in a
 * short turned brass collar — kept low so it never climbs over the hero
 * screen's bottom bezel at the dwell. */

// px-per-world-unit of the riser atlas (504 px = one 0.9-wide riser)
const PPU = 560;
export const ATLAS = 1024;

const TOP_H = 0.8;
const GAP_H = 0.04; // recessed shadow gap
const KICK_H = 0.05; // brass kick plate
const SLAB_H = 0.036; // polished stone top
const NOSE = 0.036; // chamfered brass nosing section
/** everything on a riser that isn't lettering (gap + kick + nosing + slab) */
const TRIM = GAP_H + KICK_H + NOSE + SLAB_H;

type Step = { key: string; x: number; w: number; h: number; d: number; stat: (typeof SITE.stats)[number]; num: number; lab: number; ax: number; ay: number };

const [DL, DAU, TT] = SITE.stats;
const STEPS: Step[] = [
  { key: "c", x: 0, w: 0.9, h: TOP_H, d: 0.7, stat: DL, num: 184, lab: 42, ax: 0, ay: 0 },
  { key: "l", x: -0.92, w: 0.9, h: TOP_H * 0.72, d: 0.64, stat: DAU, num: 138, lab: 38, ax: 0, ay: 400 },
  { key: "r", x: 0.92, w: 0.9, h: TOP_H * 0.55, d: 0.64, stat: TT, num: 104, lab: 34, ax: 512, ay: 0 },
];

/** atlas regions shared with the vitrine plaque and the medal exhibit */
export const PLAQUE_RECT = { ax: 512, ay: 190, w: 512, h: 150 };
export const MEDAL_RECT = { ax: 512, ay: 360, w: 320, h: 320 };
export const RIBBON_RECT = { ax: 0, ay: 700, w: 128, h: 320 };
/** the medal plinth's brass label (Founders Uni line, readable from the dwell) */
export const MEDAL_LABEL_RECT = { ax: 512, ay: 700, w: 512, h: 150 };

function goldFill(ctx: CanvasRenderingContext2D, y0: number, y1: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#fff0c2");
  g.addColorStop(0.45, "#f0c66a");
  g.addColorStop(0.55, "#d9a443");
  g.addColorStop(1, "#f6d68a");
  return g;
}

function arcText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, mid: number, spread: number, inward: boolean) {
  const chars = [...text];
  const n = chars.length;
  chars.forEach((ch, i) => {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    const a = mid + (inward ? -t : t) * spread;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
}

/** An engraved brass label: one line of serif caps + a small mono line. The
 *  plate itself is real brass geometry; this cell only carries the cut. */
function engravedPlate(
  ctx: CanvasRenderingContext2D,
  r: { ax: number; ay: number; w: number; h: number },
  big: string,
  small: string,
  bigPx: number,
  smallPx: number,
) {
  const { ser, mono } = fonts();
  ctx.save();
  ctx.translate(r.ax, r.ay);
  ctx.textAlign = "center";
  const lines: [string, string, number, number][] = [
    [`700 ${bigPx}px ${ser}`, big, r.h * 0.58, Math.round(bigPx * 0.06)],
    [`700 ${smallPx}px ${mono}`, small, r.h * 0.88, Math.round(smallPx * 0.16)],
  ];
  // fit the big line to the plate
  ctx.font = lines[0][0];
  ctx.letterSpacing = `${lines[0][3]}px`;
  const bw = ctx.measureText(big).width;
  if (bw > r.w * 0.9) lines[0][0] = `700 ${Math.floor((bigPx * r.w * 0.9) / bw)}px ${ser}`;
  for (const [font, text, y, ls] of lines) {
    ctx.font = font;
    ctx.letterSpacing = `${ls}px`;
    ctx.fillStyle = "rgba(255,240,200,0.45)";
    ctx.fillText(text, r.w / 2 + ls / 2, y + 2);
    ctx.fillStyle = "rgba(34,22,6,0.92)";
    ctx.fillText(text, r.w / 2 + ls / 2, y);
  }
  ctx.letterSpacing = "0px";
  ctx.restore();
}

function paintAtlas(ctx: CanvasRenderingContext2D) {
  const { ser, mono } = fonts();
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  for (const s of STEPS) {
    const W = s.w * PPU;
    const H = (s.h - TRIM) * PPU;
    ctx.save();
    ctx.translate(s.ax, s.ay);
    // gilt numeral + label, optically centred on the riser
    const capH = s.num * 0.7;
    const block = capH + s.lab * 1.55;
    const ny = (H - block) / 2 + capH;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${s.num}px ${ser}`;
    // a hair of dark "engraving" shadow under the gilt so it reads as inlaid
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(s.stat.value, W / 2 + 2, ny + 3);
    ctx.fillStyle = goldFill(ctx, ny - s.num * 0.72, ny);
    ctx.fillText(s.stat.value, W / 2, ny);
    const ly = ny + s.lab * 1.55;
    ctx.font = `600 ${s.lab}px ${mono}`;
    const label = s.stat.label.toUpperCase();
    ctx.letterSpacing = `${Math.round(s.lab * 0.12)}px`;
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(246,226,170,0.92)";
    ctx.fillText(label, W / 2, ly);
    ctx.letterSpacing = "0px";
    const gap = 16;
    const rule = Math.max(0, Math.min(46, (W - lw) / 2 - gap - 18));
    if (rule > 8) {
      ctx.strokeStyle = "rgba(240,198,106,0.6)";
      ctx.lineWidth = 3;
      const ry = ly - s.lab * 0.34;
      ctx.beginPath();
      ctx.moveTo(W / 2 - lw / 2 - gap - rule, ry);
      ctx.lineTo(W / 2 - lw / 2 - gap, ry);
      ctx.moveTo(W / 2 + lw / 2 + gap, ry);
      ctx.lineTo(W / 2 + lw / 2 + gap + rule, ry);
      ctx.stroke();
    }
    ctx.restore();
  }

  // vitrine plaque (engraved brass): the cup stands for the one win no other
  // object shows — solo-founded, solo-built (ACHIEVEMENTS[4], EXPERIENCE)
  engravedPlate(ctx, PLAQUE_RECT, "SOLO-BUILT", "SOLO-FOUNDED · 2024", 80, 28);
  // the medal plinth's label: the Founders Uni line, big enough to read
  engravedPlate(ctx, MEDAL_LABEL_RECT, "FOUNDERS UNI", "$25K OFFER · 2.5%", 80, 28);

  // medal obverse — the field stays TRANSPARENT so the polished PBR gold
  // shows through; only the struck relief is drawn: glyphs and rings in a
  // darker engraved gold, each with a 1-2px bright lip under it.
  {
    const { ax, ay, w } = MEDAL_RECT;
    const c = w / 2;
    ctx.save();
    ctx.translate(ax, ay);
    const cut = "rgba(96,62,14,0.86)";
    const lip = "rgba(255,240,196,0.55)";
    const ring = (r: number, lw: number) => {
      ctx.lineWidth = lw;
      ctx.strokeStyle = lip;
      ctx.beginPath();
      ctx.arc(c, c + 1.5, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = cut;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(c * 0.66, 3);
    ring(c * 0.95, 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 96px ${ser}`;
    ctx.fillStyle = lip;
    ctx.fillText("$25K", c, c + 5);
    ctx.fillStyle = cut;
    ctx.fillText("$25K", c, c + 2);
    ctx.font = `700 30px ${mono}`;
    for (const [col, dy] of [
      [lip, 1.5],
      [cut, 0],
    ] as const) {
      ctx.fillStyle = col;
      arcText(ctx, "FOUNDERS", c, c + dy, c * 0.805, -Math.PI / 2, 1.5, false);
      arcText(ctx, "· 2024 ·", c, c + dy, c * 0.805, Math.PI / 2, 1.1, true);
    }
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // ribbon
  {
    const { ax, ay, w, h } = RIBBON_RECT;
    ctx.save();
    ctx.translate(ax, ay);
    // navy silk with one gilt centre stripe flanked by hairlines: edge
    // stripes read as brass rods from the dwell, not as a ribbon
    ctx.fillStyle = "#223566";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2c4280";
    ctx.fillRect(0, 0, 5, h);
    ctx.fillRect(w - 5, 0, 5, h);
    ctx.fillStyle = "#e0b554";
    ctx.fillRect(w / 2 - 11, 0, 22, h);
    ctx.fillRect(w / 2 - 24, 0, 4, h);
    ctx.fillRect(w / 2 + 20, 0, 4, h);
    // silk sheen
    const sh = ctx.createLinearGradient(0, 0, w, 0);
    sh.addColorStop(0, "rgba(0,0,0,0.25)");
    sh.addColorStop(0.45, "rgba(255,255,255,0.08)");
    sh.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

export function useFameAtlas() {
  return useTextTexture(ATLAS, ATLAS, paintAtlas);
}

/** All three steps, merged PER MATERIAL (7 draws for the whole stair instead
 *  of 7 per step): shadow gap, warm under-light, lacquer body, brass kick
 *  plate, chamfered gilt nosing, polished-stone slab, gilt riser lettering. */
function useStairGeometry() {
  const g = useMemo(() => {
    const parts = {
      gap: [] as THREE.BufferGeometry[],
      glow: [] as THREE.BufferGeometry[],
      body: [] as THREE.BufferGeometry[],
      kick: [] as THREE.BufferGeometry[],
      nose: [] as THREE.BufferGeometry[],
      slab: [] as THREE.BufferGeometry[],
      face: [] as THREE.BufferGeometry[],
    };
    for (const s of STEPS) {
      const faceH = s.h - TRIM;
      const bodyH = s.h - GAP_H - SLAB_H;
      const front = s.d / 2;
      parts.gap.push(new THREE.BoxGeometry(s.w - 0.06, GAP_H, s.d - 0.06).translate(s.x, GAP_H / 2, 0));
      parts.glow.push(new THREE.BoxGeometry(s.w - 0.1, 0.006, 0.006).translate(s.x, 0.006, front - 0.035));
      parts.body.push(new THREE.BoxGeometry(s.w, bodyH, s.d).translate(s.x, GAP_H + bodyH / 2, 0));
      parts.kick.push(new THREE.BoxGeometry(s.w + 0.008, KICK_H, s.d + 0.008).translate(s.x, GAP_H + KICK_H / 2, 0));
      parts.nose.push(chamferBar(s.w + 0.016, NOSE).translate(s.x, s.h - SLAB_H - NOSE / 2, front + 0.004));
      parts.slab.push(new THREE.BoxGeometry(s.w + 0.024, SLAB_H, s.d + 0.024).translate(s.x, s.h - SLAB_H / 2, 0));
      parts.face.push(
        atlasPlane(s.w - 0.02, faceH, s.ax / ATLAS, s.ay / ATLAS, (s.ax + (s.w - 0.02) * PPU) / ATLAS, (s.ay + faceH * PPU) / ATLAS).translate(
          s.x,
          GAP_H + KICK_H + faceH / 2,
          front + 0.002,
        ),
      );
    }
    // each list is homogeneous (boxes/planes indexed, extrudes non-indexed),
    // which is what mergeGeometries requires
    const merged = {} as Record<keyof typeof parts, THREE.BufferGeometry>;
    (Object.keys(parts) as (keyof typeof parts)[]).forEach((k) => {
      merged[k] = mergeGeometries(parts[k]);
      parts[k].forEach((x) => x.dispose());
    });
    return merged;
  }, []);
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return g;
}

function Stair({ m, tex }: { m: FameMats; tex: THREE.Texture }) {
  const g = useStairGeometry();
  return (
    <group>
      {/* recessed shadow gap + faint warm under-light: each step floats */}
      <mesh geometry={g.gap} material={m.lacquerDeep} />
      <mesh geometry={g.glow} material={m.goldTrim} />
      <mesh geometry={g.body} material={m.lacquer} />
      {/* satin-brass kick plates wrapping the feet */}
      <mesh geometry={g.kick} material={m.brass} />
      {/* chamfered gilt nosings under the polished-stone tops */}
      <mesh geometry={g.nose} material={m.gold} />
      <mesh geometry={g.slab} material={m.stoneTop} />
      {/* gilt lettering inlaid in the risers */}
      <mesh geometry={g.face}>
        <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} color="#e6e6e6" />
      </mesh>
    </group>
  );
}

const COLLAR_H = 0.042;
/** wreath scale: kept clear of the hero screen's bottom bezel at the dwell */
const LAUREL_S = 1.24;

/** A short turned brass collar the wreath's tie seats into (lathe). */
function LaurelCollar({ m }: { m: FameMats }) {
  const g = useMemo(() => {
    const prof: [number, number][] = [
      [0, 0],
      [0.07, 0],
      [0.072, 0.008],
      [0.06, 0.014],
      [0.036, 0.02],
      [0.03, 0.03],
      [0.04, 0.036],
      [0.042, COLLAR_H],
      [0, COLLAR_H],
    ];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
    lathe.computeVertexNormals();
    return lathe;
  }, []);
  useEffect(() => () => g.dispose(), [g]);
  return <mesh geometry={g} material={m.brass} />;
}
export const PODIUM_W = 0.92 * 2 + 0.9;

export function Podium({ m, tex, laurel = true }: { m: FameMats; tex: THREE.Texture; laurel?: boolean }) {
  const top = STEPS[0].h;
  return (
    <group>
      <ContactShadow m={m} w={PODIUM_W + 0.7} d={1.35} y={0.002} />
      <Stair m={m} tex={tex} />
      {laurel && (
        <group position={[0, top, -0.08]}>
          <ContactShadow m={m} w={0.34} d={0.26} y={0.001} />
          <LaurelCollar m={m} />
          {/* the wreath's bottom tie seats in the collar */}
          <group position-y={COLLAR_H + 0.19 * LAUREL_S - 0.012} scale={LAUREL_S}>
            <Laurel m={m} r={0.19} />
          </group>
        </group>
      )}
    </group>
  );
}
