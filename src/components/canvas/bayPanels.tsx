"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { SKILLS, ACHIEVEMENTS, EXPERIENCE, ALLIED_ROOM } from "@/lib/constants";
import { familyVar, wrapText, roundRect, useTextTexture } from "./canvas2d";
import type { Room } from "./hallConfig";

/* ── holographic bay signage (split out of Walls.tsx, finding 34): the
 *    floating info/timeline panels, the glowing room-name label and the
 *    station plaque beside each opening. All flat CanvasTexture quads. ── */

const INK = "#f4f1ea";

/* ── floating holographic info panel (description / skills / achievements) ── */

const DESC_W = 3.2;
const DESC_H = 2.62;

export function InfoPanel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const sans = familyVar("--ff-body", "system-ui, sans-serif");
      // holographic panel: translucent slab + glowing accent rim (blooms → projection)
      roundRect(ctx, 6, 6, w - 12, h - 12, 30);
      ctx.fillStyle = "rgba(8,10,18,0.50)";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = room.accent;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.16)";
      ctx.stroke();
      ctx.fillStyle = room.accent;
      roundRect(ctx, 64, 74, 64, 9, 4);
      ctx.fill();

      const padX = 64;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `500 34px ${mono}`;
      ctx.fillText(`(${room.index})  ${room.category.toUpperCase()}`, padX, 144);
      ctx.fillStyle = INK;
      ctx.font = `700 108px ${ser}`;
      ctx.fillText(room.title, padX - 2, 248);
      ctx.strokeStyle = "rgba(244,241,234,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, 300);
      ctx.lineTo(w - padX, 300);
      ctx.stroke();

      ctx.textBaseline = "top";
      let y = 364;
      if (room.kind === "project" && room.project) {
        ctx.fillStyle = "rgba(244,241,234,0.90)";
        ctx.font = `400 42px ${sans}`;
        y = wrapText(ctx, room.project.description, padX, y, w - padX * 2, 58) + 30;
        ctx.font = `500 30px ${mono}`;
        let px = padX;
        for (const t of room.project.tech) {
          const tw = ctx.measureText(t).width + 52;
          if (px + tw > w - padX) {
            px = padX;
            y += 76;
          }
          roundRect(ctx, px, y, tw, 58, 29);
          ctx.strokeStyle = "rgba(244,241,234,0.26)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.fillText(t, px + 26, y + 16);
          px += tw + 18;
        }
        if (room.project.href && room.project.href !== "#") {
          ctx.fillStyle = room.accent;
          ctx.font = `600 40px ${mono}`;
          ctx.fillText("VIEW PROJECT  ↗", padX, h - 104);
        }
      } else if (room.kind === "skills") {
        // wrapped item lines — the joined lists used to run past the glass
        // border; wrapText keeps every row inside the rounded rect
        y = 348;
        for (const grp of SKILLS) {
          ctx.fillStyle = room.accent;
          ctx.font = `500 28px ${mono}`;
          ctx.fillText(grp.group.toUpperCase(), padX, y);
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.font = `400 34px ${sans}`;
          y = wrapText(ctx, grp.items.join(" · "), padX, y + 38, w - padX * 2, 44) + 12;
        }
      } else if (room.kind === "defence") {
        ctx.fillStyle = "rgba(244,241,234,0.90)";
        ctx.font = `400 42px ${sans}`;
        y = wrapText(ctx, ALLIED_ROOM.description, padX, y, w - padX * 2, 58) + 30;
        ctx.font = `500 30px ${mono}`;
        let px = padX;
        for (const t of ["DFM", "Tolerancing", "CAD", "Systems", "Hardware", "Test"]) {
          const tw = ctx.measureText(t).width + 52;
          if (px + tw > w - padX) {
            px = padX;
            y += 76;
          }
          roundRect(ctx, px, y, tw, 58, 29);
          ctx.strokeStyle = "rgba(244,241,234,0.26)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.fillText(t, px + 26, y + 16);
          px += tw + 18;
        }
      } else {
        ctx.font = `400 46px ${sans}`;
        for (const a of ACHIEVEMENTS) {
          ctx.fillStyle = room.accent;
          ctx.fillText("◆", padX, y + 4);
          ctx.fillStyle = "rgba(244,241,234,0.92)";
          ctx.fillText(a, padX + 54, y);
          y += 82;
        }
      }
    },
    [room],
  );
  const tex = useTextTexture(1000, 820, render);
  return (
    <mesh>
      <planeGeometry args={[DESC_W, DESC_H]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── experience timeline (a taller, readable visual timeline) ───────────── */

const TL_W = 2.35;
const TL_H = 3.2;

export function TimelinePanel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const sans = familyVar("--ff-body", "system-ui, sans-serif");
      roundRect(ctx, 6, 6, w - 12, h - 12, 30);
      ctx.fillStyle = "rgba(9,11,19,0.62)";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = room.accent;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.stroke();
      ctx.fillStyle = room.accent;
      roundRect(ctx, 60, 70, 58, 8, 4);
      ctx.fill();

      const padX = 60;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `500 28px ${mono}`;
      ctx.fillText(`(${room.index})  ${room.category.toUpperCase()}`, padX, 132);
      ctx.fillStyle = INK;
      ctx.font = `700 98px ${ser}`;
      ctx.fillText(room.title, padX - 2, 230);

      const lineX = padX + 13;
      const top = 330;
      const bottom = h - 110;
      const n = EXPERIENCE.length;
      const step = (bottom - top) / (n - 1);
      ctx.strokeStyle = "rgba(244,241,234,0.16)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lineX, top);
      ctx.lineTo(lineX, top + step * (n - 1));
      ctx.stroke();

      ctx.textBaseline = "top";
      EXPERIENCE.forEach((e, i) => {
        const cy = top + step * i;
        ctx.beginPath();
        ctx.arc(lineX, cy, 23, 0, Math.PI * 2);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = room.accent;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(lineX, cy, 11, 0, Math.PI * 2);
        ctx.fillStyle = room.accent;
        ctx.fill();
        const tx = lineX + 50;
        ctx.fillStyle = room.accent;
        ctx.font = `500 27px ${mono}`;
        ctx.fillText(e.dates, tx, cy - 40);
        ctx.fillStyle = INK;
        ctx.font = `600 46px ${sans}`;
        ctx.fillText(e.role, tx, cy - 4);
        ctx.fillStyle = "rgba(244,241,234,0.62)";
        ctx.font = `400 31px ${sans}`;
        ctx.fillText(e.org, tx, cy + 52);
      });
    },
    [room],
  );
  const tex = useTextTexture(840, 1160, render);
  return (
    <mesh>
      <planeGeometry args={[TL_W, TL_H]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── holographic room name label (glows above the bay) ──────────────────── */

export function RoomLabel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      // two-pass draw: soft accent halo + near-white core, so low-chroma accents
      // (Capabilities grey) still read clearly without going neon
      const core = "#" + new THREE.Color(room.accent).lerp(new THREE.Color(INK), 0.72).getHexString();
      const label = room.title.toUpperCase();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 118px ${ser}`;
      ctx.fillStyle = room.accent;
      ctx.shadowColor = room.accent;
      ctx.shadowBlur = 42;
      ctx.fillText(label, w / 2, h / 2);
      ctx.fillText(label, w / 2, h / 2); // second stamp deepens the halo
      ctx.shadowBlur = 0;
      ctx.fillStyle = core;
      ctx.fillText(label, w / 2, h / 2);
    },
    [room],
  );
  const tex = useTextTexture(1024, 256, render);
  return (
    <mesh>
      <planeGeometry args={[2.9, 0.72]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── station plaque beside each bay opening (number + name) ───────────────── */

export function BayPlaque({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `600 ${Math.round(h * 0.32)}px ${mono}`;
      ctx.fillText(`(${room.index})`, 20, h * 0.4);
      ctx.fillStyle = "rgba(244,241,234,0.92)";
      ctx.font = `600 ${Math.round(h * 0.27)}px ${mono}`;
      ctx.fillText(room.title.toUpperCase(), 20, h * 0.82);
      ctx.fillStyle = room.accent;
      ctx.fillRect(20, h * 0.9, w * 0.55, 5);
    },
    [room],
  );
  const tex = useTextTexture(512, 240, render);
  return (
    <mesh>
      <planeGeometry args={[0.98, 0.46]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
