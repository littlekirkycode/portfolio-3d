"use client";

import { useMemo } from "react";
import { HALF_W, ROOMS, GATES, type Room } from "../hallConfig";
import { roundRect } from "../canvas2d";
import { Board, INK, fonts, type Painter } from "./holo";

/* ── corridor wayfinding: hanging blade signs ────────────────────────────────
 * Station-style blade signs hung from the ceiling a few metres before each
 * bay, perpendicular to the wall so they read head-on as you walk the hall:
 * number, name and category in the bay's accent, with an arrow toward its
 * side. Double-sided (the back face serves the walk back). Skips the
 * bulkhead-gate lintels by hanging just past the opening instead. */

const BLADE_L = 1.25; // along z (out from the wall)
const BLADE_H = 0.46;
const BLADE_Y = 3.66; // bottom edge clears the cove ledge (3.36), top the beams

function bladeX(r: Room): number {
  const up = r.x - 5.2;
  return GATES.some((g) => Math.abs(up - g.x) < 1.4) ? r.x + 5.2 : up;
}

function useBladePainter(room: Room, arrowLeft: boolean): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono, sans } = fonts();
      ctx.fillStyle = "#0a0d15";
      roundRect(ctx, 0, 0, w, h, 14);
      ctx.fill();
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.lineWidth = 3;
      ctx.stroke();
      // accent band on the wall-side edge, arrow inside it
      const bw = 92;
      const bx = arrowLeft ? 0 : w - bw;
      ctx.fillStyle = room.accent;
      roundRect(ctx, bx, 0, bw, h, 14);
      ctx.fill();
      ctx.fillStyle = "#0a0d15";
      ctx.font = `700 64px ${sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(arrowLeft ? "←" : "→", bx + bw / 2, h / 2 + 2);
      // text block
      const tx = arrowLeft ? bw + 30 : 30;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `700 64px ${mono}`;
      ctx.fillText(room.index, tx, h * 0.58);
      const iw = ctx.measureText(room.index).width;
      ctx.fillStyle = INK;
      ctx.font = `700 50px ${sans}`;
      ctx.fillText(room.title.toUpperCase(), tx + iw + 22, h * 0.52);
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `500 24px ${mono}`;
      ctx.fillText(room.category.toUpperCase(), tx + iw + 24, h * 0.8);
    },
    [room, arrowLeft],
  );
}

function Blade({ room }: { room: Room }) {
  const x = bladeX(room);
  const z = room.side * (HALF_W - 0.12 - BLADE_L / 2);
  // Facing -x (the walk direction) the camera's right is +z, so a -z bay's
  // arrow points left; the back face (facing +x) mirrors that.
  const front = useBladePainter(room, room.side < 0);
  const back = useBladePainter(room, room.side > 0);
  return (
    <group position={[x, BLADE_Y, z]}>
      <mesh>
        <boxGeometry args={[0.035, BLADE_H + 0.02, BLADE_L + 0.02]} />
        <meshStandardMaterial color="#141824" roughness={0.4} metalness={0.7} />
      </mesh>
      <Board w={BLADE_L} h={BLADE_H} res={640} paint={front} accent={room.accent} slab={false} position={[-0.019, 0, 0]} rotation-y={-Math.PI / 2} />
      <Board w={BLADE_L} h={BLADE_H} res={640} paint={back} accent={room.accent} slab={false} position={[0.019, 0, 0]} rotation-y={Math.PI / 2} />
      {/* hangers */}
      {([-0.45, 0.45] as const).map((dz) => (
        <mesh key={dz} position={[0, BLADE_H / 2 + 0.09, dz]}>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
          <meshStandardMaterial color="#2a3040" roughness={0.4} metalness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export default function Wayfinding() {
  return (
    <group>
      {ROOMS.map((r) => (
        <Blade key={r.id} room={r} />
      ))}
    </group>
  );
}
