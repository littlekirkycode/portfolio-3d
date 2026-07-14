"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RoomTheme } from "@/lib/constants";
import { useIsMobile } from "@/lib/useIsMobile";
import { hexA, useTextTexture } from "./canvas2d";
import { ALCOVE_DEPTH, type Room } from "./hallConfig";

/* ── the painted bay floor system (split out of Walls.tsx + RoomProps.tsx,
 *    finding 34): the flush accent mat / platform each bay's props rest on
 *    (MAT_SPECS + BayMat, with Nuremi's MapFloor city map), the per-theme
 *    FLOOR_ART deck markings that stage the props, and the gym's rubber-tile
 *    deck. One visual system, one module. ── */

/* ── flush accent mat per bay (props rest ON it); Nuremi gets a map floor ──── */

const MAT_SPECS: Record<RoomTheme, { shape: "rect" | "round" | "map"; w: number; d: number }> = {
  gym: { shape: "rect", w: 4.4, d: 3.6 },
  lifeos: { shape: "rect", w: 4.2, d: 3.4 },
  habit: { shape: "round", w: 4.2, d: 4.2 },
  map: { shape: "map", w: 5.4, d: 3.6 },
  jewellery: { shape: "rect", w: 4.6, d: 3.0 },
  skills: { shape: "rect", w: 4.2, d: 3.4 },
  experience: { shape: "rect", w: 3.6, d: 3.0 },
  defence: { shape: "rect", w: 4.2, d: 3.4 },
  trophy: { shape: "round", w: 3.4, d: 3.4 },
};

/** A stylized top-down CITY MAP covering the floor (Nuremi maps concierge):
 *  street grid, river, a park, a glowing navigation route, and pin markers. */
function MapFloor({ accent, w, d, z }: { accent: string; w: number; d: number; z: number }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
      // R6: shadowBlur applies in BACKING-STORE pixels — the canvas spec
      // exempts shadow geometry from the CTM — so useTextTexture's mobile
      // 0.5x transform halves the map but not the glow, doubling the halo
      // relative to the street grid. Scale the blur by the live transform.
      const bs = ctx.getTransform().a || 1;
      const line = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };
      // land base
      ctx.fillStyle = "#10131f";
      ctx.fillRect(0, 0, cw, ch);
      // faint city blocks
      ctx.fillStyle = hexA(accent, 0.04);
      for (let i = 0; i < 14; i++) {
        for (let j = 0; j < 9; j++) {
          if ((i + j) % 2 === 0) ctx.fillRect((cw * i) / 14, (ch * j) / 9, cw / 14, ch / 9);
        }
      }
      // river (winding water band)
      ctx.strokeStyle = "#16273f";
      ctx.lineWidth = ch * 0.11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-20, ch * 0.72);
      ctx.bezierCurveTo(cw * 0.28, ch * 0.6, cw * 0.4, ch * 0.98, cw * 0.66, ch * 0.82);
      ctx.bezierCurveTo(cw * 0.82, ch * 0.73, cw * 0.9, ch * 0.9, cw + 20, ch * 0.8);
      ctx.stroke();
      // park
      ctx.fillStyle = hexA("#63d39a", 0.16);
      ctx.fillRect(cw * 0.1, ch * 0.12, cw * 0.15, ch * 0.18);
      // minor street grid
      ctx.lineCap = "butt";
      ctx.strokeStyle = hexA(accent, 0.4);
      ctx.lineWidth = 3;
      for (let i = 1; i < 14; i++) line((cw * i) / 14, 0, (cw * i) / 14, ch);
      for (let j = 1; j < 9; j++) line(0, (ch * j) / 9, cw, (ch * j) / 9);
      // major avenues
      ctx.strokeStyle = hexA(accent, 0.6);
      ctx.lineWidth = 7;
      line(0, ch * 0.33, cw, ch * 0.33);
      line(cw * 0.5, 0, cw * 0.5, ch);
      ctx.lineWidth = 5;
      line(0, ch * 0.08, cw, ch * 0.78); // diagonal boulevard
      // glowing navigation route
      ctx.shadowColor = accent;
      ctx.shadowBlur = 26 * bs;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cw * 0.2, ch * 0.8);
      ctx.lineTo(cw * 0.2, ch * 0.33);
      ctx.lineTo(cw * 0.5, ch * 0.33);
      ctx.lineTo(cw * 0.5, ch * 0.18);
      ctx.lineTo(cw * 0.72, ch * 0.18);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // pin markers (flat, drawn on the map)
      const pin = (x: number, y: number, r: number, hi: boolean) => {
        ctx.fillStyle = hi ? "#ffffff" : accent;
        if (hi) { ctx.shadowColor = accent; ctx.shadowBlur = 22 * bs; }
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - r, y - r * 1.25, x - r, y - r * 1.85);
        ctx.arc(x, y - r * 1.85, r, Math.PI, 0, false);
        ctx.quadraticCurveTo(x + r, y - r * 1.25, x, y);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = hi ? accent : "#10131f";
        ctx.beginPath();
        ctx.arc(x, y - r * 1.85, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      };
      pin(cw * 0.2, ch * 0.8, 20, false); // start
      pin(cw * 0.5, ch * 0.55, 18, false); // waypoint
      pin(cw * 0.72, ch * 0.18, 30, true); // destination (highlighted)
      // compass rose (top-right)
      const cxr = cw * 0.9;
      const cyr = ch * 0.16;
      const R = ch * 0.07;
      ctx.strokeStyle = hexA(accent, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cxr, cyr, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(cxr, cyr - R * 0.85);
      ctx.lineTo(cxr - R * 0.32, cyr + R * 0.1);
      ctx.lineTo(cxr + R * 0.32, cyr + R * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexA("#f4f1ea", 0.75);
      ctx.font = `bold ${Math.round(R * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", cxr, cyr + R * 0.55);
      // scale bar (bottom-left)
      ctx.strokeStyle = hexA("#f4f1ea", 0.5);
      ctx.lineWidth = 3;
      const sx = cw * 0.06;
      const sy = ch * 0.93;
      line(sx, sy, sx + cw * 0.12, sy);
      line(sx, sy - 6, sx, sy + 6);
      line(sx + cw * 0.12, sy - 6, sx + cw * 0.12, sy + 6);
      // inset frame
      ctx.strokeStyle = hexA(accent, 0.5);
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, cw - 16, ch - 16);
    },
    [accent],
  );
  const tex = useTextTexture(1536, Math.round((1536 * d) / w), render);
  return (
    <mesh position={[0, 0.012, z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

export function BayMat({ room }: { room: Room }) {
  const spec = MAT_SPECS[room.theme];
  // dark platform slab + softened emissive accent rim → lit exhibit base, not a rug
  const color = useMemo(() => new THREE.Color(room.accent).multiplyScalar(0.11), [room.accent]);
  const rim = useMemo(() => new THREE.Color(room.accent).multiplyScalar(0.85), [room.accent]);
  const cz = -ALCOVE_DEPTH + 1.7; // under the prop cluster
  if (spec.shape === "map") return <MapFloor accent={room.accent} w={spec.w} d={spec.d} z={cz} />;
  if (spec.shape === "round") {
    const r = Math.min(spec.w, spec.d) / 2;
    return (
      <group position={[0, 0, cz]}>
        <mesh position-y={0.006}>
          <cylinderGeometry args={[r, r, 0.012, 48]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
        {/* thin glowing ring around the platform edge */}
        <mesh position-y={0.014} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[r - 0.015, r + 0.05, 64]} />
          <meshBasicMaterial color={rim} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, 0, cz]}>
      {/* slightly larger emissive underlay → a ~5cm glowing rim around the slab */}
      <mesh position-y={0.003}>
        <boxGeometry args={[spec.w + 0.1, 0.006, spec.d + 0.1]} />
        <meshBasicMaterial color={rim} toneMapped={false} />
      </mesh>
      <mesh position-y={0.006}>
        <boxGeometry args={[spec.w, 0.012, spec.d]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    </group>
  );
}

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
export function GymDeck({ accent }: { accent: string }) {
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
  // R4: same dispose contract as useTextTexture — the mobile flip re-mints
  // the texture and R3F never disposes swapped map props.
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 0.025, 0.45]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[7.9, 3.95]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

export function FloorStory({ theme, accent }: { theme: RoomTheme; accent: string }) {
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
  // R4: same dispose contract as useTextTexture (see canvas2d.ts).
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    /* y 0.05: above the mat slab + rim (~0.02) — flush to the eye, no z-fight */
    <mesh position={[art.cx, 0.05, art.cz]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[art.w, art.d]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
