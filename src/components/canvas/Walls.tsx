"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollRefs } from "@/lib/scrollStore";
import {
  HALF_W,
  WALL_H,
  ALCOVE_OPEN_W,
  ALCOVE_DEPTH,
  ROOMS,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
  focusAt,
  type Room,
} from "./hallConfig";
import { RoomScreen } from "./bayScreens";
import { InfoPanel, TimelinePanel, RoomLabel, BayPlaque } from "./bayPanels";
import { BayMat } from "./bayFloors";
import RoomProps from "./RoomProps";

/* ── the structural bay layer: alcove composition + threshold emitters + the
 *    shared bay light pool. The content renderers live in their own modules
 *    (finding 34): bayScreens (hero screens + CRT wiring), bayPanels (info /
 *    timeline / label / plaque), bayFloors (mats + painted deck art) and
 *    canvas2d (shared canvas-texture helpers). ── */

/* ── glowing accent frame around the bay opening ────────────────────────── */

function OpeningFrame({ accent }: { accent: string }) {
  const half = ALCOVE_OPEN_W / 2;
  return (
    <group>
      {[-half, half].map((x, i) => (
        <mesh key={i} position={[x, WALL_H / 2, 0.06]}>
          <boxGeometry args={[0.09, WALL_H, 0.09]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, WALL_H - 0.05, 0.06]}>
        <boxGeometry args={[half * 2, 0.09, 0.09]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── accent light spill at each bay threshold ─────────────────────────────
 * Colourist fix for "accent colours stop dead at the opening": an additive
 * gradient quad lying flat on the CORRIDOR floor, fading ~4 units into the
 * hall, plus two thin emissive jamb strips on the OUTER edges of the opening
 * frame that catch the eye obliquely from down the corridor. ONE shared
 * falloff texture + shared geometries at module level; only the two small
 * per-accent materials vary per bay. */

const SPILL_DEPTH = 4;

// Shared falloff: radial gradient anchored at the threshold edge. Canvas
// top-centre = UV (0.5, 1) = the plane's local +y, which the -PI/2 X-rotation
// maps to -z (the wall side) — so the bright end hugs the threshold and the
// glow dies out hall-side. Lazy singleton: module scope runs during SSR where
// `document` doesn't exist; Canvas children only execute client-side.
let spillTexture: THREE.CanvasTexture | null = null;
function getSpillTexture(): THREE.CanvasTexture {
  if (spillTexture) return spillTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 0, 0, 64, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  spillTexture = new THREE.CanvasTexture(canvas);
  return spillTexture;
}

const spillGeometry = /* @__PURE__ */ new THREE.PlaneGeometry(ALCOVE_OPEN_W, SPILL_DEPTH);
const jambGeometry = /* @__PURE__ */ new THREE.BoxGeometry(0.05, WALL_H, 0.16);

function AccentSpill({ accent }: { accent: string }) {
  // floor glow — additive so it reads as light on the deck, not a decal rug
  const spillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getSpillTexture(),
        color: accent,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [accent],
  );
  // jamb strips — genuine emitters, dimmed so bloom (threshold 0.5) stays tight
  const jambMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent).multiplyScalar(0.75),
        toneMapped: false,
      }),
    [accent],
  );
  const half = ALCOVE_OPEN_W / 2;
  return (
    <group>
      <mesh
        geometry={spillGeometry}
        material={spillMat}
        position={[0, 0.02, SPILL_DEPTH / 2]}
        rotation-x={-Math.PI / 2}
      />
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={jambGeometry}
          material={jambMat}
          position={[s * (half + 0.12), WALL_H / 2, 0.1]}
        />
      ))}
    </group>
  );
}

/* ── one alcove (recessed bay) — structure lives in KitShell; this is the
 *    content: hero screen (back), floating info (front), props, label, light ── */

/** Per-bay variation (keeps the cohesive grammar; only placement/scale/mood
 *  change) so adjacent + same-side rooms don't look identical. */
/** Intensities tuned down from 7-8: with decay 2 the old values pushed
 *  white-ish props (chairs, plants, kettlebells) past linear ~10 at prop
 *  distance and they clipped to flat #FFF (QA: blown-out bay props). */
const BAY_VARIANTS = [
  { lightBase: "#ffe2c4", lightLerp: 0.35, lightIntensity: 4.5, screenScale: 1.0, screenY: 1.95 },
  { lightBase: "#cfe4ff", lightLerp: 0.25, lightIntensity: 5, screenScale: 1.12, screenY: 1.85 },
  { lightBase: "#fff4e8", lightLerp: 0.45, lightIntensity: 4.5, screenScale: 0.92, screenY: 2.15 },
];

/* ── focused-bay light pool ────────────────────────────────────────────────
 * The bays used to mount 4 pointLights EACH — 36 lights that every lit
 * fragment in the scene iterated, every frame (three.js uploads ALL visible
 * lights as one uniform array; `distance` only bounds the falloff math, not
 * the loop). ONE fixed pool of 4 lights now serves whichever bay is focused:
 * a useFrame repositions/retints the pool to the focused room's recipe and
 * scales intensity by focusAt's ease, so the light fades in with the head-
 * turn and the retarget always happens while the pool is dark. Unfocused
 * bays go unlit — by design: behind fog + grazing angles only their emissive
 * dressing (opening frames, jambs, screens) reads from the corridor anyway.
 *
 * INVARIANT (three.js): the number of mounted lights must stay compile-time
 * constant. The renderer keys its shader-program cache on light COUNT, so
 * mounting/unmounting or .visible-toggling a light recompiles every lit
 * material mid-scroll (a visible hitch). Dim with intensity=0 instead, and
 * never put a light inside a visibility-gated group.
 */

const POOL_SLOTS = [
  // Local-space alcove positions + falloff, mirroring the old per-bay rig 1:1:
  // warm room light, screen accent, panel accent, neutral prop fill.
  { pos: [0, 2.2, -ALCOVE_DEPTH + 1.7], distance: ALCOVE_DEPTH + 5 },
  { pos: [-1.55, 1.95, -ALCOVE_DEPTH + 1.0], distance: 4.5 },
  { pos: [1.55, 1.8, -0.9], distance: 3.5 },
  { pos: [0, 1.5, -ALCOVE_DEPTH + 2.5], distance: 5.5 },
] as const;

const PROP_FILL_TINT = /* @__PURE__ */ new THREE.Color("#eef1f8");

type BayLightSpec = { pos: THREE.Vector3; color: THREE.Color; intensity: number };

/** Per-room 4-light recipes in WORLD space (the pool mounts at the scene root,
 *  not inside the mirrored/rotated alcove groups). Alcove groups sit at
 *  [room.x, 0, side*HALF_W] with rotY 0 (-z side) or PI (+z side); the PI turn
 *  mirrors local x AND z. */
const BAY_LIGHT_RECIPES: BayLightSpec[][] = ROOMS.map((room) => {
  const cfg = BAY_VARIANTS[room.variant];
  const warm = new THREE.Color(cfg.lightBase).lerp(new THREE.Color(room.accent), cfg.lightLerp);
  const accent = new THREE.Color(room.accent);
  const m = room.side < 0 ? 1 : -1;
  const world = ([lx, ly, lz]: readonly [number, number, number]) =>
    new THREE.Vector3(room.x + m * lx, ly, room.side * HALF_W + m * lz);
  const tints = [warm, accent, accent, PROP_FILL_TINT];
  const intensities = [cfg.lightIntensity, 4.5, 3, 5.5];
  return POOL_SLOTS.map((slot, i) => ({
    pos: world(slot.pos),
    color: tints[i],
    intensity: intensities[i],
  }));
});

function BayLightPool() {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const roomIdx = useRef(-1);
  useFrame(() => {
    const f = focusAt(scrollRefs.progress);
    const idx = f.room ? ROOMS.indexOf(f.room) : roomIdx.current;
    if (idx < 0) return; // before the first focus band: pool parked dark
    const recipe = BAY_LIGHT_RECIPES[idx];
    if (idx !== roomIdx.current) {
      // retarget while dark — ease is 0 whenever the focused room changes
      roomIdx.current = idx;
      recipe.forEach((spec, i) => {
        const l = lights.current[i];
        if (!l) return;
        l.position.copy(spec.pos);
        l.color.copy(spec.color);
      });
    }
    recipe.forEach((spec, i) => {
      const l = lights.current[i];
      if (l) l.intensity = spec.intensity * f.ease;
    });
  });
  return (
    <>
      {POOL_SLOTS.map((slot, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          intensity={0}
          distance={slot.distance}
          decay={2}
        />
      ))}
    </>
  );
}

/** Bay-content distance gate: past HIDE the recessed interior is invisible
 *  from the corridor (grazing angle + fog), so skip submitting its ~40-60
 *  draws. SHOW < HIDE gives hysteresis so the threshold never flickers. */
const BAY_HIDE_DIST = 40;
const BAY_SHOW_DIST = 37;

function Alcove({ room, animate, mobile = false }: { room: Room; animate: boolean; mobile?: boolean }) {
  const z = room.side < 0 ? -HALF_W : HALF_W;
  const rotY = room.side < 0 ? 0 : Math.PI;
  const v = room.variant;
  const cfg = BAY_VARIANTS[v];
  const isExp = room.kind === "experience";

  // Distance-gate the bay content (finding 3). The OpeningFrame/AccentSpill
  // emitters stay OUT of the gated group — they're the corridor-facing
  // wayfinding you can see from far down the hall — and the bay lights live
  // in <BayLightPool/> (lights must never be visibility-toggled: light-count
  // changes recompile every lit material). Mesh .visible toggling is safe.
  const contentRef = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = contentRef.current;
    if (!g) return;
    const d = Math.abs(camera.position.x - room.x);
    if (g.visible) {
      if (d > BAY_HIDE_DIST) g.visible = false;
    } else if (d < BAY_SHOW_DIST) {
      g.visible = true;
    }
  });

  return (
    <group position={[room.x, 0, z]} rotation-y={rotY}>
      <OpeningFrame accent={room.accent} />
      <AccentSpill accent={room.accent} />

      <group ref={contentRef}>

      {/* corner pillars — cover the seams where the corridor wall, niche side
          walls and back wall meet (tiled kit pieces don't form a clean corner).
          The back wall actually sits 0.3 (the wall-tile half-depth) beyond
          ALCOVE_DEPTH, so the rear pillars are pushed out to meet it exactly. */}
      {([
        [-ALCOVE_OPEN_W / 2, 0],
        [ALCOVE_OPEN_W / 2, 0],
        [-ALCOVE_OPEN_W / 2, -(ALCOVE_DEPTH + 0.3)],
        [ALCOVE_OPEN_W / 2, -(ALCOVE_DEPTH + 0.3)],
      ] as [number, number][]).map(([px, pz], i) => (
        <mesh key={i} position={[px, WALL_H / 2, pz]}>
          <boxGeometry args={[0.44, WALL_H, 0.44]} />
          <meshStandardMaterial color="#7b7b87" roughness={0.95} />
        </mesh>
      ))}

      {/* station plaque on the corridor wall beside the opening — SKIPPED when
          the spot falls inside the observation-gallery cut: there's no wall
          there, so the plaque floated over the glazing (QA: "(06) CAPABILITIES
          going into the window"). Room 5's bay starts flush at the gallery's
          far edge, so it has no clear wall strip on either side. */}
      {(() => {
        const plaqueX =
          room.side === 1
            ? room.x - (ALCOVE_OPEN_W / 2 + 0.55)
            : room.x + (ALCOVE_OPEN_W / 2 + 0.55);
        const overGallery =
          room.side === GALLERY_SIDE &&
          Math.abs(plaqueX - GALLERY_X) < GALLERY_SPAN / 2 + 0.6;
        return overGallery ? null : (
          <group position={[ALCOVE_OPEN_W / 2 + 0.55, 2.55, 0.07]}>
            <BayPlaque room={room} />
          </group>
        );
      })()}

      {/* DESKTOP: screen left + info panel right, side by side (landscape).
          MOBILE: stack them — screen high & centred, info panel centred below &
          facing straight out — so the wide panel fits a tall portrait frame
          instead of clipping off the right edge. */}
      {/* hero screen — mobile sizes assume the Rig's portrait step-in (camera
          ~1.9 from the opening): screen slightly bigger + higher into the dead
          band under the ceiling line. */}
      <group
        position={mobile ? [0, 3.2, -ALCOVE_DEPTH + 0.32] : [-1.55, cfg.screenY, -ALCOVE_DEPTH + 0.32]}
        scale={mobile ? cfg.screenScale * 0.9 : cfg.screenScale}
      >
        <RoomScreen room={room} animate={animate} />
      </group>

      {/* floating holographic info — in FRONT of the props so nothing occludes it.
          On mobile it's smaller and pushed DEEPER than the old squash-era spot:
          with the step-in camera a panel at z −0.3 filled the full frame width,
          colliding with the screen above and the hop chevrons at the right edge. */}
      <group
        position={mobile ? [0, 1.0, -0.85] : [1.55, isExp ? 1.95 : 1.78, -1.5]}
        rotation-y={mobile ? 0 : -0.3}
        scale={mobile ? 0.6 : 1}
      >
        {isExp ? <TimelinePanel room={room} /> : <InfoPanel room={room} />}
      </group>

      {/* holographic name label — centred at the top of the bay. Hidden on mobile
          where the vertical stack needs that height for the raised screen (the
          title already shows on the screen + info panel). */}
      {!mobile && (
        <group position={[0, 3.2, -0.9]}>
          <RoomLabel room={room} />
        </group>
      )}

      {/* flush accent mat (shape per app; Nuremi = map floor) */}
      <BayMat room={room} />

      {/* themed objects (kept low / to the sides) */}
      <group position={[0, 0, -ALCOVE_DEPTH + 1.55]}>
        <RoomProps theme={room.theme} accent={room.accent} animate={animate} />
      </group>
      </group>

      {/* bay lighting comes from the shared <BayLightPool/> — the old four
          per-bay pointLights (warm room / screen accent / panel accent / prop
          fill) live on as its per-room recipe (BAY_LIGHT_RECIPES). */}
    </group>
  );
}

export default function Walls({ animate = true, mobile = false }: { animate?: boolean; mobile?: boolean }) {
  return (
    <group>
      <BayLightPool />
      {ROOMS.map((room) => (
        <Alcove key={room.id} room={room} animate={animate} mobile={mobile} />
      ))}
    </group>
  );
}
