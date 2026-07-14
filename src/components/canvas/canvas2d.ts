"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useIsMobile } from "@/lib/useIsMobile";

/* ── shared canvas-2D texture helpers (finding 30) ─────────────────────────
 * The canvas-texture painting layer (Walls / FeatureScreen / Airlock / Drone /
 * BulkheadGates / RoomProps + the Walls split modules) used to re-implement
 * these per file — five copies of familyVar, two divergent hexA parsers, two
 * word-wrappers, two rounded-rect tracers. One definition each now; the
 * signatures are unchanged from the originals. */

/** Resolve a CSS font-family custom property (e.g. --ff-mono) with a fallback
 *  stack, for use in ctx.font strings. */
export function familyVar(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** 6-digit "#rrggbb" → "rgba(r,g,b,a)". (The per-channel slice parse — the
 *  majority implementation; RoomProps' bit-shift variant behaved identically
 *  on the 6-digit accents every call site passes.) */
export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Word-wrap fillText; returns the y just below the last drawn line. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): number {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineH;
}

/** Rounded-rect path (call ctx.fill()/stroke() after). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A CanvasTexture painted by `render`, redrawn once webfonts land.
 *
 *  Mobile: half-resolution backing store + anisotropy 4. The portrait camera
 *  never resolves these panels above ~half their desktop texel count, and the
 *  4+ RGBA canvas textures per bay are the biggest GPU-memory line item
 *  (finding 6). ctx.setTransform scales EVERY painter's coordinates/fonts, so
 *  the drawn layout is identical — only the backing resolution drops. */
export function useTextTexture(
  width: number,
  height: number,
  render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const mobile = useIsMobile();
  const scale = mobile ? 0.5 : 1;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = scale === 1 ? 16 : 4;
    return tex;
  }, [width, height, scale]);
  // R2/R4: the memo re-mints the texture when the mobile scale flips (a
  // desktop resize across the breakpoint), and R3F does NOT dispose swapped
  // `map` props — without this the previous GPU texture (~40 call sites of
  // RGBA backing stores) lingered until nondeterministic GC. Cleanup runs
  // with the OLD texture after the new one is committed, and again on
  // unmount; dispose() is idempotent.
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
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => !cancelled && draw()).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [texture, render, width, height, scale]);
  return texture;
}
