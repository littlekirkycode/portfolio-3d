"use client";

import { useMemo } from "react";
import { SKILLS } from "@/lib/constants";
import { roundRect } from "../canvas2d";
import { Board, INK, fonts, type Painter } from "./holo";

/* ── Capabilities: the stack as running hardware ─────────────────────────────
 * One server cabinet per skill group (Mobile / Backend·Data / Web / Tools),
 * each technology a labelled blade with steady status LEDs — the stack James
 * ships on, racked like production iron behind the workstation. Cabinets are
 * sawtoothed along the left wall so every face turns toward the camera. */

const GROUP_TINT = ["#7fb0e8", "#9d8cff", "#57d6a4", "#e7b45a"];

function useRackPainter(group: string, items: string[], tint: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono, sans } = fonts();
      // cabinet face
      ctx.fillStyle = "#0b0e16";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(244,241,234,0.12)";
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      // header plate
      ctx.fillStyle = tint;
      ctx.fillRect(14, 14, w - 28, 8);
      ctx.fillStyle = tint;
      ctx.font = `700 34px ${mono}`;
      ctx.textAlign = "left";
      ctx.fillText(group.toUpperCase(), 26, 72);
      ctx.fillStyle = "rgba(244,241,234,0.45)";
      ctx.font = `500 20px ${mono}`;
      ctx.fillText(`${items.length} UNITS · ONLINE`, 26, 102);

      // blades
      const top = 132;
      const bh = Math.min(92, (h - top - 30) / items.length);
      items.forEach((it, i) => {
        const y = top + i * bh;
        ctx.fillStyle = i % 2 ? "#121724" : "#151b2a";
        roundRect(ctx, 18, y + 4, w - 36, bh - 8, 6);
        ctx.fill();
        // steady status LEDs (never blink)
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k === 0 ? tint : "rgba(127,176,232,0.35)";
          ctx.beginPath();
          ctx.arc(40 + k * 20, y + bh / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = INK;
        ctx.font = `600 ${Math.round(Math.min(38, bh * 0.44))}px ${sans}`;
        ctx.fillText(it, 108, y + bh / 2 + bh * 0.15);
        // vent slots on the right
        ctx.fillStyle = "rgba(244,241,234,0.08)";
        for (let k = 0; k < 4; k++) ctx.fillRect(w - 70 + k * 12, y + 14, 5, bh - 28);
      });
    },
    [group, items, tint],
  );
}

function Rack({ i, x, z }: { i: number; x: number; z: number }) {
  const g = SKILLS[i];
  const tint = GROUP_TINT[i % GROUP_TINT.length];
  const paint = useRackPainter(g.group, g.items, tint);
  const H = 1.95;
  return (
    <group position={[x, 0, z]} rotation-y={1.05}>
      {/* cabinet body */}
      <mesh position={[0, H / 2, -0.24]}>
        <boxGeometry args={[0.6, H, 0.48]} />
        <meshStandardMaterial color="#262c3a" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* plinth + top light bar */}
      <mesh position={[0, 0.04, -0.2]}>
        <boxGeometry args={[0.64, 0.08, 0.56]} />
        <meshStandardMaterial color="#1a1f2c" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, H - 0.02, 0.005]}>
        <boxGeometry args={[0.56, 0.02, 0.01]} />
        <meshBasicMaterial color={tint} toneMapped={false} />
      </mesh>
      <Board w={0.56} h={H - 0.16} res={384} paint={paint} accent={tint} slab={false} position={[0, H / 2 + 0.02, 0.002]} />
    </group>
  );
}

export default function CapabilitiesRoom() {
  return (
    <group>
      {SKILLS.slice(0, 4).map((_, i) => (
        <Rack key={i} i={i} x={-3.36} z={-1.35 + i * 0.95} />
      ))}
    </group>
  );
}
