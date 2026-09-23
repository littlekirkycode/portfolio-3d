"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { roundRect, hexA, useTextTexture } from "../../canvas2d";
import { INK } from "../../theme";
import { ORBIT, drawIcon } from "./memories";

/* ── memory tiles: one icon atlas shared by the desktop core + the compact
 *  portrait core (only one of the two is ever mounted) ─────────────────── */

export const CELL = 128;

/** The accent pushed toward a light, slightly desaturated tint: reads as
 *  LIGHT against the saturated blue bay ambient instead of more blue paint. */
export function lightTint(accent: string, t = 0.42): THREE.Color {
  return new THREE.Color(accent).lerp(new THREE.Color("#e4e9ff"), t);
}

/** Icon atlas: one cell per orbit memory. Recalled = a lit glass tile face
 *  (soft light fill, crisp light edge, ink icon); dormant = a solid dark
 *  glass chip with a quiet icon (stored, not recalled). */
export function useChipAtlas(accent: string) {
  const paint = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      const lt = `#${lightTint(accent, 0.3).getHexString()}`;
      ORBIT.forEach((m, i) => {
        const x = i * CELL;
        const lit = m.score !== undefined;
        roundRect(ctx, x + 7, 7, CELL - 14, CELL - 14, 22);
        if (lit) {
          const g = ctx.createLinearGradient(0, 0, 0, CELL);
          g.addColorStop(0, hexA(lt, 0.46));
          g.addColorStop(1, hexA(accent, 0.2));
          ctx.fillStyle = g;
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = hexA(lt, 1);
          ctx.stroke();
          // glass sheen along the top edge
          ctx.save();
          ctx.clip();
          const s = ctx.createLinearGradient(0, 7, 0, 50);
          s.addColorStop(0, "rgba(255,255,255,0.26)");
          s.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = s;
          ctx.fillRect(x, 0, CELL, 50);
          ctx.restore();
          ctx.strokeStyle = INK;
        } else {
          const g = ctx.createLinearGradient(0, 0, 0, CELL);
          g.addColorStop(0, "rgba(44,52,72,0.96)");
          g.addColorStop(1, "rgba(22,27,40,0.96)");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(150,162,190,0.45)";
          ctx.stroke();
          ctx.strokeStyle = "rgba(190,200,222,0.5)";
        }
        drawIcon(ctx, m.icon, x + CELL / 2, CELL / 2, 64);
      });
    },
    [accent],
  );
  return useTextTexture(CELL * ORBIT.length, CELL, paint);
}

/** A square plane mapped onto atlas cell `i`. */
export function chipGeometry(i: number, size: number) {
  const g = new THREE.PlaneGeometry(size, size);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / ORBIT.length);
  uv.needsUpdate = true;
  return g;
}
