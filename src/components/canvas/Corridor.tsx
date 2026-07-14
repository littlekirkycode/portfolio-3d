"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { SITE } from "@/lib/constants";
import { scrollRefs, fxRefs } from "@/lib/scrollStore";
import { damp } from "@/lib/math";
import {
  HALF_W,
  WALL_H,
  END_VISUAL_X,
  WALL_START,
  WALL_END,
  ROOMS,
  ALCOVE_OPEN_W,
  FEATURE_X,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
} from "./hallConfig";
import { starVertex, starFragment, makeStarUniforms, updateStarUniforms } from "./Windows";

/** Ceiling light fixture X positions (warm point lights for real illumination). */
const FIXTURES = [10, 40, 70, 100, 130, 158];

const END_X = END_VISUAL_X + 8;

/* ── bridge finale ──────────────────────────────────────────────────────── */

const PANEL_CTR_W = 3.4;
const PANEL_SIDE_W = 2.5;
const PANEL_YAW = 0.35; // ~20° — outer panes rake toward the camera (bridge silhouette)

/** Console pip strip — a row of tiny multicoloured indicator lights baked into
 *  one small CanvasTexture; animated by an opacity pulse (no per-frame alloc). */
function usePipsTexture(): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 28;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 1024, 28);
      const cols = ["#7fb0e8", "#ffb07a", "#5a6d96", "#ff5c38", "#9ec4f0"];
      let seed = 7;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      for (let x = 10; x < 1014; x += 16) {
        if (rnd() < 0.28) continue; // dead pip — consoles read as worked panels
        ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
        ctx.globalAlpha = 0.35 + rnd() * 0.65;
        ctx.fillRect(x, 10, rnd() < 0.22 ? 9 : 5, 8);
      }
      ctx.globalAlpha = 1;
    }
    tex.needsUpdate = true;
    return tex;
  }, []);
}

const CONSOLES = [
  { z: -2.4, h: 0.95 },
  { z: -1.2, h: 1.1 },
  { z: 0, h: 0.9 },
  { z: 1.2, h: 1.06 },
  { z: 2.4, h: 0.86 },
];

/* ── diegetic social terminals on the bridge console row ──────────────────
   GitHub / LinkedIn as PHYSICAL console kiosks — THE canonical links (the DOM
   list is sr-only for assistive tech). Standing pedestal + raked screen with
   a blinking prompt cursor; hover eases scale/brightness up and hands the DOM
   cursor a "world-hover" event so the custom cursor reacts like it does over
   [data-cursor] elements. Clicks reach the canvas via the body eventSource
   (see Scene) — the canvas layer itself stays pointer-events:none. */

const TERM_W = 1.8; // screen plane width (world units)
const TERM_H = TERM_W * (288 / 512); // matches the texture aspect

function setWorldHover(v: boolean) {
  window.dispatchEvent(new CustomEvent("world-hover", { detail: v }));
}

/** Terminal screen texture. Also returns the UV spot right after the prompt
 *  text where the blinking cursor block mesh should sit. */
function makeTerminalTexture(
  label: string,
  header: string,
  prompt: string,
): {
  tex: THREE.CanvasTexture;
  cursorU: number;
  cursorV: number;
} {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext("2d")!;
  const mono =
    typeof window !== "undefined"
      ? getComputedStyle(document.documentElement).getPropertyValue("--ff-mono").trim() ||
        "ui-monospace, monospace"
      : "ui-monospace, monospace";
  ctx.fillStyle = "#090d17";
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = "rgba(127,176,232,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 500, 276);
  // corner ticks (brighter than the frame)
  ctx.strokeStyle = "#7fb0e8";
  for (const [tx, ty, sx, sy] of [[22, 22, 1, 1], [490, 22, -1, 1], [22, 266, 1, -1], [490, 266, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(tx + sx * 16, ty);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx, ty + sy * 16);
    ctx.stroke();
  }
  // header row: channel id left, live lamp right
  ctx.textBaseline = "middle";
  ctx.font = `500 22px ${mono}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(127,176,232,0.8)";
  ctx.fillText(header, 34, 44);
  ctx.textAlign = "right";
  ctx.fillStyle = "#37ff8a";
  ctx.fillText("● LIVE", 478, 44);
  // big label
  ctx.textAlign = "center";
  ctx.font = `700 64px ${mono}`;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillText(`${label} ↗`, 256, 140);
  // divider + prompt line (cursor block is a separate blinking mesh)
  ctx.strokeStyle = "rgba(127,176,232,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 196);
  ctx.lineTo(480, 196);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = `500 26px ${mono}`;
  ctx.fillStyle = "rgba(244,241,234,0.85)";
  ctx.fillText(prompt, 40, 238);
  const promptW = ctx.measureText(prompt).width;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, cursorU: (40 + promptW + 16) / 512, cursorV: 238 / 288 };
}

function SocialTerminal({
  label,
  z,
  yaw,
  phase,
  header = "COMMS UPLINK — EXT",
  prompt = "> OPEN CHANNEL",
  x = END_X - 2.5,
  baseHeadY = 1.55,
  activate,
}: {
  label: string;
  z: number;
  yaw: number;
  phase: number;
  header?: string;
  prompt?: string;
  x?: number;
  baseHeadY?: number;
  activate: () => void;
}) {
  const { tex, cursorU, cursorV } = useMemo(
    () => makeTerminalTexture(label, header, prompt),
    [label, header, prompt],
  );
  // Portrait: raise the heads a step, into the clear band between the
  // "Let's talk." heading and the email button (taps land either way:
  // events raycast through the DOM). +0.5 put them INTO the heading.
  const portrait = useThree((s) => s.size.height > s.size.width);
  const headY = baseHeadY + (portrait ? 0.35 : 0);
  const grpRef = useRef<THREE.Group>(null);
  const screenMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const stripMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const curMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const hovered = useRef(false);
  const hoverT = useRef(0);
  const t = useRef(phase);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    t.current += dt;
    hoverT.current = damp(hoverT.current, hovered.current ? 1 : 0, 10, dt);
    const k = hoverT.current;
    if (grpRef.current) grpRef.current.scale.setScalar(1 + 0.04 * k);
    if (screenMatRef.current) screenMatRef.current.color.setScalar(1 + 0.35 * k);
    if (stripMatRef.current) stripMatRef.current.opacity = 0.5 + 0.5 * k;
    // hard-step blink (terminal cursor, not a fade); hover pins it solid
    if (curMatRef.current)
      curMatRef.current.opacity = k > 0.5 || t.current % 1.2 < 0.72 ? 0.95 : 0.08;
  });

  return (
    <group ref={grpRef} position={[x, 0, z]} rotation-y={-Math.PI / 2 + yaw}>
      {/* base plate + pedestal column (column reaches the head's underside) */}
      <mesh position={[0, 0.03, -0.12]}>
        <boxGeometry args={[0.62, 0.06, 0.5]} />
        <meshStandardMaterial color="#0d0f18" roughness={0.55} metalness={0.5} />
      </mesh>
      <mesh position={[0, (headY - 0.41) / 2 + 0.06, -0.12]}>
        <boxGeometry args={[0.42, headY - 0.41, 0.3]} />
        <meshStandardMaterial color="#12141f" roughness={0.5} metalness={0.55} />
      </mesh>

      {/* head — raked back ~7° like a lectern console */}
      <group position={[0, headY, 0]} rotation-x={-0.12}>
        <mesh position={[0, 0, -0.06]}>
          <boxGeometry args={[TERM_W + 0.18, TERM_H + 0.16, 0.1]} />
          <meshStandardMaterial color="#161a28" roughness={0.45} metalness={0.6} />
        </mesh>
        <mesh
          position={[0, 0, 0.001]}
          onClick={(e) => {
            e.stopPropagation();
            activate();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            hovered.current = true;
            document.body.style.cursor = "pointer";
            setWorldHover(true);
          }}
          onPointerOut={() => {
            hovered.current = false;
            document.body.style.cursor = "";
            setWorldHover(false);
          }}
        >
          <planeGeometry args={[TERM_W, TERM_H]} />
          <meshBasicMaterial ref={screenMatRef} map={tex} toneMapped={false} />
        </mesh>
        {/* blinking prompt cursor, positioned right after the "> OPEN CHANNEL" text */}
        <mesh position={[(cursorU - 0.5) * TERM_W, (0.5 - cursorV) * TERM_H, 0.006]}>
          <planeGeometry args={[0.05, 0.1]} />
          <meshBasicMaterial ref={curMatRef} color="#7fb0e8" transparent toneMapped={false} />
        </mesh>
        {/* accent strip under the screen — brightens on hover */}
        <mesh position={[0, -(TERM_H / 2 + 0.115), 0]}>
          <boxGeometry args={[TERM_W + 0.18, 0.045, 0.05]} />
          <meshBasicMaterial ref={stripMatRef} color="#7fb0e8" transparent opacity={0.5} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** The payoff at the end of the hall: a three-pane observation bridge (outer
 *  panes yawed outward — classic bridge silhouette) running the local star
 *  shader, with a low console row for foreground depth. fxRefs.warp (the DOM
 *  DEPART control) drives the panes' hyperspace streak via uWarp. */
function Bridge() {
  const uni = useMemo(() => makeStarUniforms(0, 0), []);
  const starMat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: uni,
    });
    m.toneMapped = false;
    return m;
  }, [uni]);
  // One shared material across all three panes; each pane's geometry remaps
  // uv.x to its band of the composite canopy so the starfield reads as ONE
  // continuous sky wrapping around the bridge (not three tiled copies).
  const geoms = useMemo(() => {
    const total = PANEL_CTR_W + 2 * PANEL_SIDE_W;
    const a = PANEL_SIDE_W / total;
    const mk = (w: number, lo: number, hi: number) => {
      const g = new THREE.PlaneGeometry(w, WALL_H);
      const uvAttr = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvAttr.count; i++) uvAttr.setX(i, lo + uvAttr.getX(i) * (hi - lo));
      return g;
    };
    return [mk(PANEL_SIDE_W, 0, a), mk(PANEL_CTR_W, a, 1 - a), mk(PANEL_SIDE_W, 1 - a, 1)] as const;
  }, []);
  const pipsTex = usePipsTexture();
  const pipMat = useRef<THREE.MeshBasicMaterial>(null);
  const tRef = useRef(0);
  const gatedRef = useRef<THREE.Group>(null);

  useFrame(({ camera }, rawDt) => {
    // Distance gate (finding 3): the bridge sits behind the fog (and mostly
    // past the far plane) for the whole corridor walk — skip submitting its
    // ~40 draws and its star/pip ticks until the camera closes in. Hysteresis
    // avoids threshold flicker. The spill pointLight stays OUTSIDE this group:
    // a light-count change recompiles every lit material mid-scroll.
    const g = gatedRef.current;
    if (g) {
      const d = Math.abs(END_X - camera.position.x);
      if (g.visible) {
        if (d > 40) g.visible = false;
      } else if (d < 37) {
        g.visible = true;
      }
      if (!g.visible) return;
    }
    updateStarUniforms(uni, rawDt, fxRefs.warp);
    tRef.current += Math.min(rawDt, 1 / 30);
    const pm = pipMat.current;
    if (pm) pm.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(tRef.current * 2.2));
  });

  const cy = WALL_H / 2;
  const sy = Math.sin(PANEL_YAW);
  const cz = Math.cos(PANEL_YAW);
  return (
    <group>
      {/* cool spill back toward the camera (starlight through the glass) —
          NEVER gated: the mounted-light count must stay constant */}
      <pointLight position={[END_X - 2.6, 1.8, 0]} color="#bcd4ff" intensity={26} distance={28} decay={2} />

      <group ref={gatedRef}>
      {/* dark surround behind the canopy */}
      <mesh position={[END_X + 1.6, cy, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[HALF_W * 2 + 3.5, WALL_H + 1]} />
        <meshStandardMaterial color="#07070f" roughness={1} />
      </mesh>

      {/* three floor-to-ceiling star panes (shared material, one uniform set) */}
      <mesh
        geometry={geoms[0]}
        material={starMat}
        position={[END_X - (PANEL_SIDE_W / 2) * sy, cy, -(PANEL_CTR_W / 2 + (PANEL_SIDE_W / 2) * cz)]}
        rotation-y={-Math.PI / 2 + PANEL_YAW}
      />
      <mesh geometry={geoms[1]} material={starMat} position={[END_X, cy, 0]} rotation-y={-Math.PI / 2} />
      <mesh
        geometry={geoms[2]}
        material={starMat}
        position={[END_X - (PANEL_SIDE_W / 2) * sy, cy, PANEL_CTR_W / 2 + (PANEL_SIDE_W / 2) * cz]}
        rotation-y={-Math.PI / 2 - PANEL_YAW}
      />

      {/* four vertical mullion columns — at the pane seams + along the wings */}
      {([-1, 1] as const).map((s) => (
        <mesh key={`seam${s}`} position={[END_X - 0.05, cy, s * (PANEL_CTR_W / 2)]}>
          <boxGeometry args={[0.14, WALL_H, 0.12]} />
          <meshStandardMaterial color="#0a0b14" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      {([-1, 1] as const).map((s) => (
        <mesh
          key={`wing${s}`}
          rotation-y={-s * PANEL_YAW}
          position={[END_X - 0.05 - 2.0 * sy, cy, s * (PANEL_CTR_W / 2 + 2.0 * cz)]}
        >
          <boxGeometry args={[0.14, WALL_H, 0.12]} />
          <meshStandardMaterial color="#0a0b14" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}

      {/* low console row — dark box masses beneath the glass */}
      {CONSOLES.map((c, i) => (
        <mesh key={`con${i}`} position={[END_X - 1.35, c.h / 2, c.z]}>
          <boxGeometry args={[0.8, c.h, 1.04]} />
          <meshStandardMaterial color="#0c0d16" roughness={0.5} metalness={0.45} />
        </mesh>
      ))}
      {/* ledge strip — DIMMED from the old white rail so the nebula owns the frame */}
      <mesh position={[END_X - 0.95, 1.16, 0]}>
        <boxGeometry args={[0.5, 0.05, HALF_W * 2 - 1.2]} />
        <meshBasicMaterial color="#3d4c68" toneMapped={false} />
      </mesh>
      {/* pip strip across the console faces (opacity-pulsed) */}
      <mesh position={[END_X - 1.77, 0.92, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[5.3, 0.14]} />
        <meshBasicMaterial ref={pipMat} map={pipsTex} transparent toneMapped={false} depthWrite={false} />
      </mesh>

      {/* clickable comms kiosks — GitHub / LinkedIn uplinks flanking the
          canopy, plus the central HAIL console (the diegetic contact control:
          same mailto as the DOM email button). HAIL sits lower and a step
          nearer so its head stays under the canopy's nebula focal band. */}
      <SocialTerminal
        label="GITHUB"
        z={-2.15}
        yaw={0.24}
        phase={0}
        activate={() => window.open(SITE.socials[0].href, "_blank", "noopener,noreferrer")}
      />
      <SocialTerminal
        label="LINKEDIN"
        z={2.15}
        yaw={-0.24}
        phase={0.6}
        activate={() => window.open(SITE.socials[1].href, "_blank", "noopener,noreferrer")}
      />
      <SocialTerminal
        label="HAIL"
        z={0}
        yaw={0}
        phase={0.3}
        x={END_X - 3.2}
        baseHeadY={1.25}
        header="COMMS — DIRECT LINE"
        prompt="> SEND TRANSMISSION"
        // "_self" = location change → the mail client; also lets the verify
        // harness capture it through its window.open stub without navigating
        activate={() => window.open(`mailto:${SITE.email}`, "_self")}
      />
      </group>
    </group>
  );
}

/* ── ceiling light bars ─────────────────────────────────────────────────── */

const BAR_LEN = 3.2; // lit segment length
const BAR_GAP = 1.6; // dark gap between segments
const BAR_W = 0.26;

// approach beat: the hall lights dim as you near the bridge (progress ~0.86+)
// so the nebula owns the final frame. lerpColors writes in place — zero alloc.
const BAR_LIT = new THREE.Color("#c9d8f4");
const BAR_DIMMED = new THREE.Color("#232c42");

/** Segmented emissive ceiling bars — replaces the old single continuous strip
 *  (which read as one blinding line down the whole hall). The bar/gap rhythm
 *  gives the walk a cadence; one instanced plane = one draw call. */
function CeilingBars() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const xs = useMemo(() => {
    const out: number[] = [];
    const pitch = BAR_LEN + BAR_GAP;
    // stop short of the bridge so its window owns the final frame
    for (let x = WALL_START + BAR_LEN / 2; x + BAR_LEN / 2 < END_X - 2; x += pitch) out.push(x);
    return out;
  }, []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // face down
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    xs.forEach((x, i) => {
      p.set(x, WALL_H - 0.05, 0);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [xs]);
  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    const t = Math.min(1, Math.max(0, (scrollRefs.progress - 0.86) / 0.09));
    m.color.lerpColors(BAR_LIT, BAR_DIMMED, t * t * (3 - 2 * t));
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, xs.length]} frustumCulled={false}>
      <planeGeometry args={[BAR_LEN, BAR_W]} />
      <meshBasicMaterial ref={matRef} color="#c9d8f4" toneMapped={false} />
    </instancedMesh>
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
      for (let x = WALL_START + 2; x < WALL_END - 1; x += RIB_SPACING) {
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
      const endX = WALL_END - 0.4;
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
 * Corridor lighting + atmosphere: segmented ceiling light bars, low warm
 * fixtures (with warm floor washes + skirting as the counter-note to the cool
 * star spill), pilaster ribs + floor guide lines on the blank runs, and the
 * three-pane observation-bridge payoff at the end. Geometry shell is in
 * <KitShell/>.
 */
export default function Corridor() {
  return (
    <group>
      <CeilingBars />
      <WallRibs />
      <FloorWashes />
      <SkirtingStrips />

      {/* Dim guide lines along both floor–wall seams (wayfinding glow). Bright
          enough to read against the lit floor, still far below bloom threshold. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          rotation-x={-Math.PI / 2}
          position={[(WALL_START + WALL_END) / 2, 0.015, side * (HALF_W - 0.07)]}
        >
          <planeGeometry args={[WALL_END - WALL_START, 0.08]} />
          <meshBasicMaterial color="#3e4f82" toneMapped={false} />
        </mesh>
      ))}

      {/* Warm corridor lights — mounted LOW so they light floor/walls, not the roof */}
      {FIXTURES.map((x) => (
        <pointLight key={x} position={[x, 2.3, 0]} color="#fff0dc" intensity={10} distance={18} decay={2} />
      ))}

      <Bridge />
    </group>
  );
}
