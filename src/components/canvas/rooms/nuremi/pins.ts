import * as THREE from "three";
import { hexA, roundRect } from "../../canvas2d";
import { accentInk, fonts, INK, track, type Painter } from "../holo";

/* ── the Nuremi sign atlas (one canvas, one texture) ─────────────────────────
 * Row 1 (top-left): three numbered teardrop map pins side by side — cell i
 * covers x ∈ [i·PIN_CELL.w, (i+1)·PIN_CELL.w], the tip at the cell's
 * bottom-centre. Pin 1 (the pick) is ink with an accent core; picks 2/3 are
 * accent with an ink keyline.
 * Right column: the wayfinding totem's face — the Nuremi pin mark, a vertical
 * "you → pick 1" route legend and the room's name set along the strip. */

export const ATLAS = { w: 672, h: 1024 };
export const PIN_CELL = { w: 128, h: 168 };
/** Totem face rect inside the atlas (canvas px, y down). */
export const FACE = { x: 408, y: 0, w: 256, h: 1024 };

/** UV rect (three.js, v up) of a canvas-px rect in the atlas. */
export function atlasUV(x: number, y: number, w: number, h: number) {
  return { u0: x / ATLAS.w, u1: (x + w) / ATLAS.w, v0: 1 - (y + h) / ATLAS.h, v1: 1 - y / ATLAS.h };
}

/** Remap a PlaneGeometry's UVs onto an atlas rect. */
export function mapPlaneUV(g: THREE.PlaneGeometry, r: { u0: number; u1: number; v0: number; v1: number }) {
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, r.u0 + (r.u1 - r.u0) * uv.getX(k), r.v0 + (r.v1 - r.v0) * uv.getY(k));
  }
  uv.needsUpdate = true;
}

/** Teardrop pin outline: head centre (cx, cy), head radius r, tip at tipY. */
function pinPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tipY: number) {
  const L = tipY - cy;
  const b = Math.acos(r / L);
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx + Math.cos(Math.PI / 2 + b) * r, cy + Math.sin(Math.PI / 2 + b) * r);
  ctx.arc(cx, cy, r, Math.PI / 2 + b, Math.PI * 2.5 - b);
  ctx.closePath();
}

function paintPins(ctx: CanvasRenderingContext2D, accent: string) {
  const { mono } = fonts();
  for (let i = 0; i < 3; i++) {
    const cx = PIN_CELL.w * i + PIN_CELL.w / 2;
    const cy = 60;
    const r = 46;
    const hero = i === 0;
    pinPath(ctx, cx, cy, r, PIN_CELL.h - 4);
    ctx.fillStyle = hero ? INK : accent;
    ctx.fill();
    ctx.lineWidth = hero ? 4 : 6;
    ctx.strokeStyle = hero ? "rgba(16,13,30,0.9)" : INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fillStyle = hero ? accent : "rgba(20,16,36,0.96)";
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 46px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), cx, cy + 3);
  }
}

function paintFace(ctx: CanvasRenderingContext2D, accent: string) {
  const { mono } = fonts();
  const { x, y, w, h } = FACE;
  ctx.save();
  ctx.translate(x, y);
  // smoked glass face
  roundRect(ctx, 4, 4, w - 8, h - 8, 22);
  const body = ctx.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, "#1f1d33");
  body.addColorStop(0.5, "#16152a");
  body.addColorStop(1, "#121122");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const sh = ctx.createLinearGradient(0, 0, w, h * 0.35);
  sh.addColorStop(0, "rgba(255,255,255,0.07)");
  sh.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = hexA(accent, 0.75);
  ctx.stroke();

  // header: the Nuremi pin mark on an accent tile
  const hx = w / 2;
  roundRect(ctx, 26, 26, w - 52, 196, 18);
  ctx.fillStyle = hexA(accent, 0.9);
  ctx.fill();
  pinPath(ctx, hx, 102, 50, 196);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx, 102, 22, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();

  // the name, set along the strip (reads bottom → top)
  ctx.save();
  ctx.translate(80, 262);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = accentInk(accent, 0.6);
  ctx.font = `700 88px ${mono}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  track(ctx, 0.04, 88);
  ctx.fillText("NEAR YOU", 0, 0);
  track(ctx, 0);
  ctx.restore();

  // route legend: you (ring, bottom) → pick 1 (ink badge, top)
  const rx = 190;
  const y0 = h - 70;
  const y1 = 300;
  ctx.strokeStyle = hexA(accent, 0.5);
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(rx, y0);
  ctx.lineTo(rx, y1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(240,234,255,0.92)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(rx, y0);
  ctx.lineTo(rx, y1);
  ctx.stroke();
  // picks 3 and 2 as side stops
  for (const [py, n] of [
    [y0 - 250, "3"],
    [y0 - 440, "2"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, py, 26, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1830";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `700 32px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n, rx, py + 2);
  }
  // you
  ctx.beginPath();
  ctx.arc(rx, y0, 22, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // pick 1 — the pinned answer
  ctx.beginPath();
  ctx.arc(rx, y1, 40, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = `700 46px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("1", rx, y1 + 3);
  ctx.restore();
}

export function makeAtlasPainter(accent: string): Painter {
  return (ctx) => {
    paintPins(ctx, accent);
    paintFace(ctx, accent);
  };
}
