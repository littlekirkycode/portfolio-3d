"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { damp } from "@/lib/math";
import { GATES, HALF_W, WALL_H } from "./hallConfig";
import { familyVar } from "./canvas2d";

/* ── deck bulkhead gates — protruding collars with sliding pocket doors.
 *    Each gate marks a deck transition mid-corridor: chevron + 'DECK 0x'
 *    stencil on the dropped lintel, accent jamb strips for far wayfinding,
 *    and two door slabs that pocket open on camera approach. No lights. ── */

const JAMB_T = 0.5; // collar thickness along the corridor (x)
const JAMB_D = 0.6; // jamb depth into the corridor (z)
const LINTEL_H = 0.9; // dropped lintel — the opening ducks under it
const OPEN_HALF = HALF_W - JAMB_D + 0.1; // clear opening half-width
const DOOR_T = 0.16;
const DOOR_H = WALL_H - LINTEL_H - 0.14; // threshold → lintel underside
const DOOR_W = OPEN_HALF + 0.35;
const DOOR_CLOSED = DOOR_W / 2 - 0.12; // slabs overlap slightly at centre
const DOOR_OPEN = OPEN_HALF + DOOR_W / 2 + 0.3; // fully pocketed past the jambs
const TRIGGER = 8; // |cameraX - gate.x| that opens the doors

/** Shared chevron decal — white arrows on transparent, tinted per gate via
 *  material color. One small CanvasTexture for all gates. */
function useChevronTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = 3;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.fillStyle = "#ffffff";
      for (let x = 8; x < 256; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x + 20, 32);
        ctx.lineTo(x, 56);
        ctx.lineTo(x + 12, 56);
        ctx.lineTo(x + 32, 32);
        ctx.lineTo(x + 12, 8);
        ctx.closePath();
        ctx.fill();
      }
    }
    tex.needsUpdate = true;
    return tex;
  }, []);
}

/** 'DECK 0x' stencil plate — mono text + accent underline, like the Walls
 *  plaques but sized for a lintel read. */
function useDeckTexture(label: string, accent: string): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      ctx.clearRect(0, 0, 512, 128);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 76px ${mono}`;
      ctx.fillStyle = "rgba(244,241,234,0.92)";
      ctx.fillText(label, 256, 54);
      ctx.fillStyle = accent;
      ctx.fillRect(112, 104, 288, 8);
    }
    tex.needsUpdate = true;
    return tex;
  }, [label, accent]);
}

function Gate({
  x,
  accent,
  label,
  chevTex,
}: {
  x: number;
  accent: string;
  label: string;
  chevTex: THREE.CanvasTexture;
}) {
  const deckTex = useDeckTexture(label, accent);
  const collarMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#171b29", roughness: 0.6, metalness: 0.5 }),
    [],
  );
  const doorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#10131e", roughness: 0.45, metalness: 0.6 }),
    [],
  );
  const doorL = useRef<THREE.Mesh>(null);
  const doorR = useRef<THREE.Mesh>(null);
  const openT = useRef(0); // 0 closed → 1 open (damped, zero-allocation)

  useFrame((state, rawDt) => {
    const target = Math.abs(state.camera.position.x - x) < TRIGGER ? 1 : 0;
    openT.current = damp(openT.current, target, 3.4, Math.min(rawDt, 1 / 30));
    const k = openT.current;
    const e = k * k * (3 - 2 * k); // smoothstep — doors ease into the pockets
    const dz = DOOR_CLOSED + (DOOR_OPEN - DOOR_CLOSED) * e;
    if (doorR.current) doorR.current.position.z = dz;
    if (doorL.current) doorL.current.position.z = -dz;
  });

  return (
    <group position={[x, 0, 0]}>
      {/* full-frame collar: two jambs + dropped lintel + threshold */}
      {([-1, 1] as const).map((s) => (
        <mesh key={`jamb${s}`} position={[0, WALL_H / 2, s * (HALF_W - JAMB_D / 2)]} material={collarMat}>
          <boxGeometry args={[JAMB_T, WALL_H, JAMB_D]} />
        </mesh>
      ))}
      <mesh position={[0, WALL_H - LINTEL_H / 2, 0]} material={collarMat}>
        <boxGeometry args={[JAMB_T, LINTEL_H, HALF_W * 2]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={collarMat}>
        <boxGeometry args={[JAMB_T, 0.14, HALF_W * 2]} />
      </mesh>

      {/* chevron strip + deck stencil on the approach face of the lintel */}
      <mesh position={[-(JAMB_T / 2 + 0.012), WALL_H - LINTEL_H + 0.16, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[OPEN_HALF * 2 - 0.5, 0.26]} />
        <meshBasicMaterial map={chevTex} color={accent} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh position={[-(JAMB_T / 2 + 0.012), WALL_H - 0.34, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[1.7, 0.44]} />
        <meshBasicMaterial map={deckTex} transparent depthWrite={false} />
      </mesh>

      {/* pocket-door slabs — slide fully behind the jambs/walls when open */}
      <mesh ref={doorR} position={[0, 0.14 + DOOR_H / 2, DOOR_CLOSED]} material={doorMat}>
        <boxGeometry args={[DOOR_T, DOOR_H, DOOR_W]} />
      </mesh>
      <mesh ref={doorL} position={[0, 0.14 + DOOR_H / 2, -DOOR_CLOSED]} material={doorMat}>
        <boxGeometry args={[DOOR_T, DOOR_H, DOOR_W]} />
      </mesh>

      {/* thin emissive jamb strips in the NEXT deck's accent — readable far
          down the hall = wayfinding */}
      {([-1, 1] as const).map((s) => (
        <mesh key={`strip${s}`} position={[-(JAMB_T / 2), 0.14 + DOOR_H / 2, s * (HALF_W - JAMB_D + 0.035)]}>
          <boxGeometry args={[0.06, DOOR_H - 0.2, 0.07]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Deck bulkhead gates with sliding pocket doors (open on camera approach). */
export default function BulkheadGates() {
  const chevTex = useChevronTexture();
  return (
    <group>
      {GATES.map((g, i) => (
        <Gate key={`gate${i}`} x={g.x} accent={g.accent} label={`DECK 0${i + 2}`} chevTex={chevTex} />
      ))}
    </group>
  );
}
