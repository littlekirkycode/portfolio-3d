"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { roundRect } from "../canvas2d";
import { Board, INK, fonts, paintKicker, type Painter } from "./holo";

/* ── SelfQuest: the gym, with the GAME layer made visible ────────────────────
 * The app turns workouts into an RPG, so the room shows the RPG HUD on top of
 * the real equipment: a wall-arm quest board (daily quests, XP, level) angled
 * toward the dwell camera, and "+XP" chips that rise gently off the treadmill
 * as if the workout were paying out. */

const QUESTS: { text: string; xp: number; done: boolean }[] = [
  { text: "Run 5 km", xp: 250, done: true },
  { text: "Leg day · 4 sets", xp: 180, done: true },
  { text: "Drink water ×8", xp: 60, done: false },
];

function useQuestPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono, sans } = fonts();
      const pad = 44;
      paintKicker(ctx, "DAILY QUESTS", pad, 70, accent, 30);
      // level badge
      ctx.fillStyle = accent;
      roundRect(ctx, w - pad - 150, 30, 150, 58, 12);
      ctx.fill();
      ctx.fillStyle = "#0b0d14";
      ctx.font = `700 34px ${mono}`;
      ctx.textAlign = "center";
      ctx.fillText("LV 42", w - pad - 75, 71);

      // quests
      let y = 150;
      for (const q of QUESTS) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = q.done ? accent : "rgba(244,241,234,0.45)";
        roundRect(ctx, pad, y - 34, 40, 40, 8);
        if (q.done) {
          ctx.fillStyle = accent;
          ctx.fill();
          ctx.strokeStyle = "#0b0d14";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(pad + 9, y - 14);
          ctx.lineTo(pad + 18, y - 4);
          ctx.lineTo(pad + 32, y - 25);
          ctx.stroke();
        } else {
          ctx.stroke();
        }
        ctx.textAlign = "left";
        ctx.fillStyle = q.done ? INK : "rgba(244,241,234,0.6)";
        ctx.font = `600 38px ${sans}`;
        ctx.fillText(q.text, pad + 66, y);
        ctx.textAlign = "right";
        ctx.fillStyle = accent;
        ctx.font = `600 32px ${mono}`;
        ctx.fillText(`+${q.xp} XP`, w - pad, y);
        y += 78;
      }

      // XP bar
      const barY = h - 150;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(244,241,234,0.7)";
      ctx.font = `500 26px ${mono}`;
      ctx.fillText("XP  8,450 / 10,000", pad, barY - 16);
      ctx.fillStyle = "rgba(244,241,234,0.1)";
      roundRect(ctx, pad, barY, w - pad * 2, 26, 13);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18 * (ctx.getTransform().a || 1);
      ctx.fillStyle = accent;
      roundRect(ctx, pad, barY, (w - pad * 2) * 0.845, 26, 13);
      ctx.fill();
      ctx.restore();

      // footer: the real numbers
      ctx.fillStyle = INK;
      ctx.font = `700 46px ${ser}`;
      ctx.fillText("1.3M", pad, h - 44);
      const w1 = ctx.measureText("1.3M").width;
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `500 24px ${mono}`;
      ctx.fillText("PLAYERS", pad + w1 + 14, h - 50);
      ctx.textAlign = "right";
      ctx.fillStyle = INK;
      ctx.font = `700 46px ${ser}`;
      ctx.fillText("100K", w - pad - 128, h - 44);
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `500 24px ${mono}`;
      ctx.fillText("DAILY", w - pad, h - 50);
    },
    [accent],
  );
}

/** "+XP" chip texture (shared by the rising chips). */
function useChipPainter(accent: string, label: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono } = fonts();
      ctx.fillStyle = "rgba(8,10,18,0.7)";
      roundRect(ctx, 4, 4, w - 8, h - 8, h / 2 - 4);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = `700 ${Math.round(h * 0.5)}px ${mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, w / 2, h / 2 + 2);
    },
    [accent, label],
  );
}

/** A chip that rises ~0.6 over its cycle, fading in then out (smooth, no pop). */
function XpChip({ accent, label, x, z, y0, phase, period, animate }: {
  accent: string; label: string; x: number; z: number; y0: number; phase: number; period: number; animate: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(phase * period);
  const paint = useChipPainter(accent, label);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (animate) t.current += Math.min(dt, 1 / 30);
    const u = animate ? (t.current % period) / period : 0.45;
    g.position.y = y0 + u * 0.6;
    const mesh = g.children[0]?.children[0] as THREE.Mesh | undefined;
    const mat = mesh?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.5;
  });
  return (
    <group ref={ref} position={[x, y0, z]}>
      <Board w={0.5} h={0.16} res={256} paint={paint} accent={accent} slab={false} rotation-y={0.35} />
    </group>
  );
}

export default function SelfQuestRoom({ accent, animate }: { accent: string; animate: boolean }) {
  const quest = useQuestPainter(accent);
  return (
    <group>
      {/* quest board on a wall arm above the treadmill, angled at the camera */}
      <group position={[-3.28, 2.42, 0.2]} rotation-y={0.95}>
        <Board w={1.5} h={1.12} paint={quest} accent={accent} />
        {/* arm back to the side wall */}
        <mesh position={[-0.35, 0, -0.28]} rotation-y={-0.95}>
          <boxGeometry args={[0.5, 0.06, 0.06]} />
          <meshStandardMaterial color="#232838" roughness={0.4} metalness={0.8} />
        </mesh>
      </group>
      {/* workout payout: XP chips drifting up off the treadmill */}
      <XpChip accent={accent} label="+250 XP" x={-3.0} z={0.75} y0={1.5} phase={0} period={4.2} animate={animate} />
      <XpChip accent={accent} label="+10 STR" x={-2.4} z={1.7} y0={1.05} phase={0.5} period={4.2} animate={animate} />
    </group>
  );
}
