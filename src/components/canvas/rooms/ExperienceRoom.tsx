"use client";

import { useMemo } from "react";
import { EXPERIENCE } from "@/lib/constants";
import { Board, FlowTube, INK, fonts, useGlow, type Painter } from "./holo";

/* ── Experience: the career as a staircase ───────────────────────────────────
 * Six roles, oldest → newest, as six rising steps across the front of the bay
 * (apprentice at the bottom, today at the top). Each step carries a standing
 * card (years + org); a streaming trajectory line climbs the step tops and
 * ends on a "NOW" beacon. The timeline panel keeps the full role titles. */

// EXPERIENCE is newest-first; the staircase climbs chronologically
const STEPS = [...EXPERIENCE].reverse();
const SHORT: Record<string, string> = {
  "J2 Innovations": "J2 INNOVATIONS",
  Siemens: "SIEMENS",
  "Accelerator · $25K offer": "FOUNDERS UNI",
  Nuremi: "NUREMI",
  "Self Platform": "SELF PLATFORM",
  "Allied · Defence Mfg.": "ALLIED",
};

const X0 = -3.2;
const PITCH = 0.58;
const STEP_W = 0.52;
const STEP_D = 0.6;
const Z = 1.72;
const H0 = 0.08;
const DH = 0.095;

function useCardPainter(accent: string, years: string, org: string, now: boolean): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono, sans } = fonts();
      ctx.fillStyle = now ? "rgba(20,26,22,0.9)" : "rgba(8,10,18,0.8)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, w, now ? 10 : 6);
      ctx.textAlign = "center";
      ctx.fillStyle = accent;
      ctx.font = `600 ${Math.round(h * 0.24)}px ${mono}`;
      ctx.fillText(years, w / 2, h * 0.42);
      ctx.fillStyle = INK;
      ctx.font = `700 ${Math.round(h * (org.length > 12 ? 0.2 : 0.24))}px ${sans}`;
      ctx.fillText(org, w / 2, h * 0.8);
    },
    [accent, years, org, now],
  );
}

function Step({ i, accent }: { i: number; accent: string }) {
  const e = STEPS[i];
  const now = i === STEPS.length - 1;
  const h = H0 + i * DH;
  const x = X0 + i * PITCH;
  const years = e.dates.replace(/\s*—\s*/, "–").replace("Now", "NOW");
  const card = useCardPainter(accent, years, SHORT[e.org] ?? e.org.toUpperCase(), now);
  const edge = useGlow(accent, now ? 1.8 : 1.1);
  return (
    <group position={[x, 0, Z]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[STEP_W, h, STEP_D]} />
        <meshStandardMaterial color={now ? "#44604f" : "#3a4254"} emissive={now ? "#1d3a2a" : "#1a2130"} roughness={0.5} metalness={0.25} />
      </mesh>
      {/* glowing nosing along the step's front edge */}
      <mesh position={[0, h + 0.004, STEP_D / 2 - 0.02]} material={edge}>
        <boxGeometry args={[STEP_W, 0.012, 0.03]} />
      </mesh>
      {/* standing card */}
      <group position={[0, h + 0.19, 0.05]} rotation-x={-0.18}>
        <mesh position={[0, 0, -0.012]}>
          <boxGeometry args={[0.5, 0.3, 0.018]} />
          <meshStandardMaterial color="#2a303c" roughness={0.5} metalness={0.3} />
        </mesh>
        <Board w={0.48} h={0.28} res={320} paint={card} accent={accent} slab={false} />
      </group>
    </group>
  );
}

export default function ExperienceRoom({ accent, animate }: { accent: string; animate: boolean }) {
  const beacon = useGlow(accent, 2);
  const path = useMemo<[number, number, number][]>(
    () => STEPS.map((_, i) => [X0 + i * PITCH, H0 + i * DH + 0.42, Z - 0.22]),
    [],
  );
  const last = path[path.length - 1];
  return (
    <group>
      {STEPS.map((_, i) => (
        <Step key={i} i={i} accent={accent} />
      ))}
      {/* trajectory climbing the card tops */}
      <FlowTube points={path} color={accent} radius={0.01} speed={0.45} dashes={9} animate={animate} base={0.35} />
      <mesh position={[last[0] + 0.02, last[1] + 0.02, last[2]]} material={beacon}>
        <octahedronGeometry args={[0.05, 0]} />
      </mesh>
    </group>
  );
}
