"use client";

import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { RoomTheme } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import { useIsMobile } from "@/lib/useIsMobile";
import { Bob, Model, SpinY } from "./ModelLoader";

/** Shared soft radial gradient for the plinth under-glow pucks — one canvas
 *  texture for every showcase in every bay (module cache; client-only, this
 *  file only ever renders inside the ssr:false Canvas). */
let _puckTex: THREE.CanvasTexture | null = null;
function getPuckTex(): THREE.CanvasTexture {
  if (!_puckTex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.6, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    _puckTex = new THREE.CanvasTexture(c);
  }
  return _puckTex;
}

/**
 * Each bay is composed (not just dressed) with a small set of low-poly props that
 * evoke its specific app, with deliberate art direction:
 *  - large objects (treadmill, desk, tower) are ANCHORED to the back/sides,
 *    angled so their profile faces the opening — never floating mid-floor;
 *  - small "showcase" objects (globe, ring, gem, trophy, drone) sit ELEVATED on a
 *    display plinth; a room uses ONE display language (e.g. jewellery = every piece
 *    on its own plinth, never some on the floor);
 *  - flat floating objects BOB (they'd vanish edge-on if spun);
 *  - everything rests cleanly on the now-flush accent mat.
 * Local origin = niche floor 1.55 in front of the back wall; +Z = toward the
 * opening/camera; back wall at z ≈ -1.55.
 * OCCLUSION BAND: the floating info panel (x=1.55, local z≈+0.95, 3.2×2.62) covers
 * x∈[0, 3.15] from the head-on camera — props taller than ~0.5 there hide behind it
 * (z < +0.9) or block its text (z > +0.9). Tall props live at x<0 or x>3.3, small
 * floor items (≤~0.5) may sit under its bottom edge. The hero screen spans
 * x∈[-3.1, 0] on the back wall — nothing taller than ~1.0 directly in front of it.
 */

const d2r = (deg: number) => (deg * Math.PI) / 180;

/* ── floor stories ─────────────────────────────────────────────────────────
 * The occlusion bands push everything tall to the flanks, which left the
 * centre of every mat DEAD — the same empty slab nine times. The floor is the
 * one surface the sightline rules leave completely free, so it carries each
 * room's narrative as painted deck markings that STAGE the props: the route
 * across Nuremi's map, the training zone the weights sit in, the timeline
 * arrow from employee-desk to founder-tower. One transparent canvas each,
 * laid flush over the mat; a shared line language (thin accent strokes,
 * dashes, node dots) keeps all nine reading as one ship. */

type FloorArt = {
  cx: number;
  cz: number;
  w: number;
  d: number;
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number, accent: string) => void;
};

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const FLOOR_ART: Record<RoomTheme, FloorArt> = {
  // training zone ring around the weights corner + dashed approach from the
  // treadmill side — the workout "spawn point"
  gym: {
    cx: 1.35, cz: 1.35, w: 2.6, d: 2.2,
    draw(ctx, W, H, accent) {
      ctx.strokeStyle = hexA(accent, 0.55);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(W * 0.52, H * 0.52, W * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = hexA(accent, 0.35);
      ctx.beginPath(); ctx.arc(W * 0.52, H * 0.52, W * 0.38, 0, Math.PI * 2); ctx.stroke();
      // tick marks on the outer ring
      for (let a = 0; a < 4; a++) {
        const t = (a * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(W * 0.52 + Math.cos(t) * W * 0.36, H * 0.52 + Math.sin(t) * W * 0.36);
        ctx.lineTo(W * 0.52 + Math.cos(t) * W * 0.42, H * 0.52 + Math.sin(t) * W * 0.42);
        ctx.stroke();
      }
      ctx.setLineDash([14, 12]);
      ctx.strokeStyle = hexA("#f4f1ea", 0.22);
      ctx.beginPath(); ctx.moveTo(0, H * 0.3); ctx.quadraticCurveTo(W * 0.3, H * 0.32, W * 0.42, H * 0.48); ctx.stroke();
    },
  },
  // three concentric life-orbit arcs, a node dot pulled onto each
  lifeos: {
    cx: -0.2, cz: 0.5, w: 3.2, d: 2.4,
    draw(ctx, W, H, accent) {
      for (let i = 0; i < 3; i++) {
        const r = W * (0.14 + i * 0.11);
        ctx.strokeStyle = hexA(accent, 0.45 - i * 0.1);
        ctx.lineWidth = 3;
        ctx.setLineDash(i === 1 ? [16, 10] : []);
        ctx.beginPath(); ctx.arc(W * 0.5, H * 0.5, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const t = -0.9 + i * 2.1;
        ctx.fillStyle = hexA(i === 0 ? "#f4f1ea" : accent, 0.75);
        ctx.beginPath();
        ctx.arc(W * 0.5 + Math.cos(t) * r, H * 0.5 + Math.sin(t) * r * (H / W) * 1.33, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  // growth path: dots swelling toward the planter bench (habit streak)
  habit: {
    cx: -1.0, cz: 0.85, w: 3.0, d: 2.2,
    draw(ctx, W, H, accent) {
      const pts = [
        [0.1, 0.75, 5], [0.28, 0.62, 8], [0.46, 0.52, 12], [0.64, 0.44, 17], [0.82, 0.38, 23],
      ] as const;
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = hexA(accent, 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(W * x, H * y) : ctx.moveTo(W * x, H * y)));
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach(([x, y, r], i) => {
        ctx.fillStyle = hexA(accent, 0.35 + i * 0.13);
        ctx.beginPath(); ctx.arc(W * x, H * y, r, 0, Math.PI * 2); ctx.fill();
      });
    },
  },
  // the journey: dashed route from the globe's base out toward the signpost,
  // waypoint dots en route (the mat under this is already a map grid)
  map: {
    cx: -0.2, cz: 0.3, w: 4.2, d: 3.0,
    draw(ctx, W, H, accent) {
      ctx.setLineDash([18, 12]);
      ctx.strokeStyle = hexA("#f4f1ea", 0.55);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(W * 0.26, H * 0.12);
      ctx.quadraticCurveTo(W * 0.1, H * 0.55, W * 0.36, H * 0.72);
      ctx.quadraticCurveTo(W * 0.62, H * 0.88, W * 0.98, H * 0.66);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of [[0.26, 0.12], [0.19, 0.47], [0.36, 0.72], [0.68, 0.82]] as const) {
        ctx.fillStyle = hexA(accent, 0.9);
        ctx.beginPath(); ctx.arc(W * x, H * y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = hexA(accent, 0.4);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(W * x, H * y, 16, 0, Math.PI * 2); ctx.stroke();
      }
      // arrowhead exiting toward the signpost (off the decal's right edge)
      ctx.fillStyle = hexA("#f4f1ea", 0.7);
      ctx.beginPath();
      ctx.moveTo(W * 0.985, H * 0.61);
      ctx.lineTo(W * 0.94, H * 0.72);
      ctx.lineTo(W * 0.965, H * 0.59);
      ctx.closePath();
      ctx.fill();
    },
  },
  // boutique lane: double-line runner between the ring and necklace plinths
  jewellery: {
    cx: -0.7, cz: -0.25, w: 3.0, d: 2.6,
    draw(ctx, W, H, accent) {
      ctx.strokeStyle = hexA(accent, 0.4);
      ctx.lineWidth = 3;
      for (const off of [-0.055, 0.055]) {
        ctx.beginPath();
        ctx.moveTo(W * (0.72 + off), H * 0.1);
        ctx.lineTo(W * (0.24 + off), H * 0.82);
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const t = 0.15 + i * 0.16;
        const x = 0.72 + (0.24 - 0.72) * t;
        const y = 0.1 + (0.82 - 0.1) * t;
        ctx.strokeStyle = hexA("#f4f1ea", 0.28);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W * (x - 0.075), H * y);
        ctx.lineTo(W * (x + 0.075), H * y);
        ctx.stroke();
      }
    },
  },
  // circuit traces running from the mainframe's corner into the desk cluster
  skills: {
    cx: -1.6, cz: 0.1, w: 3.0, d: 2.6,
    draw(ctx, W, H, accent) {
      ctx.lineWidth = 4;
      const trace = (pts: [number, number][], a: number) => {
        ctx.strokeStyle = hexA(accent, a);
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(W * x, H * y) : ctx.moveTo(W * x, H * y)));
        ctx.stroke();
        const [ex, ey] = pts[pts.length - 1];
        ctx.fillStyle = hexA(accent, a + 0.25);
        ctx.beginPath(); ctx.arc(W * ex, H * ey, 7, 0, Math.PI * 2); ctx.fill();
      };
      trace([[0, 0.14], [0.3, 0.14], [0.3, 0.36], [0.52, 0.36]], 0.5);
      trace([[0, 0.3], [0.2, 0.3], [0.2, 0.62], [0.46, 0.62]], 0.38);
      trace([[0, 0.5], [0.12, 0.5], [0.12, 0.86], [0.62, 0.86]], 0.28);
    },
  },
  // career timeline crossing the whole bay: desk (right) → tower (left),
  // six node ticks for six roles, arrowhead at the founder end
  experience: {
    cx: 0.2, cz: 0.85, w: 4.4, d: 2.4,
    draw(ctx, W, H, accent) {
      ctx.strokeStyle = hexA(accent, 0.5);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(W * 0.98, H * 0.42); ctx.lineTo(W * 0.09, H * 0.62); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const t = 0.14 + i * 0.15;
        const x = 0.98 + (0.09 - 0.98) * t;
        const y = 0.42 + (0.62 - 0.42) * t;
        ctx.fillStyle = hexA(i >= 4 ? "#f4f1ea" : accent, 0.8);
        ctx.beginPath(); ctx.arc(W * x, H * y, i >= 4 ? 9 : 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = hexA(accent, 0.85);
      ctx.beginPath();
      ctx.moveTo(W * 0.045, H * 0.63);
      ctx.lineTo(W * 0.115, H * 0.55);
      ctx.lineTo(W * 0.115, H * 0.71);
      ctx.closePath();
      ctx.fill();
    },
  },
  // hazard-bracketed test zone + crosshair under the radar unit
  defence: {
    cx: 3.35, cz: 1.5, w: 2.2, d: 1.9,
    draw(ctx, W, H, accent) {
      ctx.strokeStyle = hexA(accent, 0.6);
      ctx.lineWidth = 5;
      const L = W * 0.14;
      for (const [x, y, sx, sy] of [[0.06, 0.08, 1, 1], [0.94, 0.08, -1, 1], [0.06, 0.92, 1, -1], [0.94, 0.92, -1, -1]] as const) {
        ctx.beginPath();
        ctx.moveTo(W * x + sx * L, H * y);
        ctx.lineTo(W * x, H * y);
        ctx.lineTo(W * x, H * y + sy * L * (H / W) * 1.16);
        ctx.stroke();
      }
      ctx.strokeStyle = hexA("#f4f1ea", 0.3);
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.arc(W * 0.56, H * 0.6, W * 0.2, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(W * 0.56 - 26, H * 0.6); ctx.lineTo(W * 0.56 + 26, H * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W * 0.56, H * 0.6 - 26); ctx.lineTo(W * 0.56, H * 0.6 + 26); ctx.stroke();
    },
  },
  // laurel arcs cupping the ceremony podium
  trophy: {
    cx: -0.2, cz: 0.55, w: 2.8, d: 2.8,
    draw(ctx, W, H, accent) {
      for (const [r, a] of [[0.3, 0.55], [0.37, 0.3]] as const) {
        ctx.strokeStyle = hexA(accent, a);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(W * 0.5, H * 0.5, W * r, Math.PI * 0.65, Math.PI * 0.35 + Math.PI * 2); ctx.stroke();
      }
      // leaf dots along the inner arc
      for (let i = 0; i < 10; i++) {
        const t = Math.PI * 0.75 + (i / 9) * Math.PI * 1.5;
        ctx.fillStyle = hexA(accent, 0.5);
        ctx.beginPath();
        ctx.arc(W * 0.5 + Math.cos(t) * W * 0.335, H * 0.5 + Math.sin(t) * W * 0.335, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
};

/** Rubber-tile deck for the gym fit-out: a faint tile grid across the whole
 *  alcove floor with the mat's footprint cleared out (the accent platform
 *  stays the hero; the deck reads at the flanks + under the treadmill). */
function GymDeck({ accent }: { accent: string }) {
  const mobile = useIsMobile();
  const tex = useMemo(() => {
    // Mobile: half-res backing store + lower anisotropy (finding 6) — the
    // ctx.scale keeps the drawn grid layout identical, only the texel density
    // drops (a faint deck grid never resolves above this on a portrait frame).
    const scale = mobile ? 0.5 : 1;
    const W = 1024;
    const H = 512; // maps the 7.9 × 3.95 alcove floor (129.6 px per world unit)
    const c = document.createElement("canvas");
    c.width = W * scale;
    c.height = H * scale;
    const ctx = c.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(14,16,24,0.5)";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i * 64.8 <= W; i++) {
      ctx.strokeStyle = i % 4 === 0 ? hexA(accent, 0.22) : "rgba(244,241,234,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(i * 64.8, 0); ctx.lineTo(i * 64.8, H); ctx.stroke();
      if (i * 64.8 <= H) {
        ctx.beginPath(); ctx.moveTo(0, i * 64.8); ctx.lineTo(W, i * 64.8); ctx.stroke();
      }
    }
    // clear the mat's footprint (mat centre sits 0.3 world behind this plane's
    // centre) so the deck never draws over the platform or its glow rim
    ctx.clearRect(512 - 311, 217 - 240, 622, 480);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = mobile ? 4 : 8;
    return t;
  }, [accent, mobile]);
  return (
    <mesh position={[0, 0.025, 0.45]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[7.9, 3.95]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function FloorStory({ theme, accent }: { theme: RoomTheme; accent: string }) {
  const art = FLOOR_ART[theme];
  const mobile = useIsMobile();
  const tex = useMemo(() => {
    // Half-res + capped anisotropy on mobile (finding 6); ctx.scale keeps the
    // painted layout identical. These are deliberately faint deck markings —
    // texel density is not what makes them read.
    const scale = mobile ? 0.5 : 1;
    const W = 512;
    const H = Math.round((W * art.d) / art.w);
    const c = document.createElement("canvas");
    c.width = W * scale;
    c.height = Math.round(H * scale);
    const ctx = c.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, W, H);
    art.draw(ctx, W, H, accent);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = mobile ? 4 : 8;
    return t;
  }, [art, accent, mobile]);
  return (
    /* y 0.05: above the mat slab + rim (~0.02) — flush to the eye, no z-fight */
    <mesh position={[art.cx, 0.05, art.cz]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[art.w, art.d]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** A display pedestal (height `h`); its child sits on top. With `accent` it
 *  gets the museum-showcase treatment: a thin emissive rim ring just under
 *  the top flare + a soft additive glow puck on the floor around the base —
 *  the bays' "this one's an exhibit" language, no extra lights. */
function Plinth({
  h = 1.1,
  x = 0,
  z = 0,
  accent,
  children,
}: {
  h?: number;
  x?: number;
  z?: number;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <group position={[x, 0, z]}>
      <Model name="pedestal" height={h} />
      {accent && (
        <>
          <mesh position={[0, h - 0.07, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.27, 0.012, 8, 40]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.15, 1.15]} />
            <meshBasicMaterial
              map={getPuckTex()}
              color={accent}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <group position={[0, h + 0.02, 0]}>{children}</group>
    </group>
  );
}

/** The drone GLB is a fully SKINNED rig (every mesh is armature-driven), and
 *  <Model>'s scene.clone(true) detaches skinned meshes from their skeleton — the
 *  clone renders collapsed/invisible (the "empty pedestal" bug). The drone is
 *  used exactly once in the app, so mount the cached scene directly (no clone)
 *  and normalise by hand from its measured rest-pose bounds:
 *  size 1.29 × 0.77 × 0.67, min-y 0.105, centre-z 0.103. */
function DroneShowcase() {
  const { scene } = useGLTF(withBase("/models/drone.glb"));
  const s = 0.95 / 1.29; // largest dim → 0.95, hero-but-not-oversized
  // hover: bottom edge floats 0.35 above the plinth top; recentre x/z drift
  return (
    <group scale={s} position={[0, 0.35 - 0.105 * s, -0.103 * s]}>
      <primitive object={scene} />
    </group>
  );
}

/** Experience hero: company tower on its pedestal. The kit tower ships an UNLIT
 *  "window" material, so under the moody corridor light it reads as a featureless
 *  slab — give the shared material a soft emissive (the clone inside <Model>
 *  reuses the same material instance) so the facade reads as occupied floors,
 *  plus an accent base plate + roof beacon for silhouette interest as it spins. */
function TowerShowcase({ accent, animate }: { accent: string; animate: boolean }) {
  const { scene } = useGLTF(withBase("/models/skyscraper.glb"));
  useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.name === "window" && std.emissive) {
          std.emissive.set("#7fb0e8");
          std.emissiveIntensity = 0.55;
        }
      }
    });
  }, [scene]);
  return (
    <Plinth h={0.9} x={-2.7} z={1.1}>
      <SpinY speed={0.25} animate={animate}>
        <Model name="skyscraper" height={1.1} rotation={[0, d2r(18), 0]} />
      </SpinY>
      {/* accent base plate under the tower + tiny roof beacon */}
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.03, 24]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.14, 0]}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </Plinth>
  );
}

export default function RoomProps({
  theme,
  accent,
  animate,
}: {
  theme: RoomTheme;
  accent: string;
  animate: boolean;
}) {
  return (
    <group>
      <FloorStory theme={theme} accent={accent} />
      <ThemeProps theme={theme} accent={accent} animate={animate} />
    </group>
  );
}

function ThemeProps({
  theme,
  accent,
  animate,
}: {
  theme: RoomTheme;
  accent: string;
  animate: boolean;
}) {
  switch (theme) {
    case "gym": // SelfQuest — a FITTED-OUT ship gym, not a bay with weights in it:
      // rubber-tile deck bordering the mat, mirrored wall + light rail on the
      // right side wall, wall rack with parked dumbbells, bench in the training
      // ring, suspension rings at the frame edge. (First room = the fit-out bar.)
      return (
        <group>
          {/* rubber-tile deck: grid ring AROUND the mat (centre cleared so the
              accent platform stays the hero) */}
          <GymDeck accent={accent} />

          {/* mirrored right side wall: glossy black slab + accent light rail.
              No env map — it reads as a mirror by catching the bay light. */}
          <group position={[3.96, 0, 0.45]} rotation-y={-Math.PI / 2}>
            <mesh position={[0, 1.55, 0]}>
              <planeGeometry args={[3.4, 1.9]} />
              <meshStandardMaterial color="#11141f" roughness={0.08} metalness={1} />
            </mesh>
            {/* sheen band so the slab reads as glass, not painted wall */}
            <mesh position={[-0.5, 1.7, 0.005]} rotation-z={d2r(18)}>
              <planeGeometry args={[0.5, 2.1]} />
              <meshBasicMaterial color="#3a4460" transparent opacity={0.35} toneMapped={false} depthWrite={false} />
            </mesh>
            <mesh position={[0, 2.56, 0.02]}>
              <boxGeometry args={[3.4, 0.07, 0.05]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.56, 0.02]}>
              <boxGeometry args={[3.4, 0.04, 0.04]} />
              <meshBasicMaterial color={accent} transparent opacity={0.55} toneMapped={false} />
            </mesh>
          </group>

          {/* back-wall rack RIGHT of the hero screen — in the dwell camera's
              view beside the info panel's edge (the side wall reads as outside
              the frame: QA "these aren't inside the room") */}
          <group position={[3.35, 0, -1.38]}>
            {([1.04, 0.68] as const).map((y) => (
              <mesh key={y} position={[0, y, 0.08]}>
                <boxGeometry args={[1.5, 0.06, 0.14]} />
                <meshStandardMaterial color="#191d29" roughness={0.5} metalness={0.6} />
              </mesh>
            ))}
            <Model name="dumbbell" maxDim={0.5} position={[-0.32, 1.07, 0.1]} rotation={[0, d2r(4), 0]} />
            <Model name="dumbbell" maxDim={0.42} position={[0.3, 0.71, 0.1]} rotation={[0, d2r(-6), 0]} />
          </group>

          {/* heavy bag hanging in the back-right corner, clear of the panel's
              right edge */}
          <group position={[3.5, 0, -0.7]}>
            <mesh position={[0, 3.2, 0]}>
              <boxGeometry args={[0.05, 1.6, 0.05]} />
              <meshStandardMaterial color="#2b3040" roughness={0.6} />
            </mesh>
            <Model name="punchingbag" height={1.25} position={[0, 1.15, 0]} rotation={[0, d2r(30), 0]} />
          </group>

          {/* exercise bike right-front, in the clear lane past the panel band
              (the left flank belongs to the treadmill — parking it there
              interpenetrated the deck: QA "bike and treadmill overlap") */}
          <Model name="gymbike" height={1.15} position={[3.55, 0, 1.6]} rotation={[0, d2r(-55), 0]} />

          {/* real bench at the training ring's edge + barbell resting across
              the ring floor */}
          <Model name="gymbench" maxDim={1.15} position={[1.9, 0, 1.25]} rotation={[0, d2r(78), 0]} />
          <Model name="barbell" maxDim={1.6} position={[1.25, 0, 0.95]} rotation={[0, d2r(-18), 0]} />
          {/* left of the panel band, near-profile: at 38°/3.2 the tall console
              arm crossed the phone's left bezel from the dwell camera, so it is
              slightly smaller, more side-on and pulled further left/forward */}
          <Model name="treadmill" maxDim={2.7} position={[-2.75, 0, 0.5]} rotation={[0, d2r(20), 0]} />
          {/* powered-on console strip floating just over the treadmill's head
              unit — the machine read as a dead black slab under bay light
              (same trick as the skills desk screens: emissive quad, no light) */}
          <group position={[-3.3, 1.32, 0.35]} rotation={[d2r(-15), d2r(20), 0]}>
            <mesh>
              <planeGeometry args={[0.55, 0.13]} />
              <meshStandardMaterial color="#06090d" emissive={accent} emissiveIntensity={0.6} roughness={1} />
            </mesh>
          </group>
          {/* deliberate "weights corner": short items grouped under the panel's
              bottom edge, all pulled fully INSIDE the mat rim (x ≤ 2.2, z ≤ 1.95)
              so nothing straddles the glowing edge */}
          <Model name="kettlebell" height={0.6} position={[0.75, 0, 1.6]} rotation={[0, d2r(28), 0]} />
          <Model name="dumbbell" maxDim={0.7} position={[1.15, 0, 1.85]} rotation={[0, d2r(74), 0]} />
        </group>
      );

    case "skills": // Capabilities — a real workstation, back-left so the code terminal + panel stay clear
      return (
        <group>
          <Model name="deskq" height={0.78} position={[-1.6, 0, -0.4]} rotation={[0, d2r(15), 0]} />
          <Model name="laptop" maxDim={0.44} position={[-1.95, 0.78, -0.5]} rotation={[0, d2r(32), 0]} />
          <Model name="monitor" height={0.36} position={[-1.25, 0.78, -0.55]} rotation={[0, d2r(4), 0]} />
          {/* faint powered-on glow so the desk screens don't read as dead slabs
              next to the lit wall terminal (emissive planes, no extra lights) */}
          <group position={[-1.25, 0.78, -0.55]} rotation={[0, d2r(4), 0]}>
            <mesh position={[0, 0.2, 0.075]}>
              <planeGeometry args={[0.38, 0.2]} />
              <meshStandardMaterial color="#06090d" emissive={accent} emissiveIntensity={0.55} roughness={1} />
            </mesh>
          </group>
          <group position={[-1.95, 0.78, -0.5]} rotation={[0, d2r(32), 0]}>
            <mesh position={[0, 0.16, -0.06]} rotation={[d2r(-14), 0, 0]}>
              <planeGeometry args={[0.26, 0.15]} />
              <meshStandardMaterial color="#06090d" emissive={accent} emissiveIntensity={0.45} roughness={1} />
            </mesh>
          </group>
          <Model name="officechair" height={1.05} position={[-1.55, 0, 0.45]} rotation={[0, d2r(168), 0]} />
          <Model name="plant" height={0.7} position={[-3.0, 0, 0.1]} rotation={[0, d2r(-40), 0]} />
          {/* mainframe cabinet in the deep back-left corner — the "real iron"
              behind the workstation. Hugs the wall past the code terminal's
              left edge; accent status LED so it reads as running */}
          <Model name="mainframe" height={1.5} position={[-3.35, 0, -1.0]} rotation={[0, d2r(24), 0]} />
          <mesh position={[-3.12, 1.28, -0.78]}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        </group>
      );

    case "lifeos": // SelfAware — tidy workstation in the back-left corner; robot greets from the front-left corner
      return (
        <group>
          <Model name="deskq" height={0.78} position={[-2.5, 0, -0.7]} rotation={[0, d2r(30), 0]} />
          <Model name="monitor" height={0.36} position={[-2.55, 0.78, -0.8]} rotation={[0, d2r(30), 0]} />
          {/* this room's phone runs floor-to-top, so the robot must clear the
              WHOLE phone band in screen space AND the desk cluster behind it —
              it stands well left + forward, turned toward the centre */}
          <Model name="robot" height={1.3} position={[-2.95, 0, 1.9]} rotation={[0, d2r(-25), 0]} />
          {/* small floor plant fills the otherwise-dead strip between the phone
              and the info panel (short enough to duck under both) */}
          <Model name="plant" height={0.4} position={[-0.25, 0, 1.05]} rotation={[0, d2r(70), 0]} />
        </group>
      );

    case "experience": // founder workstation hugging the RIGHT wall (peeks past the timeline panel) + company tower left-front
      return (
        <group>
          <Model name="deskq" height={0.78} position={[3.3, 0, 0.55]} rotation={[0, d2r(-64), 0]} />
          <Model name="monitor" height={0.34} position={[3.36, 0.78, 0.5]} rotation={[0, d2r(-64), 0]} />
          <Model name="officechair" height={1.05} position={[3.5, 0, 1.35]} rotation={[0, d2r(-128), 0]} />
          {/* left-FRONT, away from the screen light + accent hotspot so the tower
              reads as lit steel with glowing windows, not a blown-out column */}
          <TowerShowcase accent={accent} animate={animate} />
          {/* the founder's ship, circling low over the company tower — the
              journey motif. Kept just above the tower beacon (higher drifted
              into the unlit band and read as a dark blob: QA slot7); a small
              accent engine glow rides inside the spin so it stays readable */}
          <group position={[-2.7, 0, 1.1]}>
            <Bob amp={0.07} speed={1.1} animate={animate}>
              <group position={[0, 2.3, 0]}>
                <SpinY speed={0.35} animate={animate}>
                  <Model name="spaceship" maxDim={0.62} onFloor={false} rotation={[0, 0, d2r(-6)]} />
                  <mesh position={[0, 0.02, -0.27]}>
                    <sphereGeometry args={[0.035, 10, 10]} />
                    <meshBasicMaterial color={accent} toneMapped={false} />
                  </mesh>
                </SpinY>
              </group>
            </Bob>
          </group>
        </group>
      );

    case "map": // Nuremi — hero-scale globe beside the phone + compass raised to a low plinth
      return (
        <group>
          {/* as big as the lane between the phone's right bezel and the glass
              panel's left edge allows from the dwell camera — wider would clip
              one or the other. Pulled left+forward so the panel's left border
              grazes the sphere's edge instead of slicing the pedestal (border
              at world x=0; globe right edge lands ≈ screen-x 0 from the dwell). */}
          <Plinth h={0.9} x={-0.35} z={-0.85} accent={accent}>
            <SpinY speed={0.25} animate={animate}>
              <Model name="globe" height={1.35} />
            </SpinY>
          </Plinth>
          {/* bobbing location pin over the globe's pole — the app's one-glance
              motif ("you are here"), floating free like the holo panels */}
          <group position={[-0.35, 0, -0.85]}>
            <Bob amp={0.06} speed={1.4} animate={animate}>
              <group position={[0, 2.52, 0]}>
                <mesh position={[0, 0.1, 0]}>
                  <sphereGeometry args={[0.085, 16, 16]} />
                  <meshBasicMaterial color={accent} toneMapped={false} />
                </mesh>
                <mesh rotation-x={Math.PI}>
                  <coneGeometry args={[0.062, 0.17, 16]} />
                  <meshBasicMaterial color={accent} toneMapped={false} />
                </mesh>
              </group>
            </Bob>
          </group>
          {/* on a low plinth so it reads (invisible flat on the floor); centre
              floor stays clear for the map mat */}
          <Plinth h={0.5} x={-1.9} z={1.5} accent={accent}>
            <Model name="compass" maxDim={0.5} rotation={[0, d2r(-28), 0]} />
          </Plinth>
          {/* wayfinding signpost past the panel's right edge (x > 3.3 = clear
              of the occlusion band) — angled like it's pointing down-route */}
          <Model name="arrowsign" height={1.15} position={[3.45, 0, 1.15]} rotation={[0, d2r(-35), 0]} />
        </group>
      );

    case "trophy": // Milestones — podium hero fully LEFT of the hero card; sports cup centred on the gold mat
      return (
        <group>
          {/* the whole podium lives left of the hero card's rays (at x −0.5 the
              cup covered the end of the card's title from the dwell camera) */}
          <group position={[-2.8, 0, -0.7]}>
            {/* wide flat step under the main plinth for a podium feel */}
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[1.6, 0.12, 1.6]} />
              <meshStandardMaterial color="#2c2f38" roughness={0.4} metalness={0.6} />
            </mesh>
            <group position={[0, 0.12, 0]}>
              <Plinth h={1.15} accent={accent}>
                <SpinY speed={0.2} animate={animate}>
                  <Model name="trophy" height={0.95} />
                </SpinY>
              </Plinth>
            </group>
          </group>
          {/* 1st/2nd/3rd mini-podium ON the gold mat — fills the circle with a
              real "wins" motif while staying LOW: anything on this centre disc
              taller than ~0.9 world units crosses the hero card (left) or info
              panel (right) in screen space from the dwell camera */}
          <group position={[-0.2, 0, 0.55]} rotation={[0, d2r(12), 0]}>
            {([[0, 0.26, 0], [-0.62, 0.17, 1], [0.62, 0.1, 2]] as const).map(([px, h, i]) => (
              <mesh key={i} position={[px, h / 2, 0]}>
                <boxGeometry args={[0.58, h, 0.58]} />
                <meshStandardMaterial color={i === 0 ? "#3a3325" : "#2c2f38"} roughness={0.45} metalness={0.6} />
              </mesh>
            ))}
            <group position={[0, 0.26, 0]}>
              <SpinY speed={0.3} animate={animate}>
                <Model name="sportstrophy" height={0.62} rotation={[0, d2r(24), 0]} />
              </SpinY>
            </group>
          </group>
        </group>
      );

    case "defence": // Allied — hovering drone patrol over the cargo corner + CAD bench on the right wall
      return (
        <group>
          {/* drone showcase LEFT of the blueprint screen's rays — a visible
              drone at the old room-centre spot would clip the screen's right
              edge from the dwell camera (hover offset is baked into
              DroneShowcase; slow bob so it reads as flying) */}
          <Plinth h={1.05} x={-2.65} z={0.95} accent={accent}>
            <Bob amp={0.06} speed={1.2} animate={animate}>
              <SpinY speed={0.3} animate={animate}>
                <DroneShowcase />
              </SpinY>
            </Bob>
          </Plinth>
          <Model name="deskq" height={0.78} position={[3.3, 0, 0.2]} rotation={[0, d2r(-70), 0]} />
          <Model name="monitor" height={0.36} position={[3.36, 0.78, 0.15]} rotation={[0, d2r(-70), 0]} />
          {/* small accent indicator light sitting on the desk */}
          <mesh position={[3.35, 0.82, 0.55]}>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          {/* stacked cargo corner — now the BACKDROP behind the drone showcase;
              varied sizes/rotations, lifted a few steps brighter so the crates
              and the accent edge strips actually read against the dark wall */}
          <group position={[-3.35, 0, -0.3]} rotation={[0, 0.12, 0]}>
            <mesh position={[0, 0.39, 0]}>
              <boxGeometry args={[0.78, 0.78, 0.78]} />
              <meshStandardMaterial color="#756b60" roughness={0.8} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.7, 0.4]}>
              <boxGeometry args={[0.8, 0.035, 0.035]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
            <mesh position={[0.4, 0.45, 0.4]}>
              <boxGeometry args={[0.035, 0.55, 0.035]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          </group>
          <mesh position={[-3.25, 1.06, -0.4]} rotation={[0, 0.5, 0]}>
            <boxGeometry args={[0.55, 0.55, 0.55]} />
            <meshStandardMaterial color="#695f55" roughness={0.8} metalness={0.2} />
          </mesh>
          {/* field radar unit on the shop floor beside the CAD bench — a test
              article mid-inspection. (First placement — atop the tall crate —
              vanished into the unlit back-left corner: QA slot8.) x > 3.3
              keeps it out of the info panel's occlusion band. */}
          <group position={[3.55, 0, 1.75]}>
            <SpinY speed={0.5} animate={animate}>
              <Model name="radar" maxDim={0.85} rotation={[0, d2r(-110), 0]} />
            </SpinY>
          </group>
          <mesh position={[-2.7, 0.21, -0.85]} rotation={[0, -0.35, 0]}>
            <boxGeometry args={[0.42, 0.42, 0.42]} />
            <meshStandardMaterial color="#7a6f62" roughness={0.8} metalness={0.2} />
          </mesh>
        </group>
      );

    case "habit": // SelfGrow — plants arc left-to-centre (tallest back-left) + one far-right so no dead third
      return (
        <group>
          <Model name="plant" height={1.45} position={[-3.3, 0, -0.9]} rotation={[0, d2r(25), 0]} />
          {/* hanging grow-lamp over the tall back-left plant: rod from the bay
              ceiling (local y 4), cone shade, warm emissive face + a soft warm
              pool on the foliage below — a nurture beat, no real light added */}
          <group position={[-3.3, 0, -0.9]}>
            <mesh position={[0, 3.32, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 1.36, 8]} />
              <meshStandardMaterial color="#171a24" roughness={0.6} metalness={0.5} />
            </mesh>
            <mesh position={[0, 2.56, 0]}>
              <coneGeometry args={[0.22, 0.18, 20, 1, true]} />
              <meshStandardMaterial color="#1b1e2a" roughness={0.5} metalness={0.55} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 2.47, 0]} rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.16, 20]} />
              <meshBasicMaterial color="#ffd9a0" toneMapped={false} side={THREE.BackSide} />
            </mesh>
            <mesh position={[0, 1.62, 0]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[1.0, 1.0]} />
              <meshBasicMaterial
                map={getPuckTex()}
                color="#ffbe8a"
                transparent
                opacity={0.16}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
          {/* pulled left + trimmed so its top leaf clears the phone's
              bottom-left corner from the dwell camera */}
          <Model name="plant" height={0.85} position={[-2.4, 0, 0.35]} rotation={[0, d2r(-60), 0]} />
          {/* two-tier planter bench at the growth path's end — the streak
              made physical: the small plant graduates onto the top step.
              Low (≤0.6 + plant 0.5) so it ducks the panel's bottom edge */}
          <group position={[-0.35, 0, 1.05]} rotation={[0, d2r(-12), 0]}>
            <mesh position={[-0.34, 0.11, 0]}>
              <boxGeometry args={[0.62, 0.22, 0.6]} />
              <meshStandardMaterial color="#20242f" roughness={0.6} metalness={0.4} />
            </mesh>
            <mesh position={[0.34, 0.2, 0]}>
              <boxGeometry args={[0.62, 0.4, 0.6]} />
              <meshStandardMaterial color="#252a37" roughness={0.6} metalness={0.4} />
            </mesh>
            <mesh position={[0, 0.415, 0.26]}>
              <boxGeometry args={[1.3, 0.03, 0.04]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
            <Model name="plant" height={0.34} position={[-0.34, 0.22, 0]} rotation={[0, d2r(40), 0]} />
            <Model name="plant" height={0.5} position={[0.34, 0.4, 0]} rotation={[0, d2r(140), 0]} />
          </group>
          <Model name="wateringcan" height={0.36} position={[-1.35, 0, 1.5]} rotation={[0, d2r(55), 0]} />
          {/* beyond the panel's right edge so the right third isn't empty */}
          <Model name="plant" height={0.45} position={[3.4, 0, 1.2]} rotation={[0, d2r(80), 0]} />
        </group>
      );

    case "jewellery": // Xuabelle — three-plinth boutique triangle; hero ring spins, necklace drapes flat
      return (
        <group>
          <Plinth h={1.2} x={0} z={-0.85} accent={accent}>
            <SpinY speed={0.7} animate={animate}>
              <Model name="ring" maxDim={0.5} />
            </SpinY>
          </Plinth>
          {/* upZ lays the flat model face-up BEFORE the bbox pass, so it floors
              cleanly on the plinth top instead of standing edge-on mid-air */}
          <Plinth h={0.85} x={-1.35} z={0.35} accent={accent}>
            <Model name="necklace" maxDim={0.5} upZ rotation={[0, d2r(30), 0]} />
          </Plinth>
          {/* beyond the panel's right edge — pulled forward so even the panel's
              rounded border line clears the plinth silhouette */}
          <Plinth h={0.85} x={3.55} z={1.75} accent={accent}>
            <SpinY speed={0.35} animate={animate}>
              <Model name="gem" maxDim={0.4} rotation={[0, d2r(-32), 0]} />
            </SpinY>
          </Plinth>
          {/* crown deeper in the right column (same x>3.3 clear lane as the
              gem, staggered depth) — completes the boutique triangle → quartet */}
          <Plinth h={1.05} x={3.5} z={0.55} accent={accent}>
            <SpinY speed={0.25} animate={animate}>
              <Model name="crown" maxDim={0.42} rotation={[0, d2r(15), 0]} />
            </SpinY>
          </Plinth>
        </group>
      );

    default:
      return null;
  }
}
