"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import BridgeRoom from "./bridge/BridgeRoom";
import SpaceView from "./bridge/SpaceView";
import type { GfxQuality } from "@/lib/quality";
import * as THREE from "three";
import {
  HALF_W,
  WALL_H,
  WALL_START,
  BRIDGE_ENTRY_X,
  BRIDGE_C,
  ROOMS,
  ALCOVE_OPEN_W,
  FEATURE_X,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
} from "./hallConfig";
import {
  CeilingFixtures,
  AtriumLights,
  CoveLights,
  LightShafts,
  FloorReflection,
} from "./corridorFx";
import Wayfinding from "./rooms/Wayfinding";
import HallDressing from "./hall/HallDressing";

/** Ceiling light fixture X positions (warm point lights for real illumination). */
const FIXTURES = [10, 40, 70, 100, 130, 158];

/** Corridor dressing stops at the bridge mouth (the room takes over). */
const HALL_END = BRIDGE_ENTRY_X;

/**
 * The corridor's real lights — warm low fixtures + the bridge's starlight
 * spill. Mounted by Scene at the Canvas ROOT, outside the shell Suspense:
 * three keys every lit program on the scene's light COUNT, so lights that
 * arrive with a suspended subtree recompile every lit material when it
 * resolves (the boot-time freezes). Here they exist from the first frame.
 */
export function CorridorLights() {
  return (
    <>
      {/* Warm corridor lights — mounted LOW so they light floor/walls, not the roof */}
      {FIXTURES.map((x) => (
        <pointLight key={x} position={[x, 2.3, 0]} color="#fff0dc" intensity={10} distance={18} decay={2} />
      ))}
      {/* the bridge's one light: high over the command circle, cool */}
      <pointLight position={[BRIDGE_C - 1.5, 4.6, 0]} color="#cfdcff" intensity={55} distance={26} decay={2} />
    </>
  );
}

/* ── wall dressing on the blank runs ────────────────────────────────────── */

const RIB_SPACING = 4; // one rib every ~4 world units of blank wall

/** Thin pilaster ribs (with a dim emissive slit each) on the featureless wall
 *  stretches BETWEEN bays, so the corridor travel isn't dead drywall. Skips bay
 *  openings. Two instanced meshes total (rib bodies + slits). */
function WallRibs() {
  const ribs = useRef<THREE.InstancedMesh>(null);
  const slits = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { x: number; side: -1 | 1 }[] = [];
    for (const side of [-1, 1] as const) {
      for (let x = WALL_START + 2; x < HALL_END - 0.6; x += RIB_SPACING) {
        const blocked = ROOMS.some(
          (r) => r.side === side && Math.abs(x - r.x) < ALCOVE_OPEN_W / 2 + 0.7,
        );
        // The lobby showreel hangs on the +Z wall and its glass sits BEHIND the
        // rib's protruding face — a rib here cuts the screen in half from the
        // dwell camera. Clear the full casing width plus margin.
        const onFeature = side === 1 && Math.abs(x - FEATURE_X) < 3.5;
        // The observation gallery cuts the +z wall across its span.
        const onGallery = side === GALLERY_SIDE && Math.abs(x - GALLERY_X) < GALLERY_SPAN / 2 + 0.9;
        if (!blocked && !onFeature && !onGallery) out.push({ x, side });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    // rib body sits mostly inside the wall slab, protruding ~0.1 past the inner
    // face (HALF_W); the 2cm slit sits flush on the rib's corridor-facing face.
    const placements: [THREE.InstancedMesh | null, number][] = [
      [ribs.current, HALF_W + 0.04],
      [slits.current, HALF_W - 0.11],
    ];
    for (const [mesh, zOff] of placements) {
      if (!mesh) continue;
      items.forEach((it, i) => {
        m.makeTranslation(it.x, WALL_H / 2, it.side * zOff);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [items]);
  return (
    <group>
      <instancedMesh ref={ribs} args={[undefined, undefined, items.length]} frustumCulled={false}>
        <boxGeometry args={[0.18, WALL_H, 0.28]} />
        <meshStandardMaterial color="#232838" roughness={0.75} metalness={0.35} />
      </instancedMesh>
      {/* dim cool slit — deliberately tone-mapped so it never blooms */}
      <instancedMesh ref={slits} args={[undefined, undefined, items.length]} frustumCulled={false}>
        <boxGeometry args={[0.02, WALL_H - 0.6, 0.02]} />
        <meshBasicMaterial color="#33405e" />
      </instancedMesh>
    </group>
  );
}

/* ── warm floor counter-note (the colourist's ask) ──────────────────────── */

/** Soft warm light pools on the deck under each ceiling fixture — additive
 *  gradient quads (one instanced draw, shared radial CanvasTexture), a step
 *  warmer than the fixtures so the floor answers the cool star spill. */
function FloorWashes() {
  const tex = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const t = new THREE.CanvasTexture(canvas);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.55, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    t.needsUpdate = true;
    return t;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    FIXTURES.forEach((x, i) => {
      p.set(x, 0.02, 0);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, FIXTURES.length]} frustumCulled={false}>
      <planeGeometry args={[6.2, 6.8]} />
      <meshBasicMaterial
        map={tex}
        color="#ffbe8a"
        transparent
        opacity={0.12}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}

/** Very dim warm skirting strip along the floor line of each blank wall run —
 *  skips bay openings, the showreel casing and the gallery cut. Subtle: it
 *  reads as reflected fixture warmth at the wall base, not a light. */
function SkirtingStrips() {
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#b06a32", transparent: true, opacity: 0.22 }),
    [],
  );
  const runs = useMemo(() => {
    const out: { x0: number; x1: number; side: -1 | 1 }[] = [];
    for (const side of [-1, 1] as const) {
      const cuts: [number, number][] = ROOMS.filter((r) => r.side === side).map((r) => [
        r.x - (ALCOVE_OPEN_W / 2 + 0.4),
        r.x + (ALCOVE_OPEN_W / 2 + 0.4),
      ]);
      if (side === 1) cuts.push([FEATURE_X - 3.5, FEATURE_X + 3.5]);
      if (side === GALLERY_SIDE) cuts.push([GALLERY_X - GALLERY_SPAN / 2 - 0.6, GALLERY_X + GALLERY_SPAN / 2 + 0.6]);
      cuts.sort((a, b) => a[0] - b[0]);
      let x = WALL_START + 0.4;
      const endX = HALL_END - 0.2;
      for (const [c0, c1] of cuts) {
        if (c0 > x + 0.6) out.push({ x0: x, x1: Math.min(c0, endX), side });
        x = Math.max(x, c1);
      }
      if (x < endX - 0.6) out.push({ x0: x, x1: endX, side });
    }
    return out;
  }, []);
  return (
    <group>
      {runs.map((r, i) => (
        <mesh
          key={i}
          material={mat}
          position={[(r.x0 + r.x1) / 2, 0.09, r.side * (HALF_W - 0.02)]}
          rotation-y={r.side === 1 ? Math.PI : 0}
        >
          <planeGeometry args={[r.x1 - r.x0, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Corridor lighting + atmosphere: recessed ceiling troffers on a beam grid
 * with haze shafts, accent-handoff cove lighting on both walls, animated deck
 * guide studs, drifting dust, and (desktop "high" tier) a polished-deck floor
 * reflection — see corridorFx. Plus the warm low fixtures (with floor washes +
 * skirting as the counter-note to the cool star spill), pilaster ribs + floor
 * guide lines on the blank runs, and the three-pane observation-bridge payoff
 * at the end. Geometry shell is in <KitShell/>.
 */
export default function Corridor({
  mobile = false,
  quality = "high",
  animate = true,
}: {
  mobile?: boolean;
  quality?: GfxQuality;
  animate?: boolean;
}) {
  return (
    <group>
      <CeilingFixtures />
      <AtriumLights />
      <LightShafts />
      <CoveLights />
      {!mobile && quality === "high" && <FloorReflection />}
      <WallRibs />
      <HallDressing />
      <Wayfinding />
      <FloorWashes />
      <SkirtingStrips />

      {/* Dim guide lines along both floor–wall seams (wayfinding glow). Bright
          enough to read against the lit floor, still far below bloom threshold. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          rotation-x={-Math.PI / 2}
          position={[(WALL_START + HALL_END) / 2, 0.015, side * (HALF_W - 0.07)]}
        >
          <planeGeometry args={[HALL_END - WALL_START, 0.08]} />
          <meshBasicMaterial color="#3e4f82" toneMapped={false} />
        </mesh>
      ))}

      {/* warm corridor lights: see <CorridorLights/> (Canvas root) */}

      <BridgeRoom />
      <SpaceView mobile={mobile} animate={animate} />
    </group>
  );
}
