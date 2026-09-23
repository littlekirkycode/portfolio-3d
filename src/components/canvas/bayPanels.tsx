"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { SKILLS, ACHIEVEMENTS, EXPERIENCE, ALLIED_ROOM } from "@/lib/constants";
import { useIsMobile } from "@/lib/useIsMobile";
import { roundRect } from "./canvas2d";
import { NEUTRAL, tintNeutral } from "./theme";
import { INK, accentInk, fonts, paintGlass, track } from "./rooms/holo";
import type { Room } from "./hallConfig";

/* ── holographic bay signage: the see-through cards ──────────────────────────
 * The floating info / timeline cards, the room-name label and the station
 * plaque beside each opening. All share the ship's glass-card language
 * (rooms/holo.tsx `paintGlass`, the in-world twin of the DOM `.ui-glass`):
 *
 *   kicker   Geist Mono, tracked, accent lifted toward ink  "(01) · CATEGORY"
 *   title    DM Serif Display at its real 400 weight + accent full stop
 *   rule     hairline with a short accent lead
 *   body     Hanken Grotesk, ink at 84%, generous leading
 *   data     serif numerals over tracked mono labels (constants.ts only)
 *   footer   square mono chips + the accent link, pinned to the card's foot
 *
 * Cards are sized to their content: the glass is painted to the measured
 * height (top-anchored where Walls places them) and, on desktop, to the
 * narrowest width that holds the copy without adding a line (left-anchored,
 * min 2.6 m), so short copy doesn't sit in a half-empty slab. Each card sits
 * on a darker, depth-writing back plate a few cm behind — real parallax
 * depth, an opaque core under the copy (room washes/HDR trims can't read
 * through or paint over it) and a feathered edge so the rim stays see-
 * through glass. Cards draw a hair under the bloom threshold so text stays
 * crisp. Textures paint once (and again when webfonts land) — never per
 * frame. */

/** Linear multiplier on card materials: ink (#f4f1ea ≈ 0.88 linear luminance)
 *  lands at ~0.76, just under Effects' 0.78 bloom threshold — crisp text, no
 *  halo — while the glass/accents keep their exact authored colour ratios. */
const CARD_TINT = new THREE.Color(0.86, 0.86, 0.86);

/** Type scale. Walls shows the phone card at 0.6x, so small mono (kicker,
 *  chips, labels) would land ~7px on a portrait screen — the phone layout
 *  sets the same hierarchy larger instead (s: small type, b: body). */
type TS = { s: number; b: number };
const DESK: TS = { s: 1, b: 1 };
const PHONE: TS = { s: 1.32, b: 1.16 };
const px = (n: number, k: number) => Math.round(n * k);

const INK_BODY = "rgba(244,241,234,0.84)";
const INK_DIM = "rgba(244,241,234,0.56)";
const HAIR = "rgba(244,241,234,0.12)";

/* ── card texture: like canvas2d's useTextTexture, but the phone backing
 *    store is 0.8x (not 0.5x). On mobile the stacked info card fills ~80% of
 *    a DPR-3 portrait screen, so a half-res card upsampled ~2x and its body
 *    text went soft. Only the one card per bay pays for this. ────────────── */
function useCardTexture(
  width: number,
  height: number,
  render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const mobile = useIsMobile();
  const scale = mobile ? 0.8 : 1;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = mobile ? 4 : 16;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [width, height, scale, mobile]);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, width, height);
      render(ctx, width, height);
      texture.needsUpdate = true;
    };
    draw();
    if ("fonts" in document) document.fonts.ready.then(() => !cancelled && draw()).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [texture, render, width, height, scale]);
  return texture;
}

/* ── small typesetting helpers ─────────────────────────────────────────── */

/** Break text into tokens; a LONG hyphenated compound may break after its
 *  hyphen ("design-for-" / "manufacture"), so one long word can't force a
 *  short line before it. `sp` = the token is preceded by a space. */
type Tok = { t: string; sp: boolean };
function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  for (const word of text.split(" ")) {
    const parts = word.length >= 14 ? word.replace(/(\w)-(?=\w)/g, "$1-\n").split("\n") : [word];
    parts.forEach((t, i) => out.push({ t, sp: i === 0 }));
  }
  return out;
}

function wrapTokens(ctx: CanvasRenderingContext2D, toks: Tok[], maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const tk of toks) {
    const test = line ? line + (tk.sp ? " " : "") + tk.t : tk.t;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = tk.t;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Wrap with a small minimum-raggedness pass: try a few narrower measures
 *  that keep the same line count and keep the evenest rag (last line free). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const toks = tokens(text);
  const base = wrapTokens(ctx, toks, maxW);
  if (base.length < 2) return base;
  // rag = spread of the full lines, plus a widow penalty when the last line
  // is a stub ("streaming." alone on a line)
  const rag = (ls: string[]) => {
    const ws = ls.map((l) => ctx.measureText(l).width);
    const last = ws.pop() ?? 0;
    const top = Math.max(...ws);
    const widow = Math.max(0, top * 0.42 - last);
    return ws.reduce((acc, v) => acc + (top - v) ** 2, 0) + 3 * widow ** 2;
  };
  let best = base;
  let bestRag = rag(base);
  for (const k of [0.97, 0.94, 0.91, 0.88, 0.85]) {
    const ls = wrapTokens(ctx, toks, maxW * k);
    if (ls.length !== base.length) continue;
    const v = rag(ls);
    if (v < bestRag * 0.9) {
      best = ls;
      bestRag = v;
    }
  }
  return best;
}

/** Wrap a list of items into lines joined by `sep`, breaking only BETWEEN
 *  items so a separator never dangles at a line end. */
function wrapItemsGreedy(ctx: CanvasRenderingContext2D, items: string[], sep: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const it of items) {
    const test = line ? `${line}${sep}${it}` : it;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = it;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** Balanced item wrap: when a list needs more than one line, use the
 *  narrowest measure that keeps the line count, so lines fill evenly
 *  (BACKEND breaks 4 + 3, not 6 + a lone "Python"). */
function wrapItems(ctx: CanvasRenderingContext2D, items: string[], sep: string, maxW: number): string[] {
  const base = wrapItemsGreedy(ctx, items, sep, maxW);
  if (base.length < 2) return base;
  let lo = maxW * 0.3;
  let hi = maxW;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (wrapItemsGreedy(ctx, items, sep, mid).length > base.length) lo = mid;
    else hi = mid;
  }
  return wrapItemsGreedy(ctx, items, sep, hi);
}

/** Largest font size <= `size` at which `text` fits `maxW` (optionally with
 *  tracking, in em). Leaves tracking reset. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  size: number,
  maxW: number,
  trackEm = 0,
) {
  ctx.font = font(size);
  track(ctx, trackEm, size);
  const tw = ctx.measureText(text).width;
  track(ctx, 0);
  return tw > maxW ? Math.floor(size * (maxW / tw)) : size;
}

/** The kicker's category. The defence card's category restates the body's
 *  opening words ("Product Engineer in defence ..."), so its kicker keeps
 *  only the sector. Content is unchanged; only the repetition goes. */
function kickerCategory(room: Room): string {
  const cat = room.category.toUpperCase();
  if (room.kind !== "defence") return cat;
  const parts = cat.split("·");
  return parts[parts.length - 1].trim();
}

/** Layout probe: cleared when something had to shrink or overflow at the
 *  trial width (used to find the narrowest card that holds its content). */
type Fit = { ok: boolean };

/** Card header — kicker, serif title + accent stop, accent-led hairline.
 *  Returns the y where the next block starts. */
function header(
  ctx: CanvasRenderingContext2D,
  room: Room,
  w: number,
  pad: number,
  draw: boolean,
  ts: TS,
  titlePx = 118,
  fit?: Fit,
): number {
  const { ser, mono } = fonts();
  const ks0 = px(27, ts.s);
  const kY = pad + Math.round(ks0 * 1.26);
  const tk = Math.round(ks0 * 0.44);
  // year (right) first, so the kicker can fit the space that's left
  const ys = px(27, ts.s);
  let yw = 0;
  if (room.project?.year) {
    ctx.font = `500 ${ys}px ${mono}`;
    track(ctx, 0.14, ys);
    yw = ctx.measureText(room.project.year).width + 28;
    track(ctx, 0);
  }
  const kicker = `${room.index} · ${kickerCategory(room)}`;
  const kx = pad + tk + 20;
  const ks = fitSize(ctx, kicker, (n) => `600 ${n}px ${mono}`, ks0, w - pad - kx - yw, 0.14);
  if (fit && ks < ks0) fit.ok = false;
  if (draw) {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = room.accent;
    ctx.fillRect(pad, kY - Math.round(ks0 * 0.36) - tk / 2, tk, tk);
    ctx.font = `600 ${ks}px ${mono}`;
    ctx.fillStyle = accentInk(room.accent);
    track(ctx, 0.14, ks);
    ctx.fillText(kicker, kx, kY);
    if (room.project?.year) {
      ctx.textAlign = "right";
      ctx.fillStyle = INK_DIM;
      ctx.font = `500 ${ys}px ${mono}`;
      track(ctx, 0.14, ys);
      ctx.fillText(room.project.year, w - pad + 3, kY);
      ctx.textAlign = "left";
    }
    track(ctx, 0);
  }
  const tY = kY + titlePx * 1.02;
  const size = fitSize(ctx, `${room.title}.`, (n) => `400 ${n}px ${ser}`, titlePx, w - pad * 2, -0.01);
  if (fit && size < titlePx) fit.ok = false;
  if (draw) {
    ctx.font = `400 ${size}px ${ser}`;
    track(ctx, -0.01, size);
    ctx.fillStyle = INK;
    ctx.fillText(room.title, pad - 3, tY);
    const tw = ctx.measureText(room.title).width;
    ctx.fillStyle = room.accent;
    ctx.fillText(".", pad - 3 + tw + 2, tY);
    track(ctx, 0);
  }
  const rY = tY + 40;
  if (draw) {
    ctx.fillStyle = HAIR;
    ctx.fillRect(pad, rY, w - pad * 2, 2);
    ctx.fillStyle = room.accent;
    ctx.fillRect(pad, rY - 1, 72, 4);
  }
  return rY + 46;
}

/** Body paragraph; returns the y below it. */
function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, draw: boolean, ts: TS, base = 38): number {
  const { sans } = fonts();
  const size = px(base, ts.b);
  const lh = Math.round(size * 1.4);
  ctx.font = `400 ${size}px ${sans}`;
  const lines = wrapLines(ctx, text, maxW);
  if (draw) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = INK_BODY;
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  }
  return y + lines.length * lh;
}

/** Row of square mono chips (DOM chip twin); optional right-aligned accent
 *  link on the last row. Without a link the chips first try one tightened
 *  row, else wrap into BALANCED rows (no orphan chip). Returns the y below. */
function chipRow(
  ctx: CanvasRenderingContext2D,
  items: string[],
  x: number,
  y: number,
  maxW: number,
  accent: string,
  draw: boolean,
  ts: TS,
  link?: string,
): number {
  const { mono } = fonts();
  const cs = px(27, ts.s);
  const ls = px(27, ts.s);
  const hC = Math.round(cs * 2.15);
  ctx.font = `600 ${ls}px ${mono}`;
  track(ctx, 0.1, ls);
  const linkW = link ? ctx.measureText(link).width + 8 : 0;
  ctx.font = `500 ${cs}px ${mono}`;
  track(ctx, 0.1, cs);
  const labels = items.map((t) => t.toUpperCase());
  const tws = labels.map((t) => ctx.measureText(t).width);
  // spacing: normal, or ~15% tighter when that lands everything on one row
  let padX = Math.round(cs * 0.8);
  let gap = 14;
  const rowW = (p: number, g: number) => tws.reduce((acc, v) => acc + v + p * 2, 0) + g * (tws.length - 1);
  if (!link && rowW(padX, gap) > maxW && rowW(Math.round(cs * 0.66), 11) <= maxW) {
    padX = Math.round(cs * 0.66);
    gap = 11;
  }
  const flow = (limit: number) => {
    const pos: { x: number; row: number }[] = [];
    let cx = 0;
    let row = 0;
    tws.forEach((tw) => {
      const cw = tw + padX * 2;
      if (cx + cw > limit && cx > 0) {
        cx = 0;
        row++;
      }
      pos.push({ x: cx, row });
      cx += cw + gap;
    });
    return { pos, rows: row + 1, end: cx };
  };
  let lay = flow(maxW);
  if (!link && lay.rows > 1) {
    // narrowest measure that keeps the row count -> evenly filled rows
    let lo = maxW * 0.4;
    let hi = maxW;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      if (flow(mid).rows > lay.rows) lo = mid;
      else hi = mid;
    }
    lay = flow(hi);
  }
  if (draw) {
    lay.pos.forEach((p, i) => {
      const cw = tws[i] + padX * 2;
      const py = y + p.row * (hC + gap);
      roundRect(ctx, x + p.x, py, cw, hC, 7);
      ctx.fillStyle = "rgba(244,241,234,0.05)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.22)";
      ctx.stroke();
      ctx.fillStyle = "rgba(244,241,234,0.88)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[i], x + p.x + padX, py + hC / 2 + 1);
    });
  }
  let py = y + (lay.rows - 1) * (hC + gap);
  if (link) {
    // link sits on the chips' last row when it fits, else on its own row
    if (lay.end + linkW + 24 > maxW) py += hC + gap;
    if (draw) {
      ctx.font = `600 ${ls}px ${mono}`;
      track(ctx, 0.1, ls);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = accentInk(accent, 0.2);
      ctx.fillText(link, x + maxW, py + hC / 2 + 1);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x + maxW - linkW + 8, py + hC - 6, linkW - 8, 2);
      ctx.globalAlpha = 1;
    }
  }
  track(ctx, 0);
  ctx.textAlign = "left";
  return py + hC;
}

/** Serif numerals over tracked mono labels, divided by hairlines. A value
 *  with no digit ("iOS") isn't a number and would look odd set as a hero
 *  numeral — those rows render as a mono spec tag + label instead. */
function metricRow(
  ctx: CanvasRenderingContext2D,
  metrics: { value: string; label: string }[],
  x: number,
  y: number,
  maxW: number,
  accent: string,
  draw: boolean,
  ts: TS,
  fit?: Fit,
): number {
  const { ser, mono } = fonts();
  const ms = px(26, ts.s);
  if (!metrics.some((m) => /\d/.test(m.value))) return specTags(ctx, metrics, x, y, maxW, accent, draw, ts, fit);
  const vs = px(72, Math.sqrt(ts.s));
  let cx = x;
  metrics.forEach((m, i) => {
    ctx.font = `400 ${vs}px ${ser}`;
    const vw = ctx.measureText(m.value).width;
    ctx.font = `500 ${ms}px ${mono}`;
    track(ctx, 0.16, ms);
    const lw = ctx.measureText(m.label.toUpperCase()).width;
    track(ctx, 0);
    if (draw) {
      if (i > 0) {
        ctx.fillStyle = HAIR;
        ctx.fillRect(cx - 30, y + 8, 2, vs + ms + 3);
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = INK;
      ctx.font = `400 ${vs}px ${ser}`;
      ctx.fillText(m.value, cx - 2, y + Math.round(vs * 0.88));
      ctx.fillStyle = INK_DIM;
      ctx.font = `500 ${ms}px ${mono}`;
      track(ctx, 0.16, ms);
      ctx.fillText(m.label.toUpperCase(), cx, y + vs + ms + 7);
      track(ctx, 0);
    }
    cx += Math.max(vw, lw) + 60;
  });
  if (fit && cx - 60 - x > maxW) fit.ok = false;
  return y + vs + ms + 13;
}

/** Non-numeric metrics: an accent-edged mono tag carrying the value, the
 *  label beside it in tracked dim mono ("[ IOS ]  SWIFTUI · OFFLINE"). */
function specTags(
  ctx: CanvasRenderingContext2D,
  metrics: { value: string; label: string }[],
  x: number,
  y: number,
  maxW: number,
  accent: string,
  draw: boolean,
  ts: TS,
  fit?: Fit,
): number {
  const { mono } = fonts();
  const vs = px(30, ts.s);
  const ls = px(26, ts.s);
  const hT = Math.round(vs * 2.1);
  const padX = Math.round(vs * 0.72);
  let cx = x;
  metrics.forEach((m) => {
    const value = m.value.toUpperCase();
    const label = m.label.toUpperCase();
    ctx.font = `600 ${vs}px ${mono}`;
    track(ctx, 0.12, vs);
    const vw = ctx.measureText(value).width;
    const tw = vw + padX * 2;
    if (draw) {
      roundRect(ctx, cx, y, tw, hT, 8);
      ctx.fillStyle = rgbaHex(accent, 0.1);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgbaHex(accent, 0.62);
      ctx.stroke();
      ctx.fillStyle = accentInk(accent, 0.3);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(value, cx + padX, y + hT / 2 + 1);
    }
    ctx.font = `500 ${ls}px ${mono}`;
    track(ctx, 0.16, ls);
    const lw = ctx.measureText(label).width;
    if (draw) {
      ctx.fillStyle = INK_DIM;
      ctx.fillText(label, cx + tw + 24, y + hT / 2 + 1);
    }
    track(ctx, 0);
    cx += tw + 24 + lw + 48;
  });
  ctx.textBaseline = "alphabetic";
  if (fit && cx - 48 - x > maxW) fit.ok = false;
  return y + hT;
}

function rgbaHex(hex: string, a: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

/* ── depth: a darker plate a few cm behind the card, same silhouette ───── */

function roundedShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Deferred disposal (same pattern as bayScreens / selfquest useDisposable):
 *  StrictMode replays effect cleanups right after mount and Scene's
 *  compile-before-reveal may still hold a pending compileAsync on a material
 *  — disposing it then throws inside three ("reading isReady"). Cleanup only
 *  schedules the dispose; a re-mount with the same object cancels it. The
 *  geometry and material also dispose independently now: the plate's
 *  geometry changes when the card measures itself, its material doesn't. */
const pendingDispose = new WeakMap<object, number>();
function useDeferredDispose(v: { dispose: () => void }) {
  useEffect(() => {
    const t = pendingDispose.get(v);
    if (t !== undefined) {
      window.clearTimeout(t);
      pendingDispose.delete(v);
    }
    return () => {
      pendingDispose.set(
        v,
        window.setTimeout(() => {
          pendingDispose.delete(v);
          v.dispose();
        }, 8000),
      );
    };
  }, [v]);
}

/** Shared alpha ramp for every back plate: dense in the core, feathering to
 *  ~60% over the outer band (frosted, not see-through), so the plate backs the copy while the card's
 *  rim still shows the room through the glass. One 128² texture for all. */
let plateAlpha: THREE.CanvasTexture | null = null;
function getPlateAlpha(): THREE.CanvasTexture {
  if (plateAlpha) return plateAlpha;
  const N = 128;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const ctx = c.getContext("2d");
  if (ctx) {
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        const v = (j + 0.5) / N;
        const e = Math.min(1, Math.min(u, 1 - u) / 0.075, Math.min(v, 1 - v) / 0.095);
        const t = e * e * (3 - 2 * e);
        const a = Math.round((0.6 + 0.4 * t) * 255);
        const k = (j * N + i) * 4;
        img.data[k] = a;
        img.data[k + 1] = a;
        img.data[k + 2] = a;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  plateAlpha = new THREE.CanvasTexture(c);
  return plateAlpha;
}

/** The darker layer a few cm behind the glass. It WRITES DEPTH (the card
 *  quad doesn't): drawn first (renderOrder -1), it makes any later transparent
 *  mesh BEHIND the card fail the depth test — room washes/glows/vitrine glass
 *  forced late with renderOrder >= 1 can no longer paint over the copy —
 *  while anything in front (the drone, its beam) still passes. */
function BackPlate({ w, h, x, top, accent, r = 0.08 }: { w: number; h: number; x: number; top: number; accent: string; r?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 6);
    // ShapeGeometry UVs are raw shape coords — normalise to 0..1 for the ramp
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k) / w + 0.5, pos.getY(k) / h + 0.5);
    uv.needsUpdate = true;
    return g;
  }, [w, h, r]);
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: tintNeutral(NEUTRAL.hullShadow, accent, 0.06).multiplyScalar(0.7),
        alphaMap: getPlateAlpha(),
        transparent: true,
        // core fully opaque: the bays' HDR emissive trims (well above 1.0)
        // still read through a 15%-open plate as a sharp line behind the copy
        opacity: 1,
        depthWrite: true,
        toneMapped: false,
      }),
    [accent],
  );
  useDeferredDispose(geo);
  useDeferredDispose(mat);
  // renderOrder -1: the plate must draw BEFORE its card. Sorting by distance
  // isn't enough — from an oblique corridor view (0.2) the plate's centre
  // (offset left/up for a narrow card) sorted nearer than the card's, drew
  // after it and, writing depth with an opaque core, blanked the whole card.
  return <mesh geometry={geo} material={mat} position={[x, top - h / 2, -0.055]} renderOrder={-1} />;
}

/** Fraction of the card canvas actually painted with glass (cards are sized
 *  to their content: width from the left edge, height from the top). */
type Used = { w: number; h: number };

/** Card quad + back plate, top-left anchored; the plate follows the measured
 *  glass so a short or narrow card doesn't carry an empty tail. */
function GlassCard({
  w,
  h,
  tex,
  used,
  accent,
}: {
  w: number;
  h: number;
  tex: THREE.Texture;
  used: Used;
  accent: string;
}) {
  const gw = w * used.w;
  const gh = h * used.h;
  const plateW = Math.max(0.6, gw - 0.07);
  const plateH = Math.max(0.4, gh - 0.07);
  return (
    <group>
      <BackPlate w={plateW} h={plateH} x={-w / 2 + gw / 2} top={h / 2 - 0.035} accent={accent} />
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} color={CARD_TINT} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ── floating holographic info card (description / skills / milestones) ── */

const DESC_W = 3.2;
const DESC_H = 2.62;
const DESC_CW = 1024;
const DESC_R = 30;
/** Reading-card glass density. The depth-writing back plate carries the
 *  opacity under the copy, so the pane itself stays thinner than a room
 *  board and its rim band visibly shows the room behind. */
const CARD_DENSITY = 1;
/** Narrowest desktop card (2.6 m). Short copy (Nuremi, SelfAware) used to sit
 *  in a 3.2 m slab with ~40% of it empty; each card now takes the narrowest
 *  width that holds its content without adding a line or shrinking type. */
const DESC_MIN_CW = Math.round((2.6 / DESC_W) * DESC_CW);

/** Phone canvas runs taller (the larger type needs the room); the card stays
 *  top-anchored at Walls' spot, so it simply extends further down. */
const DESC_H_PHONE = 3.3;

export function InfoPanel({ room }: { room: Room }) {
  const mobile = useIsMobile();
  const planeH = mobile ? DESC_H_PHONE : DESC_H;
  const canvasH = Math.round((DESC_CW * planeH) / DESC_W);
  const [used, setUsed] = useState<Used>({ w: 1, h: 1 });
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ts = mobile ? PHONE : DESK;
      const pad = mobile ? 64 : 70;
      const layout = (draw: boolean, cw: number, fit?: Fit): number => {
        const { mono, sans } = fonts();
        const inner = cw - pad * 2;
        let y = header(ctx, room, cw, pad, draw, ts, 118, fit);
        if (room.kind === "project" && room.project) {
          const p = room.project;
          y = paragraph(ctx, p.description, pad, y, inner, draw, ts);
          // a metric that only restates the kicker's category ("AI LIFE OS")
          // adds nothing — skip it (no invented replacement)
          const metrics = (p.metrics ?? []).filter((m) => m.label.trim().toLowerCase() !== room.category.trim().toLowerCase());
          if (metrics.length) y = metricRow(ctx, metrics, pad, y + 34, inner, room.accent, draw, ts, fit);
          // phone: the DOM "VISIT" button sits right under the card — no twin link
          const link = !mobile && p.href && p.href !== "#" ? "VIEW PROJECT ↗" : undefined;
          y = chipRow(ctx, p.tech, pad, y + 38, inner, room.accent, draw, ts, link);
        } else if (room.kind === "defence") {
          y = paragraph(ctx, ALLIED_ROOM.description, pad, y, inner, draw, ts, 36);
          y = chipRow(ctx, ["DFM", "Tolerancing", "CAD", "Systems", "Hardware", "Test"], pad, y + 36, inner, room.accent, draw, ts);
        } else if (room.kind === "skills") {
          // spec sheet: tracked mono group label over the stack, hairline rows
          const ls = px(26, ts.s);
          const is = px(35, ts.b);
          const lh = Math.round(is * 1.32);
          y -= 10;
          // one separator rhythm for the whole sheet: airy, unless any group
          // would wrap with it — then every group uses the tight one
          ctx.font = `400 ${is}px ${sans}`;
          const sep = SKILLS.some((grp) => wrapItems(ctx, grp.items, "  ·  ", inner).length > 1) ? " · " : "  ·  ";
          SKILLS.forEach((grp, gi) => {
            if (gi > 0 && draw) {
              ctx.fillStyle = "rgba(244,241,234,0.08)";
              ctx.fillRect(pad, y - 16, inner, 2);
            }
            if (draw) {
              ctx.textAlign = "left";
              ctx.textBaseline = "top";
              ctx.fillStyle = accentInk(room.accent, 0.1);
              ctx.font = `600 ${ls}px ${mono}`;
              track(ctx, 0.16, ls);
              ctx.fillText(grp.group.toUpperCase(), pad, y);
              track(ctx, 0);
            }
            ctx.font = `400 ${is}px ${sans}`;
            const lines = wrapItems(ctx, grp.items, sep, inner);
            if (draw) {
              ctx.fillStyle = INK_BODY;
              lines.forEach((l, i) => ctx.fillText(l, pad, y + ls + 13 + i * lh));
            }
            y += ls + 13 + lines.length * lh + 30;
          });
          y -= 30;
        } else {
          // milestones: numbered ledger rows
          const ns = px(26, ts.s);
          const as = px(38, ts.b);
          const row = Math.round(as * 1.95);
          y -= 6;
          ACHIEVEMENTS.forEach((a, i) => {
            if (fit) {
              ctx.font = `400 ${as}px ${sans}`;
              if (Math.round(ns * 2.9) + ctx.measureText(a).width > inner) fit.ok = false;
            }
            if (draw) {
              if (i > 0) {
                ctx.fillStyle = "rgba(244,241,234,0.08)";
                ctx.fillRect(pad, y - Math.round(as * 0.37), inner, 2);
              }
              ctx.textAlign = "left";
              ctx.textBaseline = "top";
              ctx.fillStyle = accentInk(room.accent, 0.1);
              ctx.font = `600 ${ns}px ${mono}`;
              track(ctx, 0.12, ns);
              ctx.fillText(String(i + 1).padStart(2, "0"), pad, y + Math.round((as - ns) * 0.72));
              track(ctx, 0);
              ctx.fillStyle = "rgba(244,241,234,0.9)";
              ctx.font = `400 ${as}px ${sans}`;
              ctx.fillText(a, pad + Math.round(ns * 2.9), y);
            }
            y += row;
          });
          y -= row - as - 16;
        }
        return Math.min(h, y + (mobile ? 54 : 60));
      };
      const usedPx = layout(false, w);
      // desktop: the narrowest width with the same height (no added line)
      // and nothing shrunk; the phone card stays full width, centred in frame
      let cw = w;
      if (!mobile) {
        for (let c = DESC_MIN_CW; c < w; c += 16) {
          const fit: Fit = { ok: true };
          if (layout(false, c, fit) === usedPx && fit.ok) {
            cw = c;
            break;
          }
        }
      }
      paintGlass(ctx, cw, h, room.accent, { r: DESC_R, height: usedPx, density: CARD_DENSITY });
      layout(true, cw);
      const next = { w: cw / w, h: usedPx / h };
      setUsed((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    },
    [room, mobile],
  );
  const tex = useCardTexture(DESC_CW, canvasH, render);
  return (
    <group position-y={-(planeH - DESC_H) / 2}>
      <GlassCard w={DESC_W} h={planeH} tex={tex} used={used} accent={room.accent} />
    </group>
  );
}

/* ── experience timeline (tall card; current roles are filled nodes) ───────
 * Each role is two lines: a meta line (mono dates, accent for current roles,
 * then the org in the body face) over the role in large type — so the role,
 * the thing you read, gets the size, and the card's width is actually used.
 * Desktop fills the tall plane with even rows (matching top/bottom margins);
 * phone gets its own wider, larger-type layout (Walls shows the phone card at
 * 0.6x, where the desktop card's 2.35 m width landed dates at ~7 px). */

const TL_W = 2.35;
/** Desktop: the card's top sits level with every other bay's info card
 *  (world y ~3.1), which frees the label band, so Experience gets the same
 *  centred, ruled room label as every other bay. Bottom stays ~0.3 m. */
const TL_H = 2.78;
const TL_TOP = 1.15; // group-local top edge (Walls hangs the group at y 1.95)
const TL_CW = 840;
const TL_W_PHONE = 3.2;
const TL_H_PHONE = 3.2; // the phone frame has no room below: the DOM scrim starts right under it
const TL_TOP_PHONE = 1.6;
const TL_CW_PHONE = 1024;

export function TimelinePanel({ room }: { room: Room }) {
  const mobile = useIsMobile();
  const planeW = mobile ? TL_W_PHONE : TL_W;
  const planeH = mobile ? TL_H_PHONE : TL_H;
  const canvasW = mobile ? TL_CW_PHONE : TL_CW;
  const canvasH = Math.round((canvasW * planeH) / planeW);
  const [used, setUsed] = useState(1);
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { mono, sans } = fonts();
      const ts = mobile ? PHONE : DESK;
      const pad = mobile ? 56 : 62;
      // (desktop sizes fit the shorter plane: header + 6 entries with an
      // even row gap)
      const ms = mobile ? 30 : 26; // meta: dates (mono)
      const os = mobile ? 35 : 29; // meta: org (sans)
      const rs0 = mobile ? 45 : 41; // role
      const metaGap = mobile ? 8 : 10;
      const entryH = ms + metaGap + rs0 + Math.round(rs0 * 0.26);
      const n = EXPERIENCE.length;
      const lineX = pad + 15;
      const tx = lineX + (mobile ? 50 : 44);
      const maxW = w - pad - tx;

      const titlePx = mobile ? 90 : 92;
      const top = header(ctx, room, w, pad, false, ts, titlePx) + (mobile ? 16 : 20);
      // rows spread to fill the plane, bottom margin matching the top
      const gap = Math.max(mobile ? 12 : 18, Math.min(64, (h - pad - top - n * entryH) / (n - 1)));
      const step = entryH + gap;
      const usedPx = Math.min(h, top + n * entryH + (n - 1) * gap + pad - 6);

      paintGlass(ctx, w, h, room.accent, { r: DESC_R, height: usedPx, density: CARD_DENSITY });
      header(ctx, room, w, pad, true, ts, titlePx);

      const nodeY = (i: number) => top + i * step + ms + metaGap + rs0 - Math.round(rs0 * 0.36);
      // spine: accent at the present, fading to a hairline in the past
      const y0 = nodeY(0);
      const y1 = nodeY(n - 1);
      const sp = ctx.createLinearGradient(0, y0, 0, y1);
      sp.addColorStop(0, room.accent);
      sp.addColorStop(0.3, "rgba(244,241,234,0.24)");
      sp.addColorStop(1, "rgba(244,241,234,0.1)");
      ctx.fillStyle = sp;
      ctx.fillRect(lineX - 1.5, y0, 3, y1 - y0);

      EXPERIENCE.forEach((e, i) => {
        const yTop = top + i * step;
        const metaY = yTop + ms; // baseline
        const roleY = metaY + metaGap + rs0; // baseline
        const cy = nodeY(i);
        const current = /now/i.test(e.dates);
        // node: hollow ring for past roles, filled core for current ones
        const nr = mobile ? 16 : 14;
        ctx.beginPath();
        ctx.arc(lineX, cy, nr, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(16,18,26)";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = current ? room.accent : "rgba(244,241,234,0.42)";
        ctx.stroke();
        if (current) {
          ctx.beginPath();
          ctx.arc(lineX, cy, nr * 0.47, 0, Math.PI * 2);
          ctx.fillStyle = room.accent;
          ctx.fill();
        }
        // meta line: DATES  org
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const dates = e.dates.toUpperCase();
        ctx.font = `600 ${ms}px ${mono}`;
        track(ctx, 0.1, ms);
        const dw = ctx.measureText(dates).width;
        ctx.fillStyle = current ? accentInk(room.accent, 0.12) : "rgba(244,241,234,0.6)";
        ctx.fillText(dates, tx, metaY);
        track(ctx, 0);
        const ox = tx + dw + Math.round(ms * 1.25);
        const osz = fitSize(ctx, e.org, (k) => `400 ${k}px ${sans}`, os, maxW - (ox - tx));
        ctx.fillStyle = "rgba(244,241,234,0.3)";
        ctx.fillRect(ox - Math.round(ms * 0.62) - 2, metaY - Math.round(ms * 0.36) - 2, 4, 4);
        ctx.fillStyle = "rgba(244,241,234,0.66)";
        ctx.font = `400 ${osz}px ${sans}`;
        ctx.fillText(e.org, ox, metaY);
        // role
        const rs = fitSize(ctx, e.role, (k) => `600 ${k}px ${sans}`, rs0, maxW, -0.005);
        ctx.fillStyle = INK;
        ctx.font = `600 ${rs}px ${sans}`;
        track(ctx, -0.005, rs);
        ctx.fillText(e.role, tx - 1, roleY);
        track(ctx, 0);
      });
      setUsed(usedPx / h);
    },
    [room, mobile],
  );
  const tex = useCardTexture(canvasW, canvasH, render);
  const top = mobile ? TL_TOP_PHONE : TL_TOP;
  return (
    <group position-y={top - planeH / 2}>
      <GlassCard w={planeW} h={planeH} tex={tex} used={{ w: 1, h: used }} accent={room.accent} />
    </group>
  );
}

/* ── holographic room name label (glows above the bay) ──────────────────── */

export function RoomLabel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { ser } = fonts();
      // soft accent halo + near-white core, so low-chroma accents (Capabilities
      // grey) still read — one halo stamp, not two: the core sits under the
      // bloom knee and the halo carries the glow, so it never smears.
      const core = "#" + new THREE.Color(room.accent).lerp(new THREE.Color(INK), 0.8).getHexString();
      const label = room.title.toUpperCase();
      const ruleRoom = 150; // space kept either side for the flanking rules
      const size = fitSize(ctx, label, (n) => `400 ${n}px ${ser}`, 124, w - ruleRoom * 2 - 40);
      ctx.font = `400 ${size}px ${ser}`;
      track(ctx, 0.06, size);
      const tw = ctx.measureText(label).width;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = w / 2;
      const cy = h / 2 + size * 0.04;
      ctx.fillStyle = room.accent;
      ctx.shadowColor = room.accent;
      // shadowBlur is CTM-exempt (backing-store pixels) — compensate for the
      // mobile 0.5x transform so the halo scales with the text.
      ctx.shadowBlur = 34 * (ctx.getTransform().a || 1);
      ctx.globalAlpha = 0.85;
      ctx.fillText(label, cx, cy);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.fillStyle = core;
      ctx.fillText(label, cx, cy);
      track(ctx, 0);
      // flanking signage rules: accent, fading outward, a diamond at the inner end
      const gap = 34;
      for (const dir of [-1, 1] as const) {
        const x0 = cx + dir * (tw / 2 + gap);
        const x1 = x0 + dir * 118;
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, room.accent);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(x0, x1), h / 2 - 1.5, 118, 3);
        ctx.save();
        ctx.translate(x0, h / 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = core;
        ctx.fillRect(-5, -5, 10, 10);
        ctx.restore();
      }
    },
    [room],
  );
  const tex = useCardTexture(1024, 256, render);
  return (
    <mesh>
      <planeGeometry args={[2.9, 0.725]} />
      <meshBasicMaterial map={tex} color={CARD_TINT} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── station plaque beside each bay opening (a small glass plaque) ───────── */

export function BayPlaque({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { mono, sans } = fonts();
      paintGlass(ctx, w, h, room.accent, { r: 18, inset: 4, density: 1.05 });
      const pad = 34;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      // accent index + tracked category
      ctx.fillStyle = accentInk(room.accent, 0.15);
      ctx.font = `600 34px ${mono}`;
      track(ctx, 0.08, 34);
      ctx.fillText(room.index, pad, 74);
      const iw = ctx.measureText(room.index).width;
      track(ctx, 0.2, 17);
      ctx.fillStyle = INK_DIM;
      ctx.font = `500 17px ${mono}`;
      const cat = room.category.toUpperCase();
      const catSize = fitSize(ctx, cat, (n) => `500 ${n}px ${mono}`, 17, w - pad * 2 - iw - 24);
      ctx.font = `500 ${catSize}px ${mono}`;
      ctx.fillText(cat, pad + iw + 22, 70);
      track(ctx, 0);
      ctx.fillStyle = HAIR;
      ctx.fillRect(pad, 100, w - pad * 2, 2);
      ctx.fillStyle = room.accent;
      ctx.fillRect(pad, 99, 44, 4);
      // name
      const name = room.title.toUpperCase();
      const ns = fitSize(ctx, name, (n) => `700 ${n}px ${sans}`, 58, w - pad * 2);
      ctx.fillStyle = INK;
      ctx.font = `700 ${ns}px ${sans}`;
      track(ctx, 0.04, ns);
      ctx.fillText(name, pad - 2, 180);
      track(ctx, 0);
    },
    [room],
  );
  const tex = useCardTexture(512, 240, render);
  return (
    <mesh>
      <planeGeometry args={[0.98, 0.46]} />
      <meshBasicMaterial map={tex} color={CARD_TINT} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
