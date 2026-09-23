"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { HALF_W, ROOMS, GATES, type Room } from "../hallConfig";
import { roundRect } from "../canvas2d";
import { Board, accentInk, fonts, track, type Painter } from "./holo";

/* ── corridor wayfinding: hanging blade signs ────────────────────────────────
 * Station-style blade signs hung from the ceiling a few metres before each
 * bay, perpendicular to the wall so they read head-on as you walk the hall:
 * number, name and category in the bay's accent, with an arrow toward its
 * side. Double-sided (the back face serves the walk back). Skips the
 * bulkhead-gate lintels by hanging just past the opening instead. */

const BLADE_L = 1.25; // along z (out from the wall)
const BLADE_H = 0.46;
const BLADE_Y = 3.66; // bottom edge clears the cove ledge (3.36), top the beams
/** Face texture width. The blade is read obliquely from ~10 m down the hall,
 *  where 640 px broke the category line into half-formed glyphs; 896 holds
 *  it. The painter still lays out in 640-px design units (scaled below). */
const BLADE_RES = 896;
const DESIGN_W = 640;

function bladeX(r: Room): number {
  const up = r.x - 5.2;
  return GATES.some((g) => Math.abs(up - g.x) < 1.4) ? r.x + 5.2 : up;
}

function useBladePainter(room: Room, arrowLeft: boolean): Painter {
  return useMemo<Painter>(
    () => (ctx, W, H) => {
      const { mono, sans } = fonts();
      // lay out in 640-px design units at any texture resolution
      const k = W / DESIGN_W;
      const w = DESIGN_W;
      const h = H / k;
      ctx.save();
      ctx.scale(k, k);
      const r = 16;
      // enamelled sign body: smoked gradient, lighter at the top (the glass-
      // card language, but opaque — this is hardware hung from the deck)
      roundRect(ctx, 2, 2, w - 4, h - 4, r);
      const body = ctx.createLinearGradient(0, 0, 0, h);
      body.addColorStop(0, "#1a1e2b");
      body.addColorStop(1, "#0c0f17");
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.stroke();
      // accent band on the wall-side edge with a vector chevron (font-free)
      const bw = 78;
      const bx = arrowLeft ? 2 : w - 2 - bw;
      ctx.save();
      roundRect(ctx, 2, 2, w - 4, h - 4, r);
      ctx.clip();
      const band = ctx.createLinearGradient(0, 0, 0, h);
      band.addColorStop(0, accentInk(room.accent, 0.12));
      band.addColorStop(1, room.accent);
      ctx.fillStyle = band;
      ctx.fillRect(bx, 0, bw, h);
      ctx.restore();
      const ax = bx + bw / 2;
      const ay = h / 2;
      const d = arrowLeft ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(ax - d * 12, ay - 22);
      ctx.lineTo(ax + d * 12, ay);
      ctx.lineTo(ax - d * 12, ay + 22);
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0c0f17";
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      // top highlight
      const hl = ctx.createLinearGradient(0, 0, w, 0);
      hl.addColorStop(0, "rgba(255,255,255,0)");
      hl.addColorStop(0.5, "rgba(255,255,255,0.16)");
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.fillRect(r, 4, w - r * 2, 1.5);
      // text block: index · name / tracked category under an accent-led rule.
      // Sized to fill the blade (it reads from ~10 m down the hall): name at
      // up to 60 px, category at 36 px so it survives the distance and angle.
      const tx = arrowLeft ? bw + 30 : 32;
      const maxW = w - bw - 62;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const nameY = Math.round(h * 0.48);
      const idx = room.index;
      ctx.font = `600 54px ${mono}`;
      const iw = ctx.measureText(idx).width + 22;
      const name = room.title.toUpperCase();
      let ns = 60;
      ctx.font = `700 ${ns}px ${sans}`;
      track(ctx, 0.04, ns);
      const nw = ctx.measureText(name).width;
      if (nw > maxW - iw) ns = Math.floor(ns * ((maxW - iw) / nw));
      track(ctx, 0);
      // index shares the name's cap height
      const is = Math.min(54, Math.round(ns * 0.9));
      ctx.font = `600 ${is}px ${mono}`;
      ctx.fillStyle = accentInk(room.accent, 0.2);
      ctx.fillText(idx, tx, nameY);
      ctx.font = `700 ${ns}px ${sans}`;
      track(ctx, 0.04, ns);
      ctx.fillStyle = "#e6e3dc"; // ink held under the bloom knee
      ctx.fillText(name, tx + iw, nameY);
      track(ctx, 0);
      const ruleY = Math.round(h * 0.585);
      ctx.fillStyle = "rgba(244,241,234,0.14)";
      ctx.fillRect(tx, ruleY, maxW, 2);
      ctx.fillStyle = room.accent;
      ctx.fillRect(tx, ruleY - 1, 44, 4);
      const cat = room.category.toUpperCase();
      let cs = 36;
      ctx.font = `600 ${cs}px ${mono}`;
      track(ctx, 0.12, cs);
      const cw = ctx.measureText(cat).width;
      if (cw > maxW) cs = Math.floor(cs * (maxW / cw));
      ctx.font = `600 ${cs}px ${mono}`;
      track(ctx, 0.12, cs);
      ctx.fillStyle = "rgba(244,241,234,0.8)";
      ctx.fillText(cat, tx, Math.round(h * 0.855));
      track(ctx, 0);
      ctx.restore();
    },
    [room, arrowLeft],
  );
}

/** Walking right under a blade, only its bottom strip sits at the top edge
 *  of the frame — under the HUD scrim it read as dim "ghost" text (QA: a
 *  dark "WHAT I BUILD WITH" at the top-right on the approach to 0.52). The
 *  sign fades out over the last metres of approach, while it's already
 *  leaving the frame; scroll-driven (distance, not time), so it can't flash.
 *  Distances are along the hall, camera to blade. */
const FADE_NEAR = 3.3; // ~where the blade bottom leaves a 62° frame
const FADE_FAR = 4.5; // ~where its top edge starts to clip

function Blade({ room }: { room: Room }) {
  const x = bladeX(room);
  const z = room.side * (HALF_W - 0.12 - BLADE_L / 2);
  // Facing -x (the walk direction) the camera's right is +z, so a -z bay's
  // arrow points left; the back face (facing +x) mirrors that.
  const front = useBladePainter(room, room.side < 0);
  const back = useBladePainter(room, room.side > 0);
  const ref = useRef<THREE.Group>(null);
  const shown = useRef(1);
  // (the hardware materials are created transparent up front: flipping
  // `transparent` mid-walk would compile a new program variant — a hitch)
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    const d = Math.abs(camera.position.x - x);
    const t = THREE.MathUtils.clamp((d - FADE_NEAR) / (FADE_FAR - FADE_NEAR), 0, 1);
    const k = t * t * (3 - 2 * t);
    if (Math.abs(k - shown.current) < 0.004 && !(k === 0 || k === 1)) return;
    if (k === shown.current) return;
    shown.current = k;
    g.visible = k > 0.002;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.opacity = k;
    });
  });
  return (
    <group ref={ref} position={[x, BLADE_Y, z]}>
      <mesh>
        <boxGeometry args={[0.035, BLADE_H + 0.02, BLADE_L + 0.02]} />
        <meshStandardMaterial color="#141824" roughness={0.4} metalness={0.7} transparent />
      </mesh>
      <Board w={BLADE_L} h={BLADE_H} res={BLADE_RES} paint={front} accent={room.accent} slab={false} position={[-0.019, 0, 0]} rotation-y={-Math.PI / 2} />
      <Board w={BLADE_L} h={BLADE_H} res={BLADE_RES} paint={back} accent={room.accent} slab={false} position={[0.019, 0, 0]} rotation-y={Math.PI / 2} />
      {/* hangers */}
      {([-0.45, 0.45] as const).map((dz) => (
        <mesh key={dz} position={[0, BLADE_H / 2 + 0.09, dz]}>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
          <meshStandardMaterial color="#2a3040" roughness={0.4} metalness={0.8} transparent />
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
