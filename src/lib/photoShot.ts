"use client";

import { familyVar, roundRect } from "@/components/canvas/canvas2d";

/**
 * Photo-mode compositor (finding 47): takes the raw WebGL frame blob and
 * frames it in the site's HUD language — corner brackets, a KIRKHAM·01
 * readout chip bottom-left, the site URL bottom-right — on an offscreen 2D
 * canvas, returning a postable PNG. Dynamically imported by the CAPTURE chip
 * so none of this (or canvas2d's three import) rides in the eager bundle.
 */

function cssColor(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

type Frame = { source: CanvasImageSource; width: number; height: number };

async function decodeFrame(blob: Blob): Promise<Frame> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      return { source: bmp, width: bmp.width, height: bmp.height };
    } catch {}
  }
  // Fallback decode path (older Safari): object URL + HTMLImageElement.
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function composePhoto(
  frame: Blob,
  opts: { readout: string; url: string },
): Promise<Blob | null> {
  const { source, width: w, height: h } = await decodeFrame(frame);
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0);

  // All chrome scales with the FRAME (not device DPR) so a dpr-2 capture and
  // a dpr-1 capture frame identically.
  const u = Math.max(w, h) / 1000;
  const accent = cssColor("--color-accent", "#ff5c38");
  const ink = cssColor("--color-ink", "#f4f1ea");
  const mono = familyVar("--ff-mono", "ui-monospace, monospace");

  // Bottom scrim so the readout stays legible over bright bays.
  const scrimH = 120 * u;
  const grad = ctx.createLinearGradient(0, h - scrimH, 0, h);
  grad.addColorStop(0, "rgba(7,7,10,0)");
  grad.addColorStop(1, "rgba(7,7,10,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, h - scrimH, w, scrimH);

  // HUD corner brackets (the .hud-bracket language, scaled to the frame).
  const m = 24 * u; // margin
  const arm = 30 * u; // bracket arm length
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, 2.5 * u);
  ctx.beginPath();
  // top-left / top-right / bottom-left / bottom-right
  ctx.moveTo(m, m + arm);
  ctx.lineTo(m, m);
  ctx.lineTo(m + arm, m);
  ctx.moveTo(w - m - arm, m);
  ctx.lineTo(w - m, m);
  ctx.lineTo(w - m, m + arm);
  ctx.moveTo(m, h - m - arm);
  ctx.lineTo(m, h - m);
  ctx.lineTo(m + arm, h - m);
  ctx.moveTo(w - m - arm, h - m);
  ctx.lineTo(w - m, h - m);
  ctx.lineTo(w - m, h - m - arm);
  ctx.stroke();

  const fs = 14.5 * u;
  ctx.font = `500 ${fs}px ${mono}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${2.6 * u}px`;
  ctx.textBaseline = "middle";

  // Readout chip, bottom-left: dark slab + accent stroke (drone-bubble style).
  const text = opts.readout.toUpperCase();
  const dotR = 3 * u;
  const padX = 14 * u;
  const textW = ctx.measureText(text).width;
  const chipW = padX + dotR * 2 + 10 * u + textW + padX;
  const chipH = 34 * u;
  const chipX = m + 14 * u;
  const chipY = h - m - 12 * u - chipH;
  roundRect(ctx, chipX, chipY, chipW, chipH, 4 * u);
  ctx.fillStyle = "rgba(8,10,17,0.78)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.5 * u);
  ctx.strokeStyle = accent;
  ctx.stroke();
  const midY = chipY + chipH / 2;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(chipX + padX + dotR, midY, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.fillText(text, chipX + padX + dotR * 2 + 10 * u, midY + 0.5 * u);

  // Site URL, bottom-right — every share is an inbound link.
  ctx.textAlign = "right";
  ctx.globalAlpha = 0.85;
  ctx.fillText(opts.url.toUpperCase(), w - m - 14 * u, midY + 0.5 * u);
  ctx.globalAlpha = 1;

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
}
