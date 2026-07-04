"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollRefs } from "@/lib/scrollStore";
import { clamp01 } from "@/lib/math";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { START_X, HALF_W, WALL_H } from "./hallConfig";

/**
 * Boarding airlock — a sliding double door filling the corridor cross-section
 * just ahead of the camera start. CLOSED at p=0 (its face is the first frame
 * behind the hero type: chevron band, KIRKHAM·01 stencil, status lamp, seam
 * glow), then the halves part with a cubic ease over p ∈ [0, 0.03] and vanish
 * behind the corridor walls. Reads scrollRefs.progress in useFrame — identical
 * on mobile. Reduced motion: doors parked open (the Rig is frozen past them).
 */

const DOOR_X = START_X + 2.5;
const DOOR_HALF_W = 4.2; // each half's z-span; two halves cover the full corridor
const DOOR_T = 0.2; // slab thickness
const SLIDE = DOOR_HALF_W + 0.7; // fully behind the walls when open
const OPEN_BAND = 0.03; // progress band over which the doors part
const FACE_X = -(DOOR_T / 2 + 0.015); // visible (camera-side, -x) face

const AMBER = "#e9b949";
const INK = "rgba(244,241,234,0.85)";

// reused temps — zero allocations in useFrame
const _red = new THREE.Color("#ff3b30");
const _green = new THREE.Color("#37ff8a");

const easeCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function familyVar(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** One door half's face, drawn to a CanvasTexture. `side` −1 = viewer-left
 *  (seam on the canvas's right edge), +1 = viewer-right (seam on the left). */
function useFaceTexture(side: -1 | 1): THREE.CanvasTexture {
  return useMemo(() => {
    const W = 672;
    const H = 640;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");

    // dark steel base + subtle panel lines
    ctx.fillStyle = "#0c0d13";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    for (const y of [H * 0.18, H * 0.5, H * 0.86]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // rivets along the panel lines
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (const y of [H * 0.18, H * 0.86]) {
      for (let x = 36; x < W; x += 90) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // chevron hazard band (clipped, 45° stripes)
    const bandY = H * 0.6;
    const bandH = H * 0.15;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandY, W, bandH);
    ctx.clip();
    ctx.fillStyle = "#0e0f16";
    ctx.fillRect(0, bandY, W, bandH);
    ctx.fillStyle = AMBER;
    ctx.globalAlpha = 0.9;
    for (let x = -H; x < W + H; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, bandY + bandH);
      ctx.lineTo(x + 48, bandY + bandH);
      ctx.lineTo(x + 48 + bandH, bandY);
      ctx.lineTo(x + bandH, bandY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = "rgba(233,185,73,0.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-4, bandY, W + 8, bandH);

    // KIRKHAM·01 stencil — one run of text continuing across the seam:
    // each half draws the full string centred ON the seam edge and lets the
    // canvas clip its own half.
    ctx.font = `700 92px ${mono}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    const seamX = side < 0 ? W : 0;
    ctx.fillText("KIRKHAM·01", seamX, H * 0.4);

    // small mono readouts (dry, tasteful). The p=0 camera only sees ±1.5 world
    // units (≈240 canvas px per half) around the seam and y ≈ 0.8–2.5, so every
    // line meant for the first frame is anchored to the SEAM — the outer-edge
    // annotations are texture detail for the walk-through, not the money shot.
    ctx.textAlign = side < 0 ? "left" : "right";
    ctx.font = `500 24px ${mono}`;
    ctx.fillStyle = "rgba(244,241,234,0.55)";
    if (side < 0) {
      ctx.fillText("AIRLOCK A-01 — OUTER DOOR", 32, H * 0.09);
    } else {
      ctx.fillText("PRESSURE: 101.3 kPa — NOMINAL", W - 32, H * 0.09);
    }

    // yellow caution line under the chevron band — ONE run continuing across
    // the seam: like the stencil, each half draws it centred on its seam edge
    // and clips its own part, so it can never read as an accidental crop.
    ctx.textAlign = "center";
    ctx.font = `500 20px ${mono}`;
    ctx.fillStyle = "rgba(233,185,73,0.75)";
    ctx.fillText("CYCLE LOCK BEFORE ENTRY", seamX, H * 0.775);

    // dry aside in the clear band between the stencil and the chevrons, tight
    // to the seam (the status lamp mirrors it on the other door half)
    if (side < 0) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(233,185,73,0.6)";
      ctx.fillText("MIND THE DRONE", W - 40, H * 0.53);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [side]);
}

export default function Airlock() {
  const reduced = useReducedMotion();
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const lampMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rimLMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const rimRMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const t = useRef(0);

  const leftTex = useFaceTexture(-1);
  const rightTex = useFaceTexture(1);

  // soft radial halo for the status lamp
  const haloTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  // seam tube gradient — bright core fading toward both ends and edges, so
  // the seam reads as a recessed light TUBE, not a flat blue rectangle
  // (QA: "cheap light blue lights")
  const seamTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const gv = ctx.createLinearGradient(0, 0, 0, 256);
    gv.addColorStop(0, "rgba(255,255,255,0)");
    gv.addColorStop(0.18, "rgba(255,255,255,0.85)");
    gv.addColorStop(0.82, "rgba(255,255,255,0.85)");
    gv.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, 16, 256);
    const gh = ctx.createLinearGradient(0, 0, 16, 0);
    gh.addColorStop(0, "rgba(0,0,0,0.9)");
    gh.addColorStop(0.5, "rgba(0,0,0,0)");
    gh.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = gh;
    ctx.fillRect(0, 0, 16, 256);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    t.current += dt;

    const p = scrollRefs.progress;
    const open = reduced ? 1 : easeCubic(clamp01(p / OPEN_BAND));

    const unlocked = reduced || p > 0.0015;

    // Slide the halves apart; once fully parked behind the walls, hide just the
    // doors (the bulkhead frame stays — you pass through it looking back).
    const l = leftRef.current;
    const r = rightRef.current;
    if (l) {
      l.position.z = -open * SLIDE;
      l.visible = open < 0.998;
    }
    if (r) {
      r.position.z = open * SLIDE;
      r.visible = open < 0.998;
    }

    // status lamp flips red → green the moment the lock releases
    const lamp = lampMatRef.current;
    const halo = haloMatRef.current;
    if (lamp) lamp.color.copy(unlocked ? _green : _red);
    if (halo) halo.color.copy(unlocked ? _green : _red);

    // thin seam rim glow — calm breathing, surging steadily while the doors
    // part. (The old boot/unlock strobe — sin(61.7t)·sin(17.3t) hard-switching
    // 0.85↔0.2 — read as two faulty tube lights, not sci-fi: QA "flashy and
    // sketchy blue lines".)
    const surge = open > 0 && open < 0.6 ? 0.25 : 0;
    const glow = 0.55 + 0.12 * (reduced ? 0 : Math.sin(t.current * 2.2)) + surge;
    if (rimLMatRef.current) rimLMatRef.current.opacity = glow;
    if (rimRMatRef.current) rimRMatRef.current.opacity = glow;
  });

  return (
    <group position={[DOOR_X, 0, 0]}>
      {/* bulkhead frame: side posts + header track the doors slide into */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, WALL_H / 2, s * (HALF_W + 0.15)]}>
          <boxGeometry args={[0.9, WALL_H, 0.7]} />
          <meshStandardMaterial color="#14151d" roughness={0.55} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, WALL_H - 0.15, 0]}>
        <boxGeometry args={[0.9, 0.5, (HALF_W + 0.5) * 2]} />
        <meshStandardMaterial color="#14151d" roughness={0.55} metalness={0.6} />
      </mesh>

      {/* left half (viewer-left, z < 0) */}
      <group ref={leftRef}>
        <mesh position={[0, WALL_H / 2, -DOOR_HALF_W / 2]}>
          <boxGeometry args={[DOOR_T, WALL_H, DOOR_HALF_W]} />
          <meshStandardMaterial color="#101219" roughness={0.6} metalness={0.55} />
        </mesh>
        <mesh position={[FACE_X, WALL_H / 2, -DOOR_HALF_W / 2]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[DOOR_HALF_W, WALL_H]} />
          <meshBasicMaterial map={leftTex} />
        </mesh>
        {/* seam rim glow — slim gradient tube (one of the two emissive planes) */}
        <mesh position={[FACE_X - 0.005, WALL_H / 2, -0.035]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[0.035, WALL_H - 0.1]} />
          <meshBasicMaterial
            ref={rimLMatRef}
            map={seamTex}
            color="#cfe6ff"
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* right half (viewer-right, z > 0) */}
      <group ref={rightRef}>
        <mesh position={[0, WALL_H / 2, DOOR_HALF_W / 2]}>
          <boxGeometry args={[DOOR_T, WALL_H, DOOR_HALF_W]} />
          <meshStandardMaterial color="#101219" roughness={0.6} metalness={0.55} />
        </mesh>
        <mesh position={[FACE_X, WALL_H / 2, DOOR_HALF_W / 2]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[DOOR_HALF_W, WALL_H]} />
          <meshBasicMaterial map={rightTex} />
        </mesh>
        <mesh position={[FACE_X - 0.005, WALL_H / 2, 0.035]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[0.035, WALL_H - 0.1]} />
          <meshBasicMaterial
            ref={rimRMatRef}
            map={seamTex}
            color="#cfe6ff"
            transparent
            opacity={0.7}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
        {/* status lamp — bezel ring + lamp + soft halo, in the clear band
            beside the seam at eye-plus height (y 1.85, z 0.55 both sit well
            inside the p=0 view cone: y 0.8–2.5, z ±1.5) */}
        <mesh position={[FACE_X - 0.006, 1.85, 0.55]} rotation-y={-Math.PI / 2}>
          <circleGeometry args={[0.15, 28]} />
          <meshBasicMaterial color="#05060a" />
        </mesh>
        <mesh position={[FACE_X - 0.012, 1.85, 0.55]} rotation-y={-Math.PI / 2}>
          <circleGeometry args={[0.1, 28]} />
          <meshBasicMaterial ref={lampMatRef} color="#ff3b30" toneMapped={false} />
        </mesh>
        <mesh position={[FACE_X - 0.018, 1.85, 0.55]} rotation-y={-Math.PI / 2}>
          <planeGeometry args={[0.7, 0.7]} />
          <meshBasicMaterial
            ref={haloMatRef}
            map={haloTex}
            color="#ff3b30"
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
