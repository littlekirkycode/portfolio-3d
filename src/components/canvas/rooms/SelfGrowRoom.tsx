"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { roundRect } from "../canvas2d";
import { Board, INK, Stand, fonts, paintKicker, useGlow, type Painter } from "./holo";

/* ── SelfGrow: habit-breaking with social accountability ─────────────────────
 * Two ideas made physical: the STREAK (a 7×7 calendar wall — 49 days clean,
 * every square earned) and the GROUP (five accountability pods standing in a
 * ring around the planter, joined by one glowing circle: you don't relapse
 * alone). The plants in RoomProps are the growth itself. */

const DAYS = 49;
// ring centred on the planter bench (RoomProps habit case)
const RING_X = -0.35;
const RING_Z = 1.05;
const RING_R = 0.95;
/** Pods stand on the ring, all turned to the opening so every visor reads. */
const pods = Array.from({ length: 5 }, (_, i) => {
  const a = Math.PI * 0.5 + (i / 5) * Math.PI * 2;
  return { x: RING_X + Math.cos(a) * RING_R, z: RING_Z + Math.sin(a) * RING_R * 0.8, ry: 0 };
});
const CHECKED_IN = 5;

function useStreakPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono } = fonts();
      const pad = 44;
      paintKicker(ctx, "STREAK", pad, 70, accent, 30);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `500 24px ${mono}`;
      ctx.fillText("OFFLINE-FIRST · SYNCED", w - pad, 68);
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `700 132px ${ser}`;
      ctx.fillText("49", pad, 214);
      const nw = ctx.measureText("49").width;
      ctx.fillStyle = accent;
      ctx.font = `600 34px ${mono}`;
      ctx.fillText("DAYS CLEAN", pad + nw + 18, 204);

      // 7×7 calendar
      const labels = ["M", "T", "W", "T", "F", "S", "S"];
      const gx = pad;
      const gy = 262;
      const cell = (w - pad * 2) / 7;
      const s = cell * 0.78;
      ctx.font = `500 22px ${mono}`;
      ctx.textAlign = "center";
      labels.forEach((l, i) => {
        ctx.fillStyle = "rgba(244,241,234,0.45)";
        ctx.fillText(l, gx + cell * i + cell / 2, gy);
      });
      for (let d = 0; d < DAYS; d++) {
        const cx = gx + (d % 7) * cell + (cell - s) / 2;
        const cy = gy + 18 + Math.floor(d / 7) * cell * 0.86;
        const today = d === DAYS - 1;
        ctx.fillStyle = accent;
        ctx.globalAlpha = today ? 1 : 0.35 + 0.55 * (d / DAYS);
        roundRect(ctx, cx, cy, s, s * 0.8, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (today) {
          ctx.lineWidth = 4;
          ctx.strokeStyle = INK;
          ctx.stroke();
        }
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(244,241,234,0.7)";
      ctx.font = `500 24px ${mono}`;
      ctx.fillText(`GROUP · ${CHECKED_IN}/${CHECKED_IN} CHECKED IN TODAY`, pad, h - 36);
    },
    [accent],
  );
}

/** One accountability pod: glowing base disc, body, head with an accent visor. */
function Pod({ x, z, accent, bodyMat, headMat, visorMat, ry }: {
  x: number; z: number; accent: string; ry: number;
  bodyMat: THREE.Material; headMat: THREE.Material; visorMat: THREE.Material;
}) {
  return (
    <group position={[x, 0, z]} rotation-y={ry}>
      <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.1, 0.13, 32]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.15, 0]} material={bodyMat}>
        <capsuleGeometry args={[0.075, 0.12, 6, 16]} />
      </mesh>
      <mesh position={[0, 0.35, 0]} material={headMat}>
        <sphereGeometry args={[0.075, 20, 20]} />
      </mesh>
      <mesh position={[0, 0.36, 0.058]} material={visorMat}>
        <boxGeometry args={[0.09, 0.026, 0.03]} />
      </mesh>
    </group>
  );
}

export default function SelfGrowRoom({ accent }: { accent: string }) {
  const streak = useStreakPainter(accent);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1c2330", roughness: 0.45, metalness: 0.5 }), []);
  const headMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d9dfe8", roughness: 0.35, metalness: 0.2 }), []);
  const visorMat = useGlow(accent, 1.6);
  const cx = RING_X;
  const cz = RING_Z;
  const R = RING_R;
  return (
    <group>
      {/* streak calendar on a floor stand, back-left, angled at the camera */}
      <group position={[-3.18, 0, -0.55]} rotation-y={0.85}>
        <Stand top={1.55} accent={accent} />
        <Board w={1.34} h={1.44} paint={streak} accent={accent} position={[0, 2.27, 0.03]} />
      </group>
      {/* accountability ring */}
      <mesh position={[cx, 0.02, cz]} rotation-x={-Math.PI / 2} scale={[1, 0.8, 1]}>
        <ringGeometry args={[R - 0.012, R + 0.012, 96]} />
        <meshBasicMaterial color={accent} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      {pods.map((p, i) => (
        <Pod key={i} {...p} accent={accent} bodyMat={bodyMat} headMat={headMat} visorMat={visorMat} />
      ))}
    </group>
  );
}
