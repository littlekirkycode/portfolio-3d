"use client";

import { useMemo } from "react";
import { hexA, roundRect, useTextTexture } from "../../canvas2d";
import { fonts } from "../holo";

/* One 1024×512 label atlas for every painted marking in the cell (the three
 * transit-case stencils + the LRU nameplate) — a single canvas texture. */

export const ATLAS = {
  caseA: [0, 0.5, 0.625, 1] as [number, number, number, number],
  caseB: [0.625, 0.5, 1, 1] as [number, number, number, number],
  caseC: [0, 0, 0.625, 0.5] as [number, number, number, number],
  plate: [0.625, 0, 1, 0.5] as [number, number, number, number],
};

const STENCIL = "rgba(232,227,214,0.92)";

function upArrows(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.lineWidth = s * 0.16;
  for (const dx of [0, s * 0.8]) {
    ctx.beginPath();
    ctx.moveTo(x + dx, y + s);
    ctx.lineTo(x + dx, y);
    ctx.moveTo(x + dx - s * 0.32, y + s * 0.34);
    ctx.lineTo(x + dx, y);
    ctx.lineTo(x + dx + s * 0.32, y + s * 0.34);
    ctx.stroke();
  }
  ctx.fillRect(x - s * 0.4, y + s * 1.18, s * 1.6, s * 0.14);
}

export function useLabelAtlas(accent: string) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D) => {
      const { mono } = fonts();
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = STENCIL;
      ctx.strokeStyle = STENCIL;

      /* A — large case: 640×256 */
      ctx.font = `700 112px ${mono}`;
      ctx.fillText("LRU", 26, 116);
      ctx.font = `600 40px ${mono}`;
      ctx.fillText("QUALIFIED · QTY 01", 30, 174);
      ctx.fillStyle = hexA(accent, 0.95);
      ctx.fillRect(30, 200, 64, 30);
      ctx.fillStyle = STENCIL;
      ctx.font = `600 32px ${mono}`;
      ctx.fillText("RUGGEDISED", 112, 228);
      upArrows(ctx, 540, 40, 56);

      /* B — small case: 384×256 at x 640 */
      ctx.font = `700 84px ${mono}`;
      ctx.fillText("SPARES", 664, 104);
      ctx.font = `600 38px ${mono}`;
      ctx.fillText("KIT 01", 668, 162);
      ctx.lineWidth = 4;
      ctx.strokeRect(668, 190, 196, 46);
      ctx.font = `600 30px ${mono}`;
      ctx.fillText("FRAGILE", 690, 224);

      /* C — case three: 640×256 at y 256 */
      ctx.font = `700 96px ${mono}`;
      ctx.fillText("JIGS", 26, 364);
      ctx.font = `600 36px ${mono}`;
      ctx.fillText("FIXTURE SET · AK-01", 30, 424);
      ctx.fillStyle = hexA(accent, 0.95);
      ctx.fillRect(30, 452, 64, 30);
      ctx.fillStyle = STENCIL;
      ctx.font = `600 30px ${mono}`;
      ctx.fillText("KEEP DRY", 112, 479);

      /* D — LRU nameplate: 384×256 at (640, 256) */
      roundRect(ctx, 648, 264, 368, 240, 18);
      ctx.fillStyle = "#c3c9d3";
      ctx.fill();
      ctx.fillStyle = hexA(accent, 1);
      ctx.fillRect(648, 264 + 18, 14, 204);
      ctx.fillStyle = "#1b1f28";
      ctx.font = `700 60px ${mono}`;
      ctx.fillText("LRU", 684, 340);
      ctx.font = `600 38px ${mono}`;
      ctx.fillText("QUAL UNIT", 686, 404);
      ctx.font = `500 30px ${mono}`;
      ctx.fillText("S/N 0118", 686, 460);
    },
    [accent],
  );
  return useTextTexture(1024, 512, render);
}
