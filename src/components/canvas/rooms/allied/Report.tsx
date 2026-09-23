"use client";

import { useMemo } from "react";
import { Board, INK, fonts, paintKicker, type Painter } from "../holo";
import { hexA, roundRect } from "../../canvas2d";
import * as THREE from "three";
import { box, merge } from "./geo";
import { useGeoSet, type AlliedMats } from "./mats";

/* ── the CMM controller display — an inspection report for part AK-01 ────────
 * Carried on a swing arm off the side wall, just above the machine (and below
 * the escort drone's parking band). Three GD&T feature-control frames — the
 * real language of precision tolerances — each PASS. */

const W = 1.35;
const H = 0.56;
const RES = 1040;

type Sym = "pos" | "flat" | "perp";

function drawSym(ctx: CanvasRenderingContext2D, s: Sym, cx: number, cy: number, r: number) {
  ctx.beginPath();
  if (s === "pos") {
    ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
  } else if (s === "flat") {
    ctx.moveTo(cx - r * 0.7, cy + r * 0.45);
    ctx.lineTo(cx + r, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.7, cy - r * 0.45);
    ctx.lineTo(cx - r, cy - r * 0.45);
    ctx.closePath();
  } else {
    ctx.moveTo(cx - r, cy + r * 0.8);
    ctx.lineTo(cx + r, cy + r * 0.8);
    ctx.moveTo(cx, cy + r * 0.8);
    ctx.lineTo(cx, cy - r * 0.8);
  }
  ctx.stroke();
}

function useReportPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono, sans } = fonts();
      const px = 50;
      ctx.textBaseline = "alphabetic";
      paintKicker(ctx, "CMM INSPECTION", px, 80, accent, 42);
      ctx.font = `600 38px ${mono}`;
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,241,234,0.7)";
      ctx.fillText("AK-01 · 7075", w - px, 80);
      ctx.fillStyle = "rgba(244,241,234,0.16)";
      ctx.fillRect(px, 108, w - px * 2, 2);

      const rows: { label: string; sym: Sym; tol: string; datum: string }[] = [
        { label: "Bore", sym: "pos", tol: "Ø0.02", datum: "A" },
        { label: "Face", sym: "flat", tol: "0.01", datum: "" },
        { label: "Lug", sym: "perp", tol: "0.02", datum: "A" },
      ];
      const rowH = (h - 112) / 3;
      const y0 = 110;
      const fx = 212; // frame left
      rows.forEach((r, i) => {
        const cy = y0 + i * rowH + rowH / 2;
        ctx.textAlign = "left";
        ctx.fillStyle = INK;
        ctx.font = `600 54px ${sans}`;
        ctx.fillText(r.label, px, cy + 19);
        // feature control frame: [symbol | tolerance | datum]
        const ch = 80;
        const cells = [96, 214, r.datum ? 96 : 0].filter(Boolean);
        let x = fx;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3.5;
        ctx.strokeRect(fx, cy - ch / 2, cells.reduce((a, b) => a + b, 0), ch);
        cells.forEach((cw, j) => {
          if (j > 0) {
            ctx.beginPath();
            ctx.moveTo(x, cy - ch / 2);
            ctx.lineTo(x, cy + ch / 2);
            ctx.stroke();
          }
          ctx.fillStyle = INK;
          if (j === 0) {
            ctx.lineWidth = 4;
            drawSym(ctx, r.sym, x + cw / 2, cy, 24);
            ctx.lineWidth = 3.5;
          } else {
            ctx.font = `600 50px ${mono}`;
            ctx.textAlign = "center";
            ctx.fillText(j === 1 ? r.tol : r.datum, x + cw / 2, cy + 17);
          }
          x += cw;
        });
        // status chip
        const sw = 196;
        const sx = w - px - sw;
        roundRect(ctx, sx, cy - 36, sw, 72, 36);
        ctx.fillStyle = hexA(accent, 0.16);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = accent;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + 32, cy + 1);
        ctx.lineTo(sx + 46, cy + 15);
        ctx.lineTo(sx + 70, cy - 13);
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.font = `700 44px ${mono}`;
        ctx.textAlign = "left";
        ctx.fillText("PASS", sx + 84, cy + 15);
      });

    },
    [accent],
  );
}

/** Controller display on a wall swing-arm (installed hardware, not a
 *  floating decal). `position` = display centre in the parent frame; the arm
 *  runs from a bracket on the wall plane x = `wallX` to the display's back.
 *  `mount="ceiling"` (portrait) instead hangs it square-on from two drop rods
 *  to the ceiling at y = `ceilY`; `scale` shrinks the whole unit. */
export default function Report({
  accent,
  m,
  position,
  rotY,
  wallX = -3.7,
  mount = "arm",
  ceilY = 4,
  scale = 1,
}: {
  accent: string;
  m: AlliedMats;
  position: [number, number, number];
  rotY: number;
  wallX?: number;
  mount?: "arm" | "ceiling";
  ceilY?: number;
  scale?: number;
}) {
  const paint = useReportPainter(accent);
  const [px, py, pz] = position;
  const g = useGeoSet(() => {
    // bezel: a slim dark housing the translucent slab sits in (display frame)
    const bezel = box(W + 0.05, H + 0.05, 0.035);
    bezel.translate(0, 0, -0.032);
    if (mount === "ceiling") {
      // two drop rods from the bezel top to a ceiling track, in the display's
      // own (scaled) frame — rod length compensates for the scale
      const top = H / 2 + 0.025;
      const len = (ceilY - py) / scale - top;
      const rods: { g: THREE.BufferGeometry; p: [number, number, number] }[] = [];
      for (const x of [-W * 0.34, W * 0.34]) {
        rods.push(
          { g: new THREE.CylinderGeometry(0.012, 0.012, len, 10), p: [x, top + len / 2, -0.032] },
          { g: new THREE.CylinderGeometry(0.024, 0.024, 0.04, 14), p: [x, top + 0.02, -0.032] },
        );
      }
      const arm = merge(rods);
      const bracket = merge([{ g: box(W * 0.8, 0.03, 0.08), p: [0, top + len - 0.015, -0.032] }]);
      return { arm, bracket, bezel };
    }
    // pivot 7 cm behind the display centre, on its normal
    const nx = Math.sin(rotY), nz = Math.cos(rotY);
    const pv = new THREE.Vector3(px - nx * 0.07, py, pz - nz * 0.07);
    // wall bracket level with the pivot, 0.28 m further back along the wall
    const wb = new THREE.Vector3(wallX + 0.03, py, pv.z - 0.28);
    const elbow = new THREE.Vector3((wb.x + pv.x) / 2 - 0.06, py, (wb.z + pv.z) / 2 - 0.12);
    const tube = (a: THREE.Vector3, b: THREE.Vector3) => {
      const d = b.clone().sub(a);
      const c = new THREE.CylinderGeometry(0.018, 0.018, d.length(), 14, 1);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return c;
    };
    const arm = merge([
      { g: tube(wb, elbow) },
      { g: tube(elbow, pv) },
      { g: new THREE.CylinderGeometry(0.03, 0.03, 0.06, 18), p: [elbow.x, elbow.y, elbow.z] },
      { g: new THREE.CylinderGeometry(0.03, 0.03, 0.06, 18), p: [pv.x, pv.y, pv.z] },
    ]);
    const bracket = merge([
      { g: box(0.02, 0.22, 0.12), p: [wallX + 0.01, py, wb.z] },
      { g: new THREE.CylinderGeometry(0.032, 0.032, 0.09, 18), p: [wb.x, py, wb.z] },
    ]);
    return { arm, bracket, bezel };
  }, `${px},${py},${pz},${rotY},${wallX},${mount},${ceilY},${scale}`);
  if (mount === "ceiling") {
    return (
      <group position={position} rotation-y={rotY} scale={scale}>
        <mesh geometry={g.arm} material={m.anod} />
        <mesh geometry={g.bracket} material={m.paintDark} />
        <mesh geometry={g.bezel} material={m.shadow} />
        <Board w={W} h={H} res={RES} paint={paint} accent={accent} position={[0, 0, -0.012]} />
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={g.arm} material={m.anod} />
      <mesh geometry={g.bracket} material={m.paintDark} />
      <group position={position} rotation-y={rotY} scale={scale}>
        <mesh geometry={g.bezel} material={m.shadow} />
        <Board w={W} h={H} res={RES} paint={paint} accent={accent} position={[0, 0, -0.012]} />
      </group>
    </group>
  );
}
