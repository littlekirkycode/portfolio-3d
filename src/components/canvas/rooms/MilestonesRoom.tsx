"use client";

import { useMemo } from "react";
import { SITE } from "@/lib/constants";
import { roundRect } from "../canvas2d";
import { Board, INK, Stand, fonts, paintKicker, type Painter } from "./holo";

/* ── Milestones: a hall of fame ──────────────────────────────────────────────
 * The trophies stay; beside them a gilt hall-of-fame board carries the three
 * headline numbers at display size (from SITE.stats) and a row of unlocked
 * achievement badges — the wins read as wins, not as a bullet list. */

const BADGES = ["FEATURED · TECHTUDO", "FOUNDERS UNI · $25K", "SOLO-BUILT"];

function useFamePainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono } = fonts();
      const pad = 46;
      paintKicker(ctx, "HALL OF FAME", pad, 72, accent, 30);
      let y = 215;
      for (const s of SITE.stats) {
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 26 * (ctx.getTransform().a || 1);
        ctx.fillStyle = "#f6dc93";
        ctx.font = `700 150px ${ser}`;
        ctx.textAlign = "left";
        ctx.fillText(s.value, pad, y);
        ctx.restore();
        ctx.fillStyle = "rgba(244,241,234,0.72)";
        ctx.font = `600 28px ${mono}`;
        ctx.fillText(s.label.toUpperCase(), pad + 4, y + 48);
        ctx.strokeStyle = "rgba(233,185,73,0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pad, y + 84);
        ctx.lineTo(w - pad, y + 84);
        ctx.stroke();
        y += 285;
      }
      // unlocked badges
      const by = h - 170;
      ctx.fillStyle = "rgba(244,241,234,0.5)";
      ctx.font = `500 22px ${mono}`;
      ctx.fillText("ACHIEVEMENTS UNLOCKED", pad, by - 20);
      BADGES.forEach((b, i) => {
        const x = pad;
        const yy = by + i * 40;
        ctx.fillStyle = accent;
        // hexagon medal
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const px = x + 14 + Math.cos(a) * 13;
          const py = yy + 2 + Math.sin(a) * 13;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `600 24px ${mono}`;
        ctx.fillText(b, x + 42, yy + 11);
      });
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      roundRect(ctx, 18, 18, w - 36, h - 36, 18);
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    [accent],
  );
}

export default function MilestonesRoom({ accent }: { accent: string }) {
  const fame = useFamePainter(accent);
  return (
    <group position={[-3.15, 0, 1.3]} rotation-y={0.9}>
      <Stand top={0.62} accent={accent} />
      <Board w={1.12} h={1.86} paint={fame} accent={accent} position={[0, 1.55, 0.02]} />
    </group>
  );
}
