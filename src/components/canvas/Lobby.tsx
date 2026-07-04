"use client";

import { useMemo } from "react";
import * as THREE from "three";
import {
  TILE,
  HALF_W,
  WALL_H,
  START_X,
  FEATURE_X,
  FEATURE_RECESS_DEPTH,
} from "./hallConfig";

/** Half-width of the showreel recess cut — mirrors KitShell's FEATURE_CUT_HALF
 *  (3 wall-tile columns), so the jambs land exactly on the raw cut edges. */
const RECESS_HALF = TILE * 1.5;
/** Inner face of the recess back wall (kit slab at WALL_Z + depth, 0.3 thick). */
const RECESS_BACK = HALF_W + FEATURE_RECESS_DEPTH;

/** The sealed docking door sits BEHIND the camera start — looking back down the
 *  corridor reads "you just docked". (The OPENING airlock ahead is Airlock.tsx.) */
const DOOR_X = START_X - 6;

const MONO = "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace";

/** Chevron-striped sealed airlock face: hull plating, a double-door seam, hazard
 *  chevron band, KIRKHAM·01 stencil and a SEALED status tag — baked once to a
 *  CanvasTexture (static, never repainted). */
function makeDoorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 576;
  const ctx = c.getContext("2d")!;

  // hull base + subtle vertical panel seams
  ctx.fillStyle = "#0c0e15";
  ctx.fillRect(0, 0, 1024, 576);
  ctx.strokeStyle = "rgba(140,160,200,0.08)";
  ctx.lineWidth = 2;
  for (const x of [128, 256, 384, 640, 768, 896]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 576);
    ctx.stroke();
  }

  // chevron hazard band across the middle (docking-bay yellow, kept desaturated
  // so it sits in the moody palette instead of screaming safety-vest)
  const bandY = 330;
  const bandH = 74;
  ctx.save();
  ctx.beginPath();
  ctx.rect(40, bandY, 944, bandH);
  ctx.clip();
  ctx.fillStyle = "#141010";
  ctx.fillRect(40, bandY, 944, bandH);
  ctx.fillStyle = "#b98d3c";
  for (let x = -80; x < 1064; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, bandY + bandH);
    ctx.lineTo(x + 48, bandY);
    ctx.lineTo(x + 96, bandY);
    ctx.lineTo(x + 48, bandY + bandH);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(185,141,60,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, bandY, 944, bandH);

  // central double-door seam + locking hub
  ctx.strokeStyle = "rgba(20,22,30,0.9)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 576);
  ctx.stroke();
  ctx.strokeStyle = "rgba(150,170,210,0.16)";
  ctx.lineWidth = 2;
  for (const r of [64, 88]) {
    ctx.beginPath();
    ctx.arc(512, 470, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // stencil registration — bright enough to survive ACES, no glow
  ctx.textAlign = "center";
  ctx.fillStyle = "#9fb4dc";
  ctx.font = `700 92px ${MONO}`;
  ctx.fillText("KIRKHAM·01", 512, 160);
  ctx.fillStyle = "rgba(159,180,220,0.55)";
  ctx.font = `500 30px ${MONO}`;
  ctx.fillText("DOCKING PORT A — UMBILICAL RETRACTED", 512, 228);
  ctx.fillStyle = "#c96a4a";
  ctx.font = `700 34px ${MONO}`;
  ctx.fillText("· AIRLOCK SEALED ·", 512, 290);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Docking-lobby furniture (all static — the per-slide accent light rig lives in
 * FeatureScreen): pilaster jambs + angled hood dressing the showreel recess, a
 * floor threshold glow at its mouth, and the big SEALED airlock door behind the
 * camera start so looking back reads "you just docked". No lights added — the
 * two emissive strips + threshold bar are plain emitter quads.
 */
export default function Lobby() {
  const doorTex = useMemo(makeDoorTexture, []);

  return (
    <group>
      {/* ── showreel recess housing (+z wall at FEATURE_X) ────────────────── */}
      {/* pilaster jambs on the raw cut edges — echo Corridor's WallRibs language
          (dark steel body + a dim slit) but deep enough to close the recess's
          open side returns (corridor face → recess back). */}
      {([-1, 1] as const).map((e) => (
        <group key={e} position={[FEATURE_X + e * RECESS_HALF, 0, 0]}>
          <mesh position={[0, WALL_H / 2, HALF_W + (RECESS_BACK - HALF_W) / 2 + 0.05]}>
            <boxGeometry args={[0.5, WALL_H, RECESS_BACK - HALF_W + 0.7]} />
            <meshStandardMaterial color="#1a1d29" roughness={0.7} metalness={0.4} />
          </mesh>
          {/* warm slit on the corridor-facing edge (tone-mapped: dim, no bloom) */}
          <mesh position={[0, WALL_H / 2, HALF_W - 0.31]}>
            <boxGeometry args={[0.04, WALL_H - 0.9, 0.03]} />
            <meshBasicMaterial color="#6b4530" />
          </mesh>
        </group>
      ))}

      {/* angled hood / soffit over the recess mouth */}
      <group position={[FEATURE_X, 3.58, HALF_W - 0.12]} rotation={[-0.3, 0, 0]}>
        <mesh>
          <boxGeometry args={[RECESS_HALF * 2 + 0.7, 0.16, 1.35]} />
          <meshStandardMaterial color="#141724" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* one narrow emissive downlight strip on the hood's underside */}
        <mesh position={[0, -0.09, -0.28]} rotation-x={Math.PI / 2}>
          <planeGeometry args={[RECESS_HALF * 2 + 0.2, 0.09]} />
          <meshBasicMaterial color="#bcd4ff" toneMapped={false} />
        </mesh>
      </group>

      {/* floor threshold glow bar at the recess mouth (warm — matches the
          showreel's #ff7a4d rim; FeatureScreen's accent pool washes over it) */}
      <mesh position={[FEATURE_X, 0.02, HALF_W - 0.14]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[RECESS_HALF * 2 + 0.2, 0.14]} />
        <meshBasicMaterial color="#ff7a4d" toneMapped={false} />
      </mesh>

      {/* ── sealed docking door behind the camera start ───────────────────── */}
      <group position={[DOOR_X, 0, 0]}>
        {/* slab fills the corridor cross-section (overshoots into walls/floor) */}
        <mesh position={[0, WALL_H / 2, 0]}>
          <boxGeometry args={[0.5, WALL_H + 0.8, HALF_W * 2 + 1.4]} />
          <meshStandardMaterial color="#0f1219" roughness={0.55} metalness={0.6} />
        </mesh>
        {/* painted face (chevrons + stencil) toward the corridor (+x) */}
        <mesh position={[0.26, WALL_H / 2, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[HALF_W * 2, WALL_H]} />
          <meshBasicMaterial map={doorTex} />
        </mesh>
        {/* thin cool rim glow tracing the frame — the only light on the door */}
        <mesh position={[0.27, WALL_H - 0.03, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[HALF_W * 2 + 0.1, 0.05]} />
          <meshBasicMaterial color="#8fb3ff" toneMapped={false} />
        </mesh>
        {([-1, 1] as const).map((s) => (
          <mesh key={s} position={[0.27, WALL_H / 2, s * (HALF_W - 0.03)]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[0.05, WALL_H]} />
            <meshBasicMaterial color="#8fb3ff" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
