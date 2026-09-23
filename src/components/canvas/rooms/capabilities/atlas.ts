"use client";

import * as THREE from "three";
import { SKILLS } from "@/lib/constants";
import { roundRect } from "../../canvas2d";
import { INK, WARM } from "../../theme";
import { fonts } from "../holo";

/* ── Capabilities: ONE shared canvas atlas for the whole bay ──────────────────
 * Every painted surface in the room (the four rack faces, both monitors, the
 * test phone and the cold-aisle vent tile) is a region of a single 1024²
 * texture, so the bay costs one canvas texture. Regions are in logical canvas
 * px; `atlasPlane` maps them onto plane UVs. The rack layout (which unit sits
 * where, how tall) is computed ONCE here and shared by the painter and the 3D
 * builder, so the painted faceplates always line up with the physical ones. */

export const ATLAS = 1024;

/** Rack face column: 256 px wide; each cabinet uses the top FACE_H[i] px. */
export const FACE_W = 256;
/** Header band at the top of each rack face. */
export const HEAD_PX = 160;
/** One rack unit, in atlas px. */
export const U_PX = 48;
/** Face heights: three 42U-style cabinets and a half-height network cabinet
 *  at the end of the row (Tools) — the row has rhythm, not four clones. */
export const FACE_H = [800, 800, 800, 512] as const;

export type Region = { x: number; y: number; w: number; h: number };
export const rackRegion = (i: number, h: number = FACE_H[i]): Region => ({ x: i * FACE_W, y: 0, w: FACE_W, h });
export const MON_L: Region = { x: 0, y: 800, w: 400, h: 224 };
export const MON_R: Region = { x: 400, y: 800, w: 400, h: 224 };
export const PHONE: Region = { x: 820, y: 808, w: 96, h: 208 };
/** Perforated cold-aisle floor tile (lives in the unused foot of column 04). */
export const VENT: Region = { x: 3 * FACE_W + 16, y: 540, w: 224, h: 224 };

export type UnitKind = "item" | "patch" | "cable" | "ups" | "blank";
export type Unit = { kind: UnitKind; label?: string; u: number; y: number; h: number };

/** Unit stack for cabinet i (px from the face top). Full cabinets: patch panel,
 *  the group's technologies (the first-listed one as a 2U server, the rest
 *  1U), a cable manager, growth blanks, and a 3U UPS at the foot. The
 *  half-height Tools cabinet carries just its six units. */
export function rackUnits(i: number): Unit[] {
  const g = SKILLS[i];
  const full = FACE_H[i] === 800;
  const seq: Omit<Unit, "y" | "h">[] = [];
  if (full) seq.push({ kind: "patch", u: 1 });
  g.items.forEach((label, k) => seq.push({ kind: "item", label, u: k === 0 ? 2 : 1 }));
  if (full) seq.push({ kind: "cable", u: 1 });
  const capacity = Math.floor((FACE_H[i] - HEAD_PX - 8) / U_PX);
  const used = seq.reduce((s, x) => s + x.u, 0) + (full ? 3 : 0);
  for (let k = 0; k < capacity - used; k++) seq.push({ kind: "blank", u: 1 });
  if (full) seq.push({ kind: "ups", u: 3 });
  let y = HEAD_PX;
  return seq.map((s) => {
    const out = { ...s, y, h: s.u * U_PX };
    y += s.u * U_PX;
    return out;
  });
}

/** Plane geometry (w×h, facing +z) sampling `r` of the atlas. */
export function atlasPlane(w: number, h: number, r: Region): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const u0 = r.x / ATLAS;
  const u1 = (r.x + r.w) / ATLAS;
  const vt = 1 - r.y / ATLAS;
  const vb = 1 - (r.y + r.h) / ATLAS;
  g.setAttribute("uv", new THREE.Float32BufferAttribute([u0, vt, u1, vt, u0, vb, u1, vb], 2));
  return g;
}

/** The bay's cool light: a real steel-cyan (the grey accent alone reads as
 *  plain off-white on screen), leaning ≤15% toward the room accent. */
export const STEEL_CYAN = "#5cb2dc";
export const coolOf = (accent: string) => "#" + new THREE.Color(STEEL_CYAN).lerp(new THREE.Color(accent), 0.15).getHexString();

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, max: number, maxW: number) {
  let s = max;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 12 && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function led(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, r = 3.5) {
  // soft halo + core — painted, steady (never animated)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  dot(ctx, x, y, r, color);
}

/** Rack screw in the mounting ear. */
function screw(ctx: CanvasRenderingContext2D, x: number, y: number) {
  dot(ctx, x, y, 5, "rgba(200,208,222,0.55)");
  dot(ctx, x, y, 3.2, "rgba(40,46,60,0.9)");
  ctx.fillStyle = "rgba(200,208,222,0.6)";
  ctx.fillRect(x - 2.6, y - 0.8, 5.2, 1.6);
}

/** Anodised faceplate with machined top edge + ears. */
function plate(ctx: CanvasRenderingContext2D, y0: number, h: number, base: string) {
  const w = FACE_W;
  roundRect(ctx, 4, y0 + 2, w - 8, h - 4, 3);
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, base);
  g.addColorStop(1, "rgba(14,17,26,0.96)");
  ctx.fillStyle = g;
  ctx.fill();
  // machined highlight + shadow seam
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(6, y0 + 3, w - 12, 1.5);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(6, y0 + h - 3, w - 12, 1.5);
  // ears
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(6, y0 + 4, 16, h - 8);
  ctx.fillRect(w - 22, y0 + 4, 16, h - 8);
  for (let s = 0; s < Math.max(1, Math.round(h / U_PX)); s++) {
    const cy = y0 + U_PX * (s + 0.5);
    screw(ctx, 14, cy);
    screw(ctx, w - 14, cy);
  }
}

/** One cabinet face: numeral + group header, then the unit stack. Blank
 *  units stay transparent — the 3D blanking plates show through. */
function paintRack(ctx: CanvasRenderingContext2D, i: number, cool: string) {
  const { ser, mono, sans } = fonts();
  const w = FACE_W;
  const g = SKILLS[i];
  const units = rackUnits(i);
  ctx.save();
  ctx.translate(i * FACE_W, 0);

  // header plate (painted over the physical header panel)
  roundRect(ctx, 8, 10, w - 16, HEAD_PX - 20, 8);
  ctx.fillStyle = "rgba(12,15,24,0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(244,241,234,0.14)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = cool;
  ctx.fillRect(24, 24, 40, 4);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `400 76px ${ser}`;
  ctx.fillText(String(i + 1).padStart(2, "0"), 20, 104);
  // steady cool status lamp beside the numeral
  led(ctx, w - 34, 60, cool, 6);
  ctx.fillStyle = cool;
  fitFont(ctx, g.group.toUpperCase(), "700", mono, 28, w - 44);
  ctx.fillText(g.group.toUpperCase(), 22, 136);

  // shared label size per cabinet so the silkscreen reads as one system
  // (heavier + larger than before: at dwell distance the silkscreen has to
  // read as type, not texture — LEDs moved right to give the names room)
  ctx.letterSpacing = "1.5px";
  const fs = Math.min(...g.items.map((t) => fitFont(ctx, t.toUpperCase(), "700", sans, 30, 160)));

  for (const u of units) {
    const { y, h } = u;
    const cy = y + U_PX / 2;
    if (u.kind === "blank") continue;
    if (u.kind === "item") {
      plate(ctx, y, h, u.u > 1 ? "rgba(58,66,84,0.98)" : "rgba(50,57,74,0.98)");
      // silkscreen name, left
      ctx.fillStyle = INK;
      ctx.font = `700 ${fs}px ${sans}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(u.label!.toUpperCase(), 30, cy + 1);
      // steady LED row, right: power, link, activity
      led(ctx, w - 62, cy, cool);
      led(ctx, w - 49, cy, cool);
      led(ctx, w - 36, cy, WARM);
      if (u.u > 1) {
        // 2U server: a row of drive caddies across the lower unit
        const dy = y + U_PX + 6;
        const n = 6;
        const cw = (w - 60) / n;
        for (let k = 0; k < n; k++) {
          const x = 30 + k * cw;
          roundRect(ctx, x, dy, cw - 5, U_PX - 14, 2);
          ctx.fillStyle = "rgba(20,24,36,0.95)";
          ctx.fill();
          ctx.fillStyle = "rgba(244,241,234,0.12)";
          for (let s = 0; s < 3; s++) ctx.fillRect(x + 4, dy + 6 + s * 7, cw - 20, 2);
          dot(ctx, x + cw - 10, dy + U_PX - 22, 2.2, k < 4 ? cool : "rgba(244,241,234,0.25)");
        }
      } else {
        // 1U: a machined label well under the name (keeps the plate from
        // reading as a flat card) — no vents competing with the type
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(28, y + U_PX - 11, 150, 2);
      }
    } else if (u.kind === "patch") {
      plate(ctx, y, h, "rgba(40,46,60,0.98)");
      const n = 12;
      const pw = (w - 60) / n;
      for (let k = 0; k < n; k++) {
        const x = 30 + k * pw;
        ctx.fillStyle = "rgba(8,10,16,0.95)";
        ctx.fillRect(x, cy - 5, pw - 5, 13);
        ctx.fillStyle = "rgba(244,241,234,0.18)";
        ctx.fillRect(x + 2, cy - 5, pw - 9, 2);
        dot(ctx, x + (pw - 5) / 2, cy - 12, 1.8, k % 3 === 2 ? "rgba(244,241,234,0.25)" : cool);
      }
    } else if (u.kind === "cable") {
      plate(ctx, y, h, "rgba(30,35,47,0.98)");
      ctx.fillStyle = "rgba(6,8,12,0.95)";
      roundRect(ctx, 30, cy - 7, w - 60, 14, 5);
      ctx.fill();
      ctx.fillStyle = "rgba(160,170,190,0.4)";
      for (let k = 0; k < 7; k++) {
        roundRect(ctx, 36 + k * 30, cy - 12, 8, 24, 3);
        ctx.fill();
      }
    } else if (u.kind === "ups") {
      plate(ctx, y, h, "rgba(46,52,68,0.98)");
      // LCD
      roundRect(ctx, 30, y + 26, 92, 54, 4);
      ctx.fillStyle = "rgba(8,14,20,0.98)";
      ctx.fill();
      ctx.fillStyle = cool;
      for (let k = 0; k < 5; k++) ctx.fillRect(40 + k * 15, y + 50, 11, 20);
      ctx.fillStyle = "rgba(244,241,234,0.7)";
      ctx.font = `600 13px ${mono}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("ONLINE", 40, y + 43);
      ctx.fillStyle = "rgba(244,241,234,0.55)";
      ctx.font = `600 18px ${sans}`;
      ctx.fillText("UPS", 30, y + h - 26);
      led(ctx, 88, y + h - 32, cool);
      // grille
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      for (let r = 0; r < 7; r++) for (let c = 0; c < 10; c++) dot(ctx, 142 + c * 8.5, y + 28 + r * 13, 2.4, "rgba(0,0,0,0.45)");
    }
  }
  ctx.letterSpacing = "0px";
  ctx.restore();
}

/** Perforated floor tile: steel plate, a grid of holes lit from the cold
 *  plenum below (the aisle's cool light made physical). */
function paintVent(ctx: CanvasRenderingContext2D, r: Region, cool: string) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.fillStyle = "rgba(34,40,54,1)";
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.strokeStyle = "rgba(200,208,222,0.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, r.w - 6, r.h - 6);
  const n = 14;
  const step = (r.w - 28) / n;
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const x = 14 + step * (a + 0.5);
      const y = 14 + step * (b + 0.5);
      // brighter toward the middle — the glow of the plenum under the tile
      const d = Math.hypot(a - n / 2 + 0.5, b - n / 2 + 0.5) / (n / 2);
      ctx.globalAlpha = Math.max(0.25, 0.95 - d * 0.6);
      dot(ctx, x, y, step * 0.28, cool);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

type Tok = [string, string];
const KW = "#c3a6e8", TY = "#8fb4ec", STR = "#a6cf8a", PUN = "#8a93a6", VAR = "#e4e9f2", COM = "#6c7488";

function paintEditor(ctx: CanvasRenderingContext2D, r: Region, cool: string) {
  const { mono } = fonts();
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.fillStyle = "#0c1019";
  ctx.fillRect(0, 0, r.w, r.h);
  // tab strip
  ctx.fillStyle = "#141a26";
  ctx.fillRect(0, 0, r.w, 30);
  ctx.fillStyle = "#1c2433";
  ctx.fillRect(10, 4, 176, 26);
  ctx.fillStyle = cool;
  ctx.fillRect(10, 4, 176, 2);
  ctx.font = `500 15px ${mono}`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.fillText("quest_board.dart", 22, 18);
  ctx.fillStyle = "rgba(244,241,234,0.4)";
  ctx.fillText("api.cs", 204, 18);
  // gutter
  ctx.fillStyle = "#10151f";
  ctx.fillRect(0, 30, 34, r.h - 30);
  const lines: Tok[][] = [
    [["// SelfQuest — Flutter client", COM]],
    [["class ", KW], ["QuestBoard", TY], [" extends ", KW], ["StatelessWidget", TY], [" {", PUN]],
    [["  @override", COM]],
    [["  Widget ", TY], ["build", VAR], ["(ctx) =>", PUN]],
    [["    ListView", TY], ["(children: [", PUN]],
    [["      for ", KW], ["(q ", VAR], ["in ", KW], ["quests", VAR], [")", PUN]],
    [["        QuestCard", TY], ["(q),", PUN]],
    [["    ]);", PUN]],
  ];
  ctx.font = `500 16px ${mono}`;
  lines.forEach((ln, i) => {
    const y = 48 + i * 22;
    ctx.fillStyle = "rgba(244,241,234,0.28)";
    ctx.textAlign = "right";
    ctx.fillText(String(i + 1), 26, y);
    ctx.textAlign = "left";
    let x = 44;
    for (const [t, c] of ln) {
      ctx.fillStyle = c;
      ctx.fillText(t, x, y);
      x += ctx.measureText(t).width;
    }
  });
  // caret line highlight (static)
  ctx.fillStyle = "rgba(92,178,220,0.10)";
  ctx.fillRect(34, 48 + 6 * 22 - 11, r.w - 34, 22);
  ctx.restore();
}

function paintDeploy(ctx: CanvasRenderingContext2D, r: Region, cool: string) {
  const { mono } = fonts();
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.fillStyle = "#141a26";
  ctx.fillRect(0, 0, r.w, 30);
  ctx.font = `500 15px ${mono}`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(244,241,234,0.55)";
  ctx.fillText("zsh — deploy", 14, 16);
  const rows: Tok[][] = [
    [["$ ", cool], ["git push origin main", VAR]],
    [["▸ app  ", KW], ["flutter build ios · android", VAR]],
    [["▸ api  ", KW], ["dotnet publish → azure", VAR]],
    [["▸ web  ", KW], ["next build → vercel", VAR]],
    [["▸ ops  ", KW], ["docker · posthog events", VAR]],
    [["✓ ", STR], ["shipped", STR]],
    [["$ ", cool], ["▍", INK]],
  ];
  ctx.font = `500 16px ${mono}`;
  rows.forEach((ln, i) => {
    let x = 16;
    const y = 50 + i * 24;
    for (const [t, c] of ln) {
      ctx.fillStyle = c;
      ctx.fillText(t, x, y);
      x += ctx.measureText(t).width;
    }
  });
  ctx.restore();
}

function paintPhone(ctx: CanvasRenderingContext2D, r: Region, cool: string) {
  ctx.save();
  ctx.translate(r.x, r.y);
  roundRect(ctx, 0, 0, r.w, r.h, 12);
  ctx.fillStyle = "#0e121b";
  ctx.fill();
  // status + title bars
  ctx.fillStyle = "rgba(244,241,234,0.5)";
  ctx.fillRect(12, 12, 22, 4);
  ctx.fillRect(r.w - 30, 12, 18, 4);
  ctx.fillStyle = INK;
  ctx.fillRect(12, 28, 46, 7);
  // quest cards
  for (let k = 0; k < 4; k++) {
    const y = 48 + k * 38;
    roundRect(ctx, 10, y, r.w - 20, 30, 6);
    ctx.fillStyle = "#1a2130";
    ctx.fill();
    ctx.fillStyle = k === 0 ? WARM : cool;
    ctx.beginPath();
    ctx.arc(24, y + 15, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(244,241,234,0.7)";
    ctx.fillRect(36, y + 9, 36 - k * 4, 5);
    ctx.fillStyle = "rgba(244,241,234,0.3)";
    ctx.fillRect(36, y + 18, 26, 4);
  }
  ctx.restore();
}

/** Paints the whole atlas (referentially stable per accent — memo it). */
export function makeAtlasPainter(accent: string) {
  const cool = coolOf(accent);
  return (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < 4; i++) paintRack(ctx, i, cool);
    paintVent(ctx, VENT, cool);
    paintEditor(ctx, MON_L, cool);
    paintDeploy(ctx, MON_R, cool);
    paintPhone(ctx, PHONE, cool);
  };
}
