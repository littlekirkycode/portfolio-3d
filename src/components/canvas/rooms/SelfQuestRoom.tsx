"use client";

import { useMemo } from "react";
import { roundRect } from "../canvas2d";
import { MATERIALS, NEUTRAL } from "../theme";
import { Board, INK, accentInk, fonts, paintKicker, type Painter } from "./holo";
import { useDisposable } from "./selfquest/useDisposable";

/* ── SelfQuest: the GAME layer, installed as ship hardware ───────────────────
 * The app turns workouts into an RPG. Its quest log hangs like a real gym
 * display — a bezelled screen on ceiling drop rods — above the Level-Up Pod
 * (the hero, ./selfquest/LevelUpPod), deliberately smaller and quieter than
 * it. Three training quests with XP payouts, the hero's level, the level's
 * XP bar (the same 84.5% the pod's arc shows) and the next level. The app's
 * real numbers live on the info card, not here (no stat repeated thrice). */

const QUESTS: { text: string; xp: number; done: boolean }[] = [
  { text: "Push day · 5 sets", xp: 250, done: true },
  { text: "Run 5 km", xp: 180, done: true },
  { text: "Core · 10 min", xp: 90, done: false },
];

function useQuestPainter(accent: string): Painter {
  // laid out for a 1024 × 670 canvas (Board res 1024, 1.3 × 0.85 m). Few
  // lines, big type: every line must read from the dwell camera.
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono, sans } = fonts();
      const pad = 58;
      // screen face (a display, not a floating decal) with a faint top sheen
      roundRect(ctx, 0, 0, w, h, 22);
      ctx.fillStyle = "#0c0f18";
      ctx.fill();
      const sheen = ctx.createLinearGradient(0, 0, 0, h);
      sheen.addColorStop(0, "rgba(255,255,255,0.05)");
      sheen.addColorStop(0.35, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fill();

      // header row: the log + the hero's level
      paintKicker(ctx, "DAILY QUESTS", pad, 94, accent, 42);
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = `600 44px ${mono}`;
      ctx.fillText("LV 42", w - pad, 94);
      ctx.fillStyle = "rgba(244,241,234,0.14)";
      ctx.fillRect(pad, 126, w - pad * 2, 2);

      // quests
      let y = 212;
      for (const q of QUESTS) {
        const bx = pad;
        const s = 50;
        ctx.lineWidth = 5;
        ctx.strokeStyle = q.done ? accent : "rgba(244,241,234,0.5)";
        roundRect(ctx, bx, y - 42, s, s, 11);
        if (q.done) {
          ctx.fillStyle = accent;
          ctx.fill();
          ctx.strokeStyle = "#0c0f18";
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(bx + 13, y - 18);
          ctx.lineTo(bx + 22, y - 9);
          ctx.lineTo(bx + 38, y - 31);
          ctx.stroke();
        } else {
          ctx.stroke();
        }
        ctx.textAlign = "left";
        ctx.fillStyle = q.done ? INK : "rgba(244,241,234,0.72)";
        ctx.font = `500 54px ${sans}`;
        ctx.fillText(q.text, bx + 84, y);
        ctx.textAlign = "right";
        ctx.fillStyle = q.done ? accentInk(accent, 0.25) : "rgba(244,241,234,0.55)";
        ctx.font = `600 44px ${mono}`;
        ctx.fillText(`+${q.xp} XP`, w - pad, y);
        y += 92;
      }

      // the level's XP bar (the same 84.5% the pod's arc shows)
      const barY = 436;
      ctx.fillStyle = "rgba(244,241,234,0.12)";
      roundRect(ctx, pad, barY, w - pad * 2, 22, 11);
      ctx.fill();
      ctx.fillStyle = accent;
      roundRect(ctx, pad, barY, (w - pad * 2) * 0.845, 22, 11);
      ctx.fill();

      // footer: the level-up readout in the arc's language (the numbers live
      // on the info card — the board stays the GAME layer)
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(244,241,234,0.62)";
      ctx.font = `500 36px ${mono}`;
      ctx.fillText("8,450 / 10,000 XP", pad, h - 70);
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = `700 76px ${ser}`;
      ctx.fillText("LV 43", w - pad, h - 62);
      const lvW = ctx.measureText("LV 43").width;
      ctx.fillStyle = accentInk(accent, 0.25);
      ctx.font = `600 36px ${mono}`;
      ctx.fillText("NEXT →", w - pad - lvW - 22, h - 70);
    },
    [accent],
  );
}

const W = 1.3;
export const QUEST_H = 0.85;
const H = QUEST_H;

/** The quest log as installed ship hardware: a bezelled display hung from the
 *  ceiling on two drop rods over a steel rail (the same grounded mount the
 *  other bays use for overhead screens). Props place + yaw it; the rods always
 *  run up to the bay ceiling (y = 4). Local origin = the screen centre. */
export default function SelfQuestRoom({
  accent,
  position,
  yaw = 0,
  ceiling = 4,
}: {
  accent: string;
  position: [number, number, number];
  yaw?: number;
  ceiling?: number;
}) {
  const quest = useQuestPainter(accent);
  const bezel = useDisposable(() => MATERIALS.paint({ color: NEUTRAL.hull }));
  const steel = useDisposable(() => MATERIALS.steel());
  const plate = useDisposable(() => MATERIALS.paint({ color: NEUTRAL.hullLight }));
  const railY = H / 2 + 0.06;
  const rod = ceiling - position[1] - railY;
  return (
    <group position={position} rotation-y={yaw}>
      {/* housing: slim bezel with depth, centred behind the face */}
      <mesh position-z={-0.026} material={bezel}>
        <boxGeometry args={[W + 0.06, H + 0.06, 0.045]} />
      </mesh>
      {/* top rail + two drop rods to ceiling plates */}
      <mesh position={[0, railY, -0.026]} material={steel}>
        <boxGeometry args={[W * 0.86, 0.035, 0.04]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * W * 0.36, 0, -0.026]}>
          {/* clamp between bezel and rail */}
          <mesh position-y={H / 2 + 0.035} material={plate}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
          </mesh>
          <mesh position-y={railY + rod / 2} material={steel}>
            <cylinderGeometry args={[0.011, 0.011, rod, 10]} />
          </mesh>
          <mesh position-y={railY + rod - 0.012} material={plate}>
            <cylinderGeometry args={[0.055, 0.055, 0.024, 20]} />
          </mesh>
        </group>
      ))}
      <Board w={W} h={H} res={1024} paint={quest} accent={accent} slab={false} />
    </group>
  );
}
