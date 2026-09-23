"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Board, type Painter } from "./holo";
import { box, merge, rbox, reeds, useBoutique, useDisposeAll } from "./xuabelle/kit";

/* ── Xuabelle: the boutique's display wall ───────────────────────────────────
 * The storefront's campaign poster, built INTO the room as joinery rather than
 * propped on a stand: a lacquered full-height wall panel on a shadow-gap toe,
 * a brass-bezelled backlit lightbox, a brass dado inlay, and a cornice whose
 * concealed warm strip washes down the lacquer. Copy is the project's own
 * (constants.ts) — no invented collection names. */

// a freestanding 2.5 m joinery panel (not full height): it must never
// out-rank the hero vitrine, whose cap sits at 1.74
const WALL_W = 0.92;
const WALL_H = 2.5;
const WALL_D = 0.1;
const POSTER_W = 0.68;
const POSTER_H = 1.0;
const POSTER_Y = 1.6;

/** Campaign still, not a third logo: an overhead macro of the Rivière lying
 *  in a deep U on oxblood velvet under a raking warm light. Image only — at
 *  the dwell camera the poster is ~80 px wide, so any type on it would be an
 *  illegible smear; the wordmark lives on the storefront screen + room label. */
function usePosterPainter(): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      // velvet ground: oxblood → plum, with two soft diagonal folds
      const bg = ctx.createLinearGradient(0, 0, w * 0.4, h);
      bg.addColorStop(0, "#3a1a1f");
      bg.addColorStop(0.5, "#241218");
      bg.addColorStop(1, "#140b10");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const fold = (x0: number, y0: number, x1: number, y1: number, a: number) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, "rgba(255,210,180,0)");
        g.addColorStop(0.45, `rgba(255,210,180,${a})`);
        g.addColorStop(0.55, `rgba(255,210,180,${a})`);
        g.addColorStop(0.62, "rgba(20,8,12,0.18)");
        g.addColorStop(1, "rgba(255,210,180,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      fold(w * 0.1, 0, w * 0.9, h * 0.55, 0.05);
      fold(0, h * 0.45, w, h * 0.95, 0.035);
      // raking key light from upper right
      const key = ctx.createRadialGradient(w * 0.62, h * 0.44, 20, w * 0.55, h * 0.5, w * 0.95);
      key.addColorStop(0, "rgba(255,222,190,0.2)");
      key.addColorStop(0.5, "rgba(255,222,190,0.06)");
      key.addColorStop(1, "rgba(255,222,190,0)");
      ctx.fillStyle = key;
      ctx.fillRect(0, 0, w, h);

      // the necklace path: enters top-left, a deep U, exits top-right
      const P0 = [w * 0.06, -h * 0.04];
      const P1 = [w * 0.04, h * 0.92];
      const P2 = [w * 0.98, h * 0.9];
      const P3 = [w * 0.95, -h * 0.04];
      const at = (t: number) => {
        const u = 1 - t;
        const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
        return [a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1]];
      };
      // arc-length table
      const S = 400;
      const pts: number[][] = [];
      const len: number[] = [0];
      for (let i = 0; i <= S; i++) {
        pts.push(at(i / S));
        if (i) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const total = len[S];
      const byLen = (L: number) => {
        let i = 1;
        while (i < S && len[i] < L) i++;
        const f = (L - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      };
      // chain
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + 4, y + 6) : ctx.moveTo(x + 4, y + 6)));
      ctx.stroke();
      ctx.strokeStyle = "#c9a263";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      // graduated stones, spaced by their own size
      const stones: { x: number; y: number; r: number }[] = [];
      let L = total * 0.5;
      const rAt = (L: number) => 7 + 21 * Math.pow(Math.max(0, 1 - Math.abs(L / total - 0.5) / 0.42), 1.5);
      // walk out from the centre both ways
      stones.push({ ...xy(byLen(L)), r: rAt(L) });
      for (const dir of [-1, 1]) {
        L = total * 0.5;
        let r = rAt(L);
        for (;;) {
          const nr = rAt(L + dir * r);
          L += dir * (r + nr + 3);
          if (L < total * 0.04 || L > total * 0.96) break;
          r = nr;
          stones.push({ ...xy(byLen(L)), r });
        }
      }
      function xy([x, y]: number[]) {
        return { x, y };
      }
      for (const s of stones) {
        // cast shadow
        ctx.fillStyle = "rgba(8,3,6,0.45)";
        ctx.beginPath();
        ctx.ellipse(s.x + s.r * 0.35, s.y + s.r * 0.5, s.r * 1.08, s.r * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();
        // gold collet
        ctx.fillStyle = "#b88c4e";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 1.12, 0, Math.PI * 2);
        ctx.fill();
        // stone body
        const g = ctx.createRadialGradient(s.x - s.r * 0.3, s.y - s.r * 0.35, s.r * 0.1, s.x, s.y, s.r);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.45, "#dfe3ec");
        g.addColorStop(1, "#7d8497");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        // alternating light/dark pavilion wedges: reads as a cut brilliant,
        // not a pearl, even at distance
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2 + 0.2;
          const a1 = a0 + Math.PI / 4;
          ctx.fillStyle = k % 2 ? "rgba(52,60,84,0.42)" : "rgba(255,255,255,0.22)";
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.arc(s.x, s.y, s.r, a0, a1);
          ctx.closePath();
          ctx.fill();
        }
        // facet star + table
        ctx.strokeStyle = "rgba(90,98,120,0.45)";
        ctx.lineWidth = Math.max(0.8, s.r * 0.06);
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.2;
          ctx.moveTo(s.x + Math.cos(a) * s.r * 0.45, s.y + Math.sin(a) * s.r * 0.45);
          ctx.lineTo(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) {
          const a = (k / 8) * Math.PI * 2 + 0.2 + Math.PI / 8;
          const x = s.x + Math.cos(a) * s.r * 0.5;
          const y = s.y + Math.sin(a) * s.r * 0.5;
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
        // four claws
        ctx.fillStyle = "#e0c28a";
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.arc(s.x + Math.cos(a) * s.r * 1.02, s.y + Math.sin(a) * s.r * 1.02, Math.max(1.2, s.r * 0.13), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // hairline mat
      ctx.strokeStyle = "rgba(216,182,115,0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, w - 48, h - 48);
    },
    [],
  );
}

export default function XuabelleRoom({ accent }: { accent: string }) {
  const m = useBoutique();
  const poster = usePosterPainter();
  const geos = useMemo(() => {
    const toe = 0.08;
    const bodyH = WALL_H - toe - 0.1;
    const fz = WALL_D / 2; // front face
    const bz = 0.018; // bezel depth
    const bw = 0.03; // bezel width
    const lacquer = merge([
      rbox(WALL_W, bodyH, WALL_D, 0.012, { p: [0, toe + bodyH / 2, 0] }),
      rbox(WALL_W + 0.1, 0.1, WALL_D + 0.16, 0.012, { p: [0, WALL_H - 0.05, 0.05] }), // cornice
      // reeded lower panel under the brass dado
      ...reeds(WALL_W - 0.1, toe + 0.07, 0.68, fz, 0.04, 0.013),
    ]);
    const brass = merge([
      box(WALL_W + 0.004, 0.012, WALL_D + 0.004, { p: [0, toe + 0.006, 0] }),
      // poster bezel
      box(POSTER_W + bw * 2, bw, bz, { p: [0, POSTER_Y + POSTER_H / 2 + bw / 2, fz + bz / 2] }),
      box(POSTER_W + bw * 2, bw, bz, { p: [0, POSTER_Y - POSTER_H / 2 - bw / 2, fz + bz / 2] }),
      box(bw, POSTER_H, bz, { p: [POSTER_W / 2 + bw / 2, POSTER_Y, fz + bz / 2] }),
      box(bw, POSTER_H, bz, { p: [-POSTER_W / 2 - bw / 2, POSTER_Y, fz + bz / 2] }),
      // dado inlay + cornice underside lip
      box(WALL_W - 0.12, 0.01, 0.006, { p: [0, 0.72, fz + 0.003] }),
      box(WALL_W + 0.1, 0.01, WALL_D + 0.16, { p: [0, WALL_H - 0.105, 0.05] }),
    ]);
    const gap = box(WALL_W - 0.06, toe, WALL_D - 0.03, { p: [0, toe / 2, 0] });
    const strip = box(WALL_W - 0.02, 0.012, 0.012, { p: [0, WALL_H - 0.118, fz + 0.1] });
    const wash = new THREE.PlaneGeometry(WALL_W - 0.04, 0.9);
    wash.translate(0, WALL_H - 0.12 - 0.45, fz + 0.004);
    return { lacquer, brass, gap, strip, wash };
  }, []);
  useDisposeAll(geos);
  return (
    // Deep in the back-left corner, clear of the hero screen's zone: its right
    // edge (cornice included) ends at x≈-3.27, z≈-1.6; its left edge meets
    // the side wall with a shadow-gap reveal. Pushed back to z≈-1.1 so the
    // dwell camera sees ~50 px of clear air between it and the hero vitrine.
    <group position={[-3.45, 0, -1.12]} rotation-y={1.2}>
      <mesh geometry={geos.gap} material={m.gap} />
      <mesh geometry={geos.lacquer} material={m.lacquer} />
      <mesh geometry={geos.brass} material={m.brass} />
      <mesh geometry={geos.strip} material={m.warmLine} />
      <mesh geometry={geos.wash} material={m.wash} renderOrder={2} />
      <Board
        w={POSTER_W}
        h={POSTER_H}
        res={640}
        paint={poster}
        accent={accent}
        slab={false}
        position={[0, POSTER_Y, WALL_D / 2 + 0.006]}
      />
    </group>
  );
}
