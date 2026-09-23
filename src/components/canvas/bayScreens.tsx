"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBox, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { EXPERIENCE, ACHIEVEMENTS, PROJECTS, type Project } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import { useIsMobile } from "@/lib/useIsMobile";
import { displayVertex, displayFragment, wallLightFragment } from "./shaders";
import { familyVar, hexA, roundRect, useTextTexture, wrapText } from "./canvas2d";
import { GLOW, INK, LIGHT_WHITE, MATERIALS, NEUTRAL, accentLightShare } from "./theme";
import type { Room } from "./hallConfig";

/* ── bay hero displays ───────────────────────────────────────────────────────
 * Every bay's back-wall hero is ONE fixture family — the ship's "exhibit
 * display" — hung flush ON the back wall and sized to fill the free wall
 * between the left prop column and the info card:
 *
 *   a static wall glow tinted by what's on screen (plus a faint bounce on the
 *     floor below) and a tight contact shadow, drawn from the fixture outline
 *   an anodised body with real depth, a metal rim + top-edge highlight,
 *     under one sheet of low-sheen black glass carrying 1–2 apertures
 *   a hairline accent underglow — the fixture's only accent emitter
 *   the apertures run displayFragment: flat glass, rounded corners, a
 *     highlight soft-knee (white UIs never bloom), static sheen, an eased
 *     dimmed crossfade and (mobile) a slow eased scroll through the screen.
 *
 * Every standard room hangs the SAME outline (see placement): app bays get a
 * DIPTYCH of two tall phone-proportioned panes — the live in-app screenshot
 * pinned on the left, and on the right the phone screens cropped out of the
 * App Store art (SCREEN_CROPS — no marketing headlines, white store
 * backgrounds or phone-inside-a-phone), crossfading every HOLD. Nuremi (no
 * screenshots yet) gets two painted screens of its own in the same diptych;
 * poster rooms one painted pane of the same outer size. On mobile the strip
 * of wall between the lintel and the info card is short, so the diptych's
 * panes are near-square and each scrolls slowly down its screen, staggered
 * half a cycle, as if someone were using it.
 *
 * Materials are built imperatively (new THREE.ShaderMaterial) and passed with
 * `material=` — R3F copies JSX `uniforms` into wrapper objects, which would
 * swallow the scheduler's `.value =` writes.
 *
 * Authoring units: RoomScreen measures the bay's screen group and undoes its
 * per-variant scale, so everything below is in WORLD units with z = 0 on the
 * back-wall face and x/y relative to the fixture's pane centre.
 * ──────────────────────────────────────────────────────────────────────── */

/** Walls places the screen group at -ALCOVE_DEPTH + 0.32; the back-wall face
 *  (KitShell / bayLighting BACK_Z) is at -(ALCOVE_DEPTH + 0.3): 0.62 behind. */
const WALL_GAP = 0.62;

// fixture anatomy (world units)
const RIM = 0.03; // visible anodised metal around the glass
const GLASS_M = 0.035; // black glass margin around the apertures
const BEZEL = RIM + GLASS_M;
const DEPTH = 0.12; // body thickness (its underside reads from the dwell camera)
const STANDOFF = 0.05; // shadow gap between the body and the wall
const FRONT = STANDOFF + DEPTH;
const PANE_GAP = 0.06; // glass mullion between diptych panes

/** Diptych pane aspect — the 0.46 phone screenshots, trimmed a hair by cover. */
const WALL_PANE_AR = 0.45;
/** Mobile diptych pane aspect: the lintel-to-card strip is short, so each
 *  pane shows the top of its screen at readable scale and scrolls down it. */
const MOBILE_PANE_AR = 0.9;

const HOLD = 7; // seconds a pane holds before it changes (well past MOTION.minLoop)
const FADE = 1.8; // eased crossfade
// mobile scroll-through: rest at the top, ease down the screen, rest, change
const PAN_REST = 3;
const PAN_RUN = 11;

/** Exposure: highlights roll off toward PEAK (below the 0.78 bloom threshold). */
const EXPOSE = { exposure: 0.92, knee: 0.34, peak: 0.62, target: 0.11 };

/** Phone-screen rects inside the App Store images (u0, v0, u1, v1; v from the
 *  top), measured off the 480×1039 art: inside the phone's rounded corners and
 *  below its dynamic island, so a pane shows the app — never a phone. Only
 *  upright, fully-visible phones are listed — tilted/panoramic store art is
 *  left out of the display. */
const SCREEN_CROPS: Record<string, [number, number, number, number]> = {
  "/images/projects/selfquest/gallery-3.jpg": [0.14, 0.25, 0.86, 0.935],
  "/images/projects/selfquest/gallery-4.jpg": [0.145, 0.25, 0.855, 0.935],
  "/images/projects/selfaware/gallery-3.jpg": [0.115, 0.272, 0.885, 1.0],
  "/images/projects/selfaware/gallery-4.jpg": [0.1, 0.0, 0.9, 0.725],
  "/images/projects/selfgrow/gallery-3.jpg": [0.175, 0.31, 0.815, 0.905],
  "/images/projects/selfgrow/gallery-4.jpg": [0.175, 0.31, 0.815, 0.905],
  "/images/projects/selfgrow/gallery-5.jpg": [0.175, 0.31, 0.815, 0.905],
};

/* ── deferred disposal ──────────────────────────────────────────────────────
 * React StrictMode (dev) runs effect cleanups once straight after mount, and
 * Scene's compile-before-reveal pass may still hold a pending compileAsync on
 * these materials — disposing them then throws inside three ("reading
 * isReady"). Cleanup only SCHEDULES disposal; a re-mount with the same object
 * cancels it, a real unmount disposes a few seconds later. */
type Disposable = { dispose: () => void };
const pendingDispose = new WeakMap<object, number>();
export function useDeferredDispose(list: readonly Disposable[]) {
  useEffect(() => {
    for (const o of list) {
      const t = pendingDispose.get(o);
      if (t !== undefined) {
        window.clearTimeout(t);
        pendingDispose.delete(o);
      }
    }
    return () => {
      for (const o of list) {
        pendingDispose.set(
          o,
          window.setTimeout(() => {
            pendingDispose.delete(o);
            o.dispose();
          }, 6000),
        );
      }
    };
  }, [list]);
}

type Slide = { tex: THREE.Texture; crop: THREE.Vector4 };
const FULL = new THREE.Vector4(0, 0, 1, 1);

/** v-from-top rect → texture-space offset/size (textures are flipY). */
function cropVec(r?: [number, number, number, number]) {
  if (!r) return FULL.clone();
  const [u0, v0, u1, v1] = r;
  return new THREE.Vector4(u0, 1 - v1, u1 - u0, v1 - v0);
}

/** Average (linear) colour of a slide's visible region — drives the wall glow
 *  so the light on the wall matches what the screen is showing. */
function averageColor(s: Slide, fallback: THREE.Color): THREE.Color {
  // canvas textures paint after mount (and are dark by design)
  if ((s.tex as THREE.CanvasTexture).isCanvasTexture) return new THREE.Color(0.05, 0.055, 0.07);
  try {
    const img = s.tex.image as CanvasImageSource & { width?: number; height?: number };
    if (!img || !img.width || !img.height) return fallback.clone();
    const c = document.createElement("canvas");
    c.width = c.height = 8;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const { x, y, z, w } = s.crop;
    ctx.drawImage(img, x * img.width, (1 - y - w) * img.height, z * img.width, w * img.height, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const n = d.length / 4;
    return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch {
    return fallback.clone();
  }
}

/** Cover-fit scale for a slide's (cropped) aspect into an aperture aspect. */
function coverFor(s: Slide, ar: number): THREE.Vector2 {
  const img = s.tex.image as { width?: number; height?: number } | undefined;
  const tar = img && img.width && img.height ? (img.width * s.crop.z) / (img.height * s.crop.w) : ar;
  return tar > ar ? new THREE.Vector2(ar / tar, 1) : new THREE.Vector2(1, tar / ar);
}

const ease = (k: number) => k * k * (3 - 2 * k);
const clamp01 = (k: number) => Math.min(Math.max(k, 0), 1);

/** Scroll position (+1 top … −1 bottom) `t` seconds into a slide. */
function panAt(t: number) {
  return 1 - 2 * ease(clamp01((t - PAN_REST) / PAN_RUN));
}
const PAN_SLIDE = PAN_REST * 2 + PAN_RUN;

/** Static wall-light quad (contact shadow, display glow or floor bounce). */
function WallLight({
  size,
  offset,
  box,
  fall,
  strength,
  color,
  mode,
  inner,
  position,
  rotationX = 0,
  order,
}: {
  size: [number, number];
  offset: [number, number];
  box: [number, number];
  fall: number;
  strength: number;
  color?: THREE.Color;
  mode: 0 | 1;
  inner: number;
  position: [number, number, number];
  rotationX?: number;
  order: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: displayVertex,
        fragmentShader: wallLightFragment,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: mode === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uSize: { value: new THREE.Vector2() },
          uOffset: { value: new THREE.Vector2() },
          uBox: { value: new THREE.Vector2() },
          uRadius: { value: 0.03 },
          uFall: { value: 0.5 },
          uStrength: { value: 0.5 },
          uColor: { value: new THREE.Color(1, 1, 1) },
          uMode: { value: mode },
          uInner: { value: 0 },
        },
      }),
    [mode],
  );
  useDeferredDispose(useMemo(() => [mat], [mat]));
  // keep uniforms in sync without re-minting the program
  const u = mat.uniforms;
  u.uSize.value.set(size[0], size[1]);
  u.uOffset.value.set(offset[0], offset[1]);
  u.uBox.value.set(box[0], box[1]);
  u.uFall.value = fall;
  u.uStrength.value = strength;
  u.uInner.value = inner;
  if (color) u.uColor.value.copy(color);
  return (
    <mesh position={position} rotation-x={rotationX} material={mat} renderOrder={order}>
      <planeGeometry args={size} />
    </mesh>
  );
}

/** What one aperture shows: the slides it cycles through (indices into the
 *  display's slides) and whether it scrolls through each one. */
type PaneSpec = {
  pool: number[];
  pan: boolean;
  /** start time (s); negative delays the pane so two never move in step */
  phase?: number;
};

type DisplayProps = {
  paneW: number;
  paneH: number;
  panes: PaneSpec[];
  slides: Slide[];
  accent: string;
  animate: boolean;
  /** bay floor height in the fixture's space (for the floor bounce) */
  floorY: number;
};

type PaneState = { cur: number; next: number; t: number; fading: boolean; fadeT: number };

const _wp = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

/** The shared exhibit-display fixture (see header). */
/* ── per-room trim ───────────────────────────────────────────────────────────
 * One fixture family, dressed for its room — the anatomy never changes, only
 * the trim: SelfQuest (a pixel-art RPG) gets stepped "pixel" corner inlays in
 * the wall around it; SelfGrow walnut side cheeks, like its planters; the
 * jewellery storefront and the trophy room a brass body. Everything else is
 * the ship's anodised steel. Colours: WARM family (brass, wood) + the accent. */
type Trim = "steel" | "pixel" | "wood" | "brass";
const TRIM_BY_THEME: Record<string, Trim> = { gym: "pixel", habit: "wood", jewellery: "brass", trophy: "brass" };
const TrimCtx = createContext<Trim>("steel");
const BRASS = "#a8844f";

/** Stepped L-brackets (5 "pixels" each) inlaid in the wall at the corners. */
function PixelCorners({ W, H, accent }: { W: number; H: number; accent: THREE.Color }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const px = 0.075;
  // dark anodised inlays (they must read against a brightly lit accent wall),
  // each with a faint accent face like an unlit pixel
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(NEUTRAL.hullShadow).lerp(accent, 0.08),
        emissive: accent.clone(),
        emissiveIntensity: 0.12,
        roughness: 0.42,
        metalness: 0.6,
      }),
    [accent],
  );
  useDeferredDispose(useMemo(() => [mat], [mat]));
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    let i = 0;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const cx = sx * (W / 2 + 0.06 + px / 2);
        const cy = sy * (H / 2 + 0.06 + px / 2);
        // corner, two along each edge, and one inner step: a pixel bracket
        const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 1]];
        for (const [a, b] of cells) {
          o.position.set(cx - sx * a * px, cy - sy * b * px, 0.015);
          o.updateMatrix();
          m.setMatrixAt(i++, o.matrix);
        }
      }
    m.instanceMatrix.needsUpdate = true;
  }, [W, H]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 24]} material={mat}>
      <boxGeometry args={[px * 0.86, px * 0.86, 0.03]} />
    </instancedMesh>
  );
}

function ExhibitDisplay({ paneW, paneH, panes, slides, accent, animate, floorY }: DisplayProps) {
  const trim = useContext(TrimCtx);
  const count = panes.length;
  const innerW = count * paneW + (count - 1) * PANE_GAP;
  const W = innerW + BEZEL * 2;
  const H = paneH + BEZEL * 2;
  const top = H / 2;
  const bottom = -H / 2;

  const accentCol = useMemo(() => new THREE.Color(accent), [accent]);
  const avgs = useMemo(() => slides.map((s) => averageColor(s, accentCol)), [slides, accentCol]);
  const covers = useMemo(() => slides.map((s) => coverFor(s, paneW / paneH)), [slides, paneW, paneH]);
  // adaptive exposure: bright art is pulled down so it sits in the dark bay
  // like a lit display, not a light box; dark UIs pass at full gain
  const gains = useMemo(
    () =>
      avgs.map((c) => {
        const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
        return Math.min(1, Math.max(0.42, EXPOSE.target / Math.max(l, 1e-3)));
      }),
    [avgs],
  );

  // one material per aperture, built imperatively so uniform writes land
  const mats = useMemo(
    () =>
      panes.map((spec) => {
        const si = spec.pool[0];
        const pan = spec.pan ? 1 : 0;
        return new THREE.ShaderMaterial({
          vertexShader: displayVertex,
          fragmentShader: displayFragment,
          toneMapped: false,
          uniforms: {
            uTexA: { value: slides[si].tex },
            uTexB: { value: slides[si].tex },
            uCoverA: { value: covers[si].clone() },
            uCoverB: { value: covers[si].clone() },
            uCropA: { value: slides[si].crop.clone() },
            uCropB: { value: slides[si].crop.clone() },
            uZoomA: { value: 1 },
            uZoomB: { value: 1 },
            uPanA: { value: new THREE.Vector2(0, pan) },
            uPanB: { value: new THREE.Vector2(0, pan) },
            uMix: { value: 0 },
            uDim: { value: 0 },
            uSize: { value: new THREE.Vector2(paneW, paneH) },
            uRadius: { value: Math.min(paneW, paneH) * 0.045 },
            uExposure: { value: EXPOSE.exposure },
            uExpA: { value: gains[si] },
            uExpB: { value: gains[si] },
            uKnee: { value: EXPOSE.knee },
            uPeak: { value: EXPOSE.peak },
            uGlass: { value: 0.028 },
            uSurround: { value: new THREE.Color("#07080c") },
          },
        });
      }),
    [panes, slides, covers, gains, paneW, paneH],
  );

  // wall glow colour: what's on screen, pulled a little toward the room
  // accent and then toward warm white — the display lights the wall like a
  // real screen (soft, mostly neutral), it never paints an accent slab behind
  // the picture. Normalised so the strength uniform alone sets brightness.
  const glowCol = useMemo(() => {
    const c = new THREE.Color(0, 0, 0);
    panes.forEach((p) => c.add(avgs[p.pool[0]]));
    c.multiplyScalar(1 / panes.length).lerp(accentCol, 0.3).lerp(new THREE.Color(LIGHT_WHITE), 0.45);
    const m = Math.max(c.r, c.g, c.b, 1e-3);
    return c.multiplyScalar(1 / m);
  }, [panes, avgs, accentCol]);
  const glowK = accentLightShare(accentCol);

  const bodyMat = useMemo(
    () =>
      trim === "brass"
        ? new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.34, metalness: 0.85 })
        : new THREE.MeshStandardMaterial({ color: NEUTRAL.hullLight, roughness: 0.32, metalness: 0.75 }),
    [trim],
  );
  const woodMat = useMemo(() => (trim === "wood" ? MATERIALS.wood() : null), [trim]);
  // low-metal, satin black glass: bay lights no longer smear across it
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0a0c12", roughness: 0.4, metalness: 0.15 }),
    [],
  );
  // the top edge catching the ceiling panel — a lit chamfer line (under bloom)
  const edgeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(NEUTRAL.steelLight).multiplyScalar(0.42),
        toneMapped: false,
      }),
    [],
  );
  const trimMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: accentCol.clone().multiplyScalar(GLOW.trim), toneMapped: false }),
    [accentCol],
  );
  useDeferredDispose(
    useMemo(
      () => [...mats, bodyMat, glassMat, edgeMat, trimMat, ...(woodMat ? [woodMat] : [])],
      [mats, bodyMat, glassMat, edgeMat, trimMat, woodMat],
    ),
  );

  /* pane scheduler. A cycling pane holds, then crossfades (eased, under a soft
     dim) to the next slide in its pool; a scrolling pane rests at the top of
     its slide, eases down it, rests, then changes (or eases back up when it
     has one slide). Time only advances while the display is on screen, so a
     visitor always arrives at a fresh hold. */
  const state = useRef<PaneState[]>([]);
  useLayoutEffect(() => {
    state.current = panes.map((p) => ({ cur: 0, next: 0, t: p.phase ?? 0, fading: false, fadeT: 0 }));
  }, [panes, mats]);

  const root = useRef<THREE.Group>(null);
  useFrame(({ camera }, rawDt) => {
    if (!animate) return;
    const g = root.current;
    if (!g) return;
    g.getWorldPosition(_wp);
    if (camera.position.distanceTo(_wp) > 18) return;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    if (!_frustum.containsPoint(_wp)) return;
    const dt = Math.min(rawDt, 1 / 30);
    panes.forEach((spec, i) => {
      const s = state.current[i];
      const u = mats[i].uniforms;
      if (!s) return;
      const n = spec.pool.length;
      if (n <= 1 && !spec.pan) return;
      s.t += dt;
      if (spec.pan) {
        if (n <= 1) {
          // one slide: ease down, rest, ease back up
          const k = Math.max(s.t, 0) % (PAN_SLIDE * 2);
          u.uPanA.value.y = k < PAN_SLIDE ? panAt(k) : -panAt(k - PAN_SLIDE);
          return;
        }
        if (!s.fading) u.uPanA.value.y = panAt(s.t);
      }
      const due = spec.pan ? PAN_SLIDE : HOLD;
      if (!s.fading && s.t >= due) {
        s.next = (s.cur + 1) % n;
        const si = spec.pool[s.next];
        s.fading = true;
        s.fadeT = 0;
        u.uTexB.value = slides[si].tex;
        u.uCoverB.value.copy(covers[si]);
        u.uCropB.value.copy(slides[si].crop);
        u.uExpB.value = gains[si];
        u.uPanB.value.y = spec.pan ? 1 : 0;
      }
      if (s.fading) {
        s.fadeT += dt;
        const k = s.fadeT / FADE;
        if (k >= 1) {
          s.cur = s.next;
          s.fading = false;
          s.t = 0;
          const si = spec.pool[s.cur];
          u.uTexA.value = slides[si].tex;
          u.uCoverA.value.copy(covers[si]);
          u.uCropA.value.copy(slides[si].crop);
          u.uExpA.value = gains[si];
          u.uPanA.value.y = spec.pan ? 1 : 0;
          u.uMix.value = 0;
          u.uDim.value = 0;
        } else {
          // the two images overlap only through the middle of the fade, under
          // a soft dim, so there's no ghosted double exposure
          u.uMix.value = ease(clamp01((k - 0.15) / 0.7));
          u.uDim.value = 0.2 * Math.sin(Math.PI * k);
        }
      }
    });
  });

  const paneX = (i: number) => -innerW / 2 + paneW / 2 + i * (paneW + PANE_GAP);
  const bounceD = 1.1;

  return (
    <group ref={root}>
      {/* on the wall: tight contact shadow + the light the screen throws */}
      <WallLight
        mode={0}
        inner={0}
        order={-2}
        position={[0, 0, 0.012]}
        size={[W + 0.6, H + 0.6]}
        offset={[0, 0.045]}
        box={[W / 2, H / 2]}
        fall={0.07}
        strength={0.8}
      />
      <WallLight
        mode={1}
        inner={0.1}
        order={-1}
        position={[0, 0, 0.016]}
        size={[W + 3.4, H + 2.6]}
        offset={[0, 0]}
        box={[W / 2, H / 2]}
        fall={0.62}
        strength={0.3 * glowK}
        color={glowCol}
      />
      {/* the same light, faintly, on the floor below */}
      <WallLight
        mode={1}
        inner={0}
        order={-1}
        position={[0, floorY + 0.006, bounceD / 2]}
        rotationX={-Math.PI / 2}
        size={[W + 1.6, bounceD]}
        offset={[0, bounceD / 2]}
        box={[W / 2, 0.001]}
        fall={0.34}
        strength={0.12 * glowK}
        color={glowCol}
      />
      {/* anodised body */}
      <RoundedBox
        args={[W, H, DEPTH]}
        radius={0.024}
        smoothness={3}
        position={[0, 0, STANDOFF + DEPTH / 2]}
        material={bodyMat}
      />
      {/* top-edge highlight (the chamfer catching the ceiling light) */}
      <mesh position={[0, top - 0.006, FRONT + 0.0006]} material={edgeMat}>
        <planeGeometry args={[W - 0.07, 0.006]} />
      </mesh>
      {/* one sheet of black glass — leaves the metal rim showing */}
      <mesh position={[0, 0, FRONT + 0.0005]} material={glassMat}>
        <planeGeometry args={[W - RIM * 2, H - RIM * 2]} />
      </mesh>
      {/* the apertures */}
      {mats.map((m, i) => (
        <mesh key={i} position={[paneX(i), 0, FRONT + 0.0015]} material={m}>
          <planeGeometry args={[paneW, paneH]} />
        </mesh>
      ))}
      {/* per-room trim */}
      {trim === "pixel" && <PixelCorners W={W} H={H} accent={accentCol} />}
      {woodMat &&
        [-1, 1].map((sx) => (
          <RoundedBox
            key={sx}
            args={[0.075, H + 0.1, DEPTH + 0.04]}
            radius={0.012}
            smoothness={2}
            position={[sx * (W / 2 + 0.0375), 0, STANDOFF - 0.02 + (DEPTH + 0.04) / 2]}
            material={woodMat}
          />
        ))}
      {/* hairline accent underglow on the underside — the only accent emitter */}
      <mesh position={[0, bottom - 0.004, STANDOFF + DEPTH / 2]} material={trimMat}>
        <boxGeometry args={[W * 0.56, 0.008, DEPTH * 0.6]} />
      </mesh>
    </group>
  );
}

/* ── live app display ── */

function AppWall({
  project,
  animate,
  mobile,
  paneH,
  floorY,
  accent,
}: {
  project: Project;
  animate: boolean;
  mobile: boolean;
  paneH: number;
  floorY: number;
  accent: string;
}) {
  const paths = useMemo(
    () => [project.image as string, ...(project.gallery ?? []).filter((g) => SCREEN_CROPS[g])],
    [project],
  );
  const urls = useMemo(() => paths.map(withBase), [paths]);
  const loaded = useTexture(urls);
  const slides = useMemo(() => {
    const arr = Array.isArray(loaded) ? loaded : [loaded];
    return arr.map((t, i) => {
      t.colorSpace = THREE.SRGBColorSpace; // displayFragment expects linear samples
      t.anisotropy = mobile ? 4 : 16;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      return { tex: t, crop: cropVec(SCREEN_CROPS[paths[i]]) };
    });
  }, [loaded, mobile, paths]);
  const n = slides.length;
  const panes = useMemo<PaneSpec[]>(() => {
    const all = Array.from({ length: n }, (_, i) => i);
    // the live in-app screenshot is pinned in the first pane; the store
    // screens rotate in the second. Mobile panes are shorter, so both scroll
    // slowly down their screen — the second half a cycle behind the first.
    if (n === 1) return [{ pool: [0], pan: mobile }];
    return [
      { pool: [0], pan: mobile },
      { pool: all.slice(1), pan: mobile, phase: mobile ? -PAN_SLIDE / 2 : 0 },
    ];
  }, [n, mobile]);
  return (
    <ExhibitDisplay
      paneW={paneH * (mobile ? MOBILE_PANE_AR : WALL_PANE_AR)}
      paneH={paneH}
      panes={panes}
      slides={slides}
      accent={accent}
      animate={animate}
      floorY={floorY}
    />
  );
}

/* ── painted exhibits (canvas) — design-system slab language ─────────────────
 * Sized for the dwell camera. The standard fixture is ≈ 245 CSS px wide at
 * 1440×900, so a 1024-wide poster canvas lands at ≈ 0.24 px per canvas px:
 * body type is ≥ 48 canvas px (≈ 12 px on screen) and headlines 90+. Each
 * painter scales its type by `u` (canvas width / its design width) so the
 * mobile landscape variant keeps the same proportions.
 * ──────────────────────────────────────────────────────────────────────── */

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const DIM = (a: number) => `rgba(244,241,234,${a})`;

function paintBase(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, gx = 0.8, gy = 0.1) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1a1e2a");
  bg.addColorStop(1, "#0f121a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * gx, h * gy, 0, w * gx, h * gy, Math.max(w, h) * 0.8);
  glow.addColorStop(0, hexA(accent, 0.22));
  glow.addColorStop(1, hexA(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/** Word-wrap into lines (for sizing a bubble before drawing it). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

/** iOS-style status bar + dynamic island across the top of a phone screen. */
function phoneChrome(ctx: CanvasRenderingContext2D, w: number, h: number, sans: string) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DIM(0.85);
  ctx.font = `600 30px ${sans}`;
  ctx.fillText("9:41", 44, 62);
  ctx.fillStyle = "#05060a";
  roundRect(ctx, w / 2 - 70, 24, 140, 42, 21);
  ctx.fill();
  ctx.fillStyle = DIM(0.85);
  for (let i = 0; i < 4; i++) ctx.fillRect(w - 138 + i * 10, 56 - (i + 1) * 6, 7, (i + 1) * 6);
  ctx.strokeStyle = DIM(0.85);
  ctx.lineWidth = 2.5;
  roundRect(ctx, w - 88, 34, 46, 23, 6);
  ctx.stroke();
  ctx.fillRect(w - 84, 38, 32, 15);
  // home indicator
  roundRect(ctx, w / 2 - 74, h - 34, 148, 9, 4.5);
  ctx.fill();
}

function drawPin(ctx: CanvasRenderingContext2D, px: number, py: number, r: number, col: string, hole?: string) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(px, py - r * 1.6, r, Math.PI * 0.85, Math.PI * 0.15);
  ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  if (hole) {
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(px, py - r * 1.6, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A stylised street map filling (x, y, w, h): park, river, blocks, streets. */
function paintMap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, acc: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#161a25";
  ctx.fillRect(x, y, w, h);
  // city blocks
  ctx.fillStyle = "rgba(244,241,234,0.035)";
  const bw = w / 4;
  const bh = h / 6;
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 4; c++) {
      roundRect(ctx, x + c * bw + 10, y + r * bh + 10, bw - 20, bh - 20, 8);
      ctx.fill();
    }
  // park + river
  ctx.fillStyle = hexA(acc, 0.12);
  ctx.beginPath();
  ctx.ellipse(x + w * 0.8, y + h * 0.2, w * 0.24, h * 0.1, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,150,210,0.24)";
  ctx.lineWidth = Math.max(w, h) * 0.05;
  ctx.beginPath();
  ctx.moveTo(x - 20, y + h * 0.8);
  ctx.bezierCurveTo(x + w * 0.3, y + h * 0.7, x + w * 0.6, y + h * 0.95, x + w + 20, y + h * 0.84);
  ctx.stroke();
  // streets: two arterials each way + the minor grid
  ctx.strokeStyle = "rgba(244,241,234,0.07)";
  ctx.lineWidth = 6;
  for (let r = 1; r < 6; r++) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * bh);
    ctx.lineTo(x + w, y + r * bh);
    ctx.stroke();
  }
  for (let c = 1; c < 4; c++) {
    ctx.beginPath();
    ctx.moveTo(x + c * bw, y);
    ctx.lineTo(x + c * bw, y + h);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(244,241,234,0.16)";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.36);
  ctx.lineTo(x + w, y + h * 0.28);
  ctx.moveTo(x + w * 0.34, y);
  ctx.lineTo(x + w * 0.42, y + h);
  ctx.stroke();
  ctx.restore();
}

/** Nuremi (no screenshots yet) — the concierge drawn as two of its own app
 *  screens, side by side in ONE canvas (each pane crops its half): the ask
 *  and the answer, then the pinned map with its route. */
function nuremiPainter(project: Project): Painter {
  return (ctx, W, h) => {
    const w = W / 2;
    const ser = familyVar("--ff-display", "Georgia, serif");
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const sans = familyVar("--ff-body", "system-ui, sans-serif");
    const acc = project.accent;
    const L = 36;

    // ── screen 1: the conversation ──
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    paintBase(ctx, w, h, acc, 0.9, 0.0);
    phoneChrome(ctx, w, h, sans);
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `700 72px ${ser}`;
    ctx.fillText(project.title, L, 172);
    const tw = ctx.measureText(project.title).width;
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(L + tw + 14, 162, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DIM(0.55);
    ctx.font = `500 26px ${mono}`;
    ctx.fillText("AI CONCIERGE", L, 216);
    ctx.fillStyle = DIM(0.1);
    ctx.fillRect(L, 246, w - L * 2, 2);

    // the ask (right)
    let y = 286;
    ctx.font = `500 38px ${sans}`;
    const bx = 92;
    const ask = wrapLines(ctx, "Find me a quiet café for a meeting", w - L - bx - 56);
    const ah = ask.length * 48 + 42;
    roundRect(ctx, bx, y, w - L - bx, ah, 30);
    ctx.fillStyle = hexA(acc, 0.88);
    ctx.fill();
    ctx.fillStyle = INK;
    ask.forEach((t, i) => ctx.fillText(t, bx + 28, y + 60 + i * 48));
    y += ah + 24;
    // the answer (left)
    const ans = wrapLines(ctx, "Found one nearby — pinned on your map.", w - L - 76 - 56);
    const nh = ans.length * 48 + 42;
    roundRect(ctx, L, y, w - L - 76, nh, 30);
    ctx.fillStyle = DIM(0.1);
    ctx.fill();
    ctx.fillStyle = DIM(0.92);
    ans.forEach((t, i) => ctx.fillText(t, L + 28, y + 60 + i * 48));
    y += nh + 28;
    // the result card, with its map thumbnail
    const ch = 176;
    roundRect(ctx, L, y, w - L * 2, ch, 26);
    ctx.fillStyle = DIM(0.06);
    ctx.fill();
    ctx.strokeStyle = hexA(acc, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    roundRect(ctx, L + 18, y + 18, ch - 36, ch - 36, 18);
    ctx.clip();
    paintMap(ctx, L + 18, y + 18, ch - 36, ch - 36, acc);
    drawPin(ctx, L + ch / 2, y + ch / 2 + 22, 18, acc, "#161a25");
    ctx.restore();
    const tx = L + ch + 4;
    ctx.fillStyle = INK;
    ctx.font = `600 40px ${sans}`;
    ctx.fillText("Quiet café", tx, y + 74);
    ctx.fillStyle = acc;
    ctx.font = `600 26px ${mono}`;
    ctx.fillText("PINNED", tx, y + 118);
    ctx.fillStyle = DIM(0.6);
    ctx.font = `400 28px ${sans}`;
    ctx.fillText("Near you", tx, y + 152);

    // input bar
    const iy = h - 150;
    roundRect(ctx, L, iy, w - L * 2, 84, 42);
    ctx.fillStyle = DIM(0.08);
    ctx.fill();
    ctx.fillStyle = DIM(0.5);
    ctx.font = `400 34px ${sans}`;
    ctx.fillText(`Ask ${project.title}…`, L + 32, iy + 54);
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(w - L - 42, iy + 42, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── screen 2: the map ──
    ctx.save();
    ctx.translate(w, 0);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const sheetY = h - 340;
    paintMap(ctx, 0, 0, w, sheetY + 40, acc);
    // the route: you → the pin
    const you = { x: w * 0.26, y: sheetY - 110 };
    const pin = { x: w * 0.66, y: h * 0.36 };
    ctx.strokeStyle = DIM(0.9);
    ctx.lineWidth = 7;
    ctx.setLineDash([16, 13]);
    ctx.beginPath();
    ctx.moveTo(you.x, you.y);
    ctx.bezierCurveTo(you.x + 30, you.y - 150, pin.x - 150, pin.y + 110, pin.x, pin.y + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hexA("#7aa7ff", 0.25);
    ctx.beginPath();
    ctx.arc(you.x, you.y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7aa7ff";
    ctx.beginPath();
    ctx.arc(you.x, you.y, 13, 0, Math.PI * 2);
    ctx.fill();
    drawPin(ctx, w * 0.2, h * 0.3, 15, DIM(0.4));
    drawPin(ctx, w * 0.84, h * 0.5, 15, DIM(0.4));
    drawPin(ctx, pin.x, pin.y + 6, 34, acc, "#161a25");
    // search pill
    roundRect(ctx, L, 100, w - L * 2, 80, 40);
    ctx.fillStyle = "rgba(24,27,38,0.94)";
    ctx.fill();
    ctx.strokeStyle = DIM(0.14);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(L + 42, 140, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `500 34px ${sans}`;
    ctx.fillText("quiet café", L + 70, 152);
    // bottom sheet
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 30;
    roundRect(ctx, 0, sheetY, w, h - sheetY + 50, 40);
    ctx.fillStyle = "#1c202c";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = DIM(0.25);
    roundRect(ctx, w / 2 - 36, sheetY + 18, 72, 8, 4);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 60px ${ser}`;
    ctx.fillText("Quiet café", L, sheetY + 110);
    ctx.fillStyle = acc;
    ctx.font = `600 26px ${mono}`;
    ctx.fillText("PINNED · ROUTE READY", L, sheetY + 156);
    roundRect(ctx, L, sheetY + 190, w - L * 2, 88, 44);
    ctx.fillStyle = hexA(acc, 0.92);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `600 36px ${sans}`;
    ctx.textAlign = "center";
    ctx.fillText("Directions", w / 2, sheetY + 246);
    ctx.textAlign = "left";
    phoneChrome(ctx, w, h, sans);
    ctx.restore();
  };
}

/** Experience — the career as a Gantt, read left → right 2021 → now: one bar
 *  per role from EXPERIENCE dates, so the overlaps (Self Platform running
 *  alongside Nuremi, then Allied) read at a glance. The room's plaques and
 *  timeline card carry the list; this shows the shape. */
function experiencePainter(accent: string): Painter {
  return (ctx, w, h) => {
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const sans = familyVar("--ff-body", "system-ui, sans-serif");
    const u = Math.min(w, h * 1.1) / 1024;
    paintBase(ctx, w, h, accent, 0.9, 0.0);
    const NOW = 2026.72; // Sept 2026 — the "Now" end of open roles
    const Y0 = 2021;
    const Y1 = 2027;
    const L = 60 * u;
    const R = w - 60 * u;
    const X = (yr: number) => L + ((yr - Y0) / (Y1 - Y0)) * (R - L);
    ctx.textBaseline = "alphabetic";

    // header
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = `600 ${50 * u}px ${mono}`;
    ctx.fillText("CAREER", L, 96 * u);
    ctx.textAlign = "right";
    ctx.fillStyle = DIM(0.62);
    ctx.fillText("2021 — NOW", R, 96 * u);
    ctx.fillStyle = DIM(0.12);
    ctx.fillRect(L, 124 * u, R - L, 2);

    // year grid
    const gy0 = 150 * u;
    const gy1 = h - 110 * u;
    ctx.textAlign = "center";
    ctx.font = `500 ${44 * u}px ${mono}`;
    for (let yr = Y0; yr <= Y1 - 1; yr++) {
      const x = X(yr);
      ctx.fillStyle = DIM(0.09);
      ctx.fillRect(x - 1, gy0, 2, gy1 - gy0);
      ctx.fillStyle = DIM(0.55);
      ctx.fillText(`’${String(yr).slice(2)}`, x + (X(yr + 1) - x) / 2, h - 44 * u);
    }
    ctx.fillStyle = DIM(0.09);
    ctx.fillRect(X(Y1) - 1, gy0, 2, gy1 - gy0);

    // bars, oldest at the top so the career steps down to the right
    const rows = EXPERIENCE.map((e) => {
      const [a, b] = e.dates.split("—").map((s) => s.trim());
      const start = parseInt(a, 10);
      const open = /now/i.test(b);
      const end = open ? NOW : parseInt(b, 10);
      const name = /accelerator/i.test(e.org) ? e.role : e.org.split(" · ")[0];
      return { start, end, open, name };
    }).sort((p, q) => p.start - q.start || p.end - q.end);
    const rowH = (gy1 - gy0 - 16 * u) / rows.length;
    rows.forEach((r, i) => {
      const y = gy0 + 8 * u + i * rowH;
      const bx = X(r.start);
      const bw = Math.max(X(r.end) - bx, 26 * u);
      const barH = Math.min(rowH * 0.22, 30 * u);
      const barY = y + rowH * 0.64;
      roundRect(ctx, bx + 3, barY, bw - 6, barH, barH / 2);
      ctx.fillStyle = r.open ? hexA(accent, 0.95) : DIM(0.34);
      ctx.fill();
      // label above its bar; right-aligned where the bar sits at the far end
      ctx.font = `600 ${52 * u}px ${sans}`;
      const tw = ctx.measureText(r.name).width;
      const right = bx + tw > R;
      ctx.textAlign = right ? "right" : "left";
      ctx.fillStyle = r.open ? INK : DIM(0.84);
      ctx.fillText(r.name, right ? bx + bw - 3 : bx + 3, barY - rowH * 0.12);
    });

    // "now" rule
    ctx.fillStyle = hexA(accent, 0.7);
    ctx.fillRect(X(NOW) - 2, gy0 - 8 * u, 4, gy1 - gy0 + 8 * u);
  };
}

/** Milestones — the TechTudo feature as a press card (SelfQuest, the app it
 *  covered, per the dossier) with the ethos as the pull quote. Everything is
 *  typeset from constants; nothing is quoted that isn't there. */
function milestonesPainter(accent: string): Painter {
  return (ctx, w, h) => {
    const ser = familyVar("--ff-display", "Georgia, serif");
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    paintBase(ctx, w, h, accent, 0.85, 0.2);
    const [feat, outlet = ""] = ACHIEVEMENTS[2].split(" — ");
    const app = PROJECTS[0];
    ctx.textBaseline = "alphabetic";

    // the press card
    const cx = 44, cy = 44, cw = 620, ch = h - 88;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    roundRect(ctx, cx, cy, cw, ch, 14);
    ctx.fillStyle = "#222733";
    ctx.fill();
    ctx.restore();
    roundRect(ctx, cx, cy, cw, ch, 14);
    ctx.strokeStyle = DIM(0.14);
    ctx.lineWidth = 2;
    ctx.stroke();
    const px = cx + 44;
    const pw = cw - 88;
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = `600 46px ${mono}`;
    ctx.fillText(`${feat.toUpperCase()} IN`, px, cy + 96);
    ctx.fillStyle = INK;
    let fs = 150;
    ctx.font = `700 ${fs}px ${ser}`;
    while (ctx.measureText(outlet).width > pw && fs > 80) {
      fs -= 4;
      ctx.font = `700 ${fs}px ${ser}`;
    }
    ctx.fillText(outlet, px - 4, cy + 96 + fs * 0.98);
    // double rule
    const ry = cy + 96 + fs * 0.98 + 40;
    ctx.fillStyle = DIM(0.5);
    ctx.fillRect(px, ry, pw, 4);
    ctx.fillRect(px, ry + 12, pw, 2);
    // the app it covered + the numbers behind it
    ctx.fillStyle = INK;
    ctx.font = `700 68px ${ser}`;
    ctx.fillText(app.title, px, ry + 104);
    ctx.fillStyle = DIM(0.7);
    ctx.font = `500 42px ${mono}`;
    ctx.fillText(app.category.toUpperCase(), px, ry + 162);
    const stats = ACHIEVEMENTS.slice(0, 2).map((s) => {
      const [v, ...rest] = s.split(" ");
      return [v, rest.join(" ")] as const;
    });
    const sy = cy + ch - 56;
    stats.forEach(([v, l], i) => {
      const sx = px + i * (pw / 2);
      ctx.fillStyle = accent;
      ctx.font = `700 84px ${ser}`;
      ctx.fillText(v, sx, sy - 50);
      ctx.fillStyle = DIM(0.66);
      ctx.font = `500 36px ${mono}`;
      ctx.fillText(l.toUpperCase().replace("DAILY ACTIVE USERS", "DAILY USERS"), sx, sy);
    });

    // pull quote
    const qx = cx + cw + 52;
    const qw = w - qx - 44;
    ctx.fillStyle = hexA(accent, 0.9);
    ctx.font = `700 150px ${ser}`;
    ctx.fillText("“", qx - 6, 206);
    ctx.fillStyle = INK;
    ctx.font = `italic 400 66px ${ser}`;
    const quote = ACHIEVEMENTS[4].replace(" · ", ", ");
    const end = wrapText(ctx, quote.charAt(0).toUpperCase() + quote.slice(1) + ".", qx, 272, qw, 78);
    ctx.fillStyle = DIM(0.58);
    ctx.font = `500 36px ${mono}`;
    ctx.fillText("— THE ETHOS", qx, end + 44);
  };
}

/** A faceted gem in line (the Xuabelle motif). */
function gem(ctx: CanvasRenderingContext2D, dx: number, dy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(dx - r, dy - r * 0.35);
  ctx.lineTo(dx - r * 0.5, dy - r);
  ctx.lineTo(dx + r * 0.5, dy - r);
  ctx.lineTo(dx + r, dy - r * 0.35);
  ctx.lineTo(dx, dy + r);
  ctx.closePath();
  ctx.moveTo(dx - r, dy - r * 0.35);
  ctx.lineTo(dx + r, dy - r * 0.35);
  ctx.moveTo(dx - r * 0.5, dy - r);
  ctx.lineTo(dx - r * 0.2, dy - r * 0.35);
  ctx.lineTo(dx, dy + r);
  ctx.moveTo(dx + r * 0.5, dy - r);
  ctx.lineTo(dx + r * 0.2, dy - r * 0.35);
  ctx.lineTo(dx, dy + r);
  ctx.moveTo(dx - r * 0.2, dy - r * 0.35);
  ctx.lineTo(dx, dy - r);
  ctx.lineTo(dx + r * 0.2, dy - r * 0.35);
  ctx.stroke();
}

/** Web app (Xuabelle) — an editorial storefront in a browser window, laid out
 *  to fill whatever pane it's painted for (tall desktop, wide mobile). */
function browserPainter(project: Project): Painter {
  return (ctx, w, h) => {
    const ser = familyVar("--ff-display", "Georgia, serif");
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const acc = project.accent;
    const tall = h > w * 0.85;
    const u = w / (tall ? 1024 : 1120);
    const M = 52 * u;
    // browser chrome
    const bar = (tall ? 86 : 76) * u;
    ctx.fillStyle = "#15171f";
    ctx.fillRect(0, 0, w, bar);
    ["#ff5f56", "#ffbd2e", "#27c93f"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(38 * u + i * 34 * u, bar * 0.5, 10 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = "#0d0e14";
    roundRect(ctx, 170 * u, bar * 0.2, w - 340 * u, bar * 0.6, bar * 0.3);
    ctx.fill();
    ctx.fillStyle = DIM(0.6);
    ctx.font = `500 ${28 * u}px ${mono}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText((project.href || "").replace(/^https?:\/\//, "").replace(/\/$/, ""), w / 2, bar * 0.52);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    // page
    ctx.fillStyle = "#14111a";
    ctx.fillRect(0, bar, w, h - bar);
    const g = ctx.createRadialGradient(w * 0.85, bar, 0, w * 0.85, bar, w * 0.8);
    g.addColorStop(0, hexA(acc, 0.22));
    g.addColorStop(1, hexA(acc, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, bar, w, h - bar);
    // nav
    ctx.fillStyle = INK;
    ctx.font = `700 ${42 * u}px ${ser}`;
    ctx.fillText(project.title.toUpperCase(), M, bar + 74 * u);
    ctx.fillStyle = DIM(0.55);
    ctx.font = `500 ${26 * u}px ${mono}`;
    ctx.textAlign = "right";
    ctx.fillText("SHOP    JOURNAL", w - M, bar + 70 * u);
    ctx.textAlign = "left";
    ctx.fillStyle = DIM(0.12);
    ctx.fillRect(M, bar + 106 * u, w - M * 2, 2);
    // hero copy
    ctx.fillStyle = acc;
    ctx.font = `500 ${30 * u}px ${mono}`;
    ctx.fillText(`${project.category.toUpperCase()} — ${project.year}`, M, bar + 176 * u);
    const hs = (tall ? 106 : 80) * u;
    ctx.fillStyle = INK;
    ctx.font = `700 ${hs}px ${ser}`;
    ctx.fillText("Fine jewellery,", M - 4, bar + 176 * u + hs * 1.12);
    ctx.fillStyle = DIM(0.8);
    ctx.font = `italic 400 ${hs}px ${ser}`;
    ctx.fillText("quietly radiant.", M - 4, bar + 176 * u + hs * 2.14);
    const heroEnd = bar + 176 * u + hs * 2.14 + 44 * u;

    const cards = ["SÉRAPHINE", "AURELIA", "ODESSA"];
    const gap = 22 * u;
    const cw = (w - M * 2 - gap * 2) / 3;
    const card = (x: number, y: number, cw: number, chh: number, name: string, r: number, big: boolean) => {
      roundRect(ctx, x, y, cw, chh, 16 * u);
      ctx.fillStyle = DIM(0.045);
      ctx.fill();
      ctx.strokeStyle = DIM(0.13);
      ctx.lineWidth = 2;
      ctx.stroke();
      const gl = ctx.createRadialGradient(x + cw / 2, y + chh * 0.42, 0, x + cw / 2, y + chh * 0.42, r * 2.4);
      gl.addColorStop(0, hexA(acc, big ? 0.2 : 0.12));
      gl.addColorStop(1, hexA(acc, 0));
      ctx.fillStyle = gl;
      ctx.fillRect(x, y, cw, chh);
      ctx.strokeStyle = hexA(acc, 0.92);
      ctx.lineWidth = (big ? 4 : 3) * u;
      gem(ctx, x + cw / 2, y + chh * 0.42, r);
      ctx.textAlign = "center";
      ctx.fillStyle = DIM(0.88);
      ctx.font = `500 ${(big ? 32 : 26) * u}px ${mono}`;
      ctx.fillText(name, x + cw / 2, y + chh - (big ? 34 : 26) * u);
      ctx.textAlign = "left";
    };
    if (tall) {
      // featured piece, then the collection row, filling the page
      const rowH = 196 * u;
      const rowY = h - M * 0.8 - rowH;
      const heroH = rowY - gap - heroEnd;
      card(M, heroEnd, w - M * 2, heroH, "THE SÉRAPHINE — NEW", Math.min(heroH * 0.3, 120 * u), true);
      cards.forEach((name, i) => card(M + i * (cw + gap), rowY, cw, rowH, name, 44 * u, false));
    } else {
      const chh = Math.min(h - heroEnd - M * 0.7, 220 * u);
      cards.forEach((name, i) => card(M + i * (cw + gap), h - M * 0.7 - chh, cw, chh, name, 40 * u, false));
    }
  };
}

/** Allied (defence) — a procedural CAD drafting sheet: plan view, side
 *  elevation in section, dimensions and the title block. */
function blueprintPainter(accent: string): Painter {
  return (ctx, w, h) => {
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const tall = h > w * 0.85;
    const u = w / (tall ? 1024 : 1120);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#101826";
    ctx.fillRect(0, 0, w, h);
    const grid = (step: number, a: number) => {
      ctx.strokeStyle = `rgba(160,190,230,${a})`;
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let yy = 0; yy <= h; yy += step) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
    };
    grid(32 * u, 0.07);
    grid(160 * u, 0.14);
    const cx = w * (tall ? 0.4 : 0.33);
    const cy = h * (tall ? 0.43 : 0.5);
    const pw = w * (tall ? 0.54 : 0.42);
    const ph = h * (tall ? 0.34 : 0.5);
    const cf = 52 * u;
    const ho = 70 * u; // hole inset
    ctx.strokeStyle = "rgba(223,232,240,0.92)";
    ctx.lineWidth = 3.5 * u;
    ctx.beginPath();
    ctx.moveTo(cx - pw / 2 + cf, cy - ph / 2);
    ctx.lineTo(cx + pw / 2 - cf, cy - ph / 2);
    ctx.lineTo(cx + pw / 2, cy - ph / 2 + cf);
    ctx.lineTo(cx + pw / 2, cy + ph / 2);
    ctx.lineTo(cx - pw / 2, cy + ph / 2);
    ctx.lineTo(cx - pw / 2, cy - ph / 2 + cf);
    ctx.closePath();
    ctx.stroke();
    const holes = [[cx - pw / 2 + ho, cy - ph / 2 + ho], [cx + pw / 2 - ho, cy + ph / 2 - ho]] as const;
    for (const [hx, hy] of holes) {
      ctx.lineWidth = 3.5 * u;
      ctx.beginPath(); ctx.arc(hx, hy, 20 * u, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); ctx.moveTo(hx - 32 * u, hy); ctx.lineTo(hx + 32 * u, hy); ctx.moveTo(hx, hy - 32 * u); ctx.lineTo(hx, hy + 32 * u); ctx.stroke();
    }
    const arrow = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      for (const [ax, ay, aa] of [[x1, y1, 0], [x2, y2, Math.PI]] as const) {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 15 * u * Math.cos(aa + 0.38), ay + 15 * u * Math.sin(aa + 0.38));
        ctx.lineTo(ax + 15 * u * Math.cos(aa - 0.38), ay + 15 * u * Math.sin(aa - 0.38));
        ctx.closePath();
        ctx.fill();
      }
    };
    ctx.strokeStyle = hexA(accent, 0.85);
    ctx.fillStyle = hexA(accent, 0.85);
    ctx.lineWidth = 2 * u;
    arrow(cx - pw / 2, cy - ph / 2 - 46 * u, cx + pw / 2, cy - ph / 2 - 46 * u);
    ctx.fillStyle = "rgba(223,232,240,0.92)";
    ctx.font = `500 ${40 * u}px ${mono}`;
    ctx.textAlign = "center";
    ctx.fillText("120.0", cx, cy - ph / 2 - 62 * u);
    // side elevation — the same part in section, projected across
    const ex = w * (tall ? 0.74 : 0.64);
    const ew = w * (tall ? 0.12 : 0.1);
    ctx.strokeStyle = "rgba(223,232,240,0.92)";
    ctx.lineWidth = 3.5 * u;
    ctx.strokeRect(ex, cy - ph / 2, ew, ph);
    ctx.setLineDash([14 * u, 8 * u, 3 * u, 8 * u]);
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = hexA(accent, 0.8);
    for (const [, hy] of holes) {
      ctx.beginPath();
      ctx.moveTo(cx - pw / 2 - 20 * u, hy);
      ctx.lineTo(ex + ew + 20 * u, hy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(223,232,240,0.6)";
    ctx.lineWidth = 2 * u;
    for (const [, hy] of holes) ctx.strokeRect(ex, hy - 20 * u, ew, 40 * u);
    ctx.strokeStyle = hexA(accent, 0.85);
    ctx.fillStyle = hexA(accent, 0.85);
    arrow(ex, cy + ph / 2 + 44 * u, ex + ew, cy + ph / 2 + 44 * u);
    ctx.fillStyle = "rgba(223,232,240,0.92)";
    ctx.font = `500 ${36 * u}px ${mono}`;
    ctx.fillText("24.0", ex + ew / 2, cy + ph / 2 + 92 * u);
    ctx.textAlign = "left";
    // bore callout with its leader
    const [lx, ly] = holes[1];
    // tall: under the plan on a leader; wide: right-aligned above the elevation
    const tx = tall ? cx - pw / 2 : w - 32 * u;
    const ty = tall ? cy + ph / 2 + 92 * u : cy - ph / 2 - 62 * u;
    if (tall) {
      ctx.strokeStyle = hexA(accent, 0.8);
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.moveTo(lx - 14 * u, ly + 14 * u);
      ctx.lineTo(lx - 70 * u, ty - 44 * u);
      ctx.lineTo(tx + 330 * u, ty - 44 * u);
      ctx.stroke();
    }
    ctx.fillStyle = hexA(accent, 0.95);
    ctx.font = `500 ${36 * u}px ${mono}`;
    ctx.textAlign = tall ? "left" : "right";
    ctx.fillText("Ø8.5 H7  ±0.02", tx, ty);
    ctx.textAlign = "left";
    // header
    ctx.fillStyle = accent;
    ctx.font = `600 ${34 * u}px ${mono}`;
    ctx.fillText("DRAWING — PRODUCT ENGINEERING", 40 * u, 66 * u);
    // title block
    const tbh = (tall ? 176 : 132) * u;
    const tbw = tall ? w - 80 * u : w * 0.4;
    const bx = tall ? 40 * u : 28 * u;
    const by = h - tbh - (tall ? 40 : 28) * u;
    ctx.strokeStyle = "rgba(223,232,240,0.7)";
    ctx.lineWidth = 2.5 * u;
    ctx.strokeRect(bx, by, tbw, tbh);
    ctx.fillStyle = accent;
    ctx.font = `600 ${(tall ? 46 : 32) * u}px ${mono}`;
    ctx.fillText("ALLIED", bx + 24 * u, by + (tall ? 60 : 44) * u);
    ctx.fillStyle = "rgba(223,232,240,0.8)";
    ctx.font = `400 ${(tall ? 32 : 24) * u}px ${mono}`;
    ctx.fillText("PART No. AK-01", bx + 24 * u, by + (tall ? 108 : 82) * u);
    ctx.fillText("MATL: AL-7075   SCALE 1:2", bx + 24 * u, by + (tall ? 150 : 114) * u);
    if (tall) {
      const dx = bx + tbw * 0.7;
      ctx.beginPath();
      ctx.moveTo(dx, by);
      ctx.lineTo(dx, by + tbh);
      ctx.stroke();
      ctx.fillStyle = "rgba(223,232,240,0.55)";
      ctx.font = `500 ${28 * u}px ${mono}`;
      ctx.fillText("SHEET", dx + 24 * u, by + 60 * u);
      ctx.fillStyle = "rgba(223,232,240,0.9)";
      ctx.font = `500 ${52 * u}px ${mono}`;
      ctx.fillText("1 / 1", dx + 24 * u, by + 134 * u);
    }
  };
}

/** Capabilities — the code editor that IS the skills screen. */
function codePainter(): Painter {
  return (ctx, w, h) => {
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const u = w / 1120;
    ctx.fillStyle = "#0e121b";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#151a25";
    ctx.fillRect(0, 0, w, 80 * u);
    ["#ff5f56", "#ffbd2e", "#27c93f"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(40 * u + i * 34 * u, 40 * u, 10 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = DIM(0.6);
    ctx.font = `500 ${28 * u}px ${mono}`;
    ctx.textBaseline = "middle";
    ctx.fillText("engineer.ts", 170 * u, 41 * u);
    // fixed code-editor palette so it reads as code regardless of accent
    const KW = "#c792ea", KEY = "#82aaff", PUN = "#8893a8", STR = "#9ece6a", NUM = "#ff9e64", COM = "#65718a", VAR = "#e4ebf5";
    const lines: [string, string][][] = [
      [["const ", KW], ["engineer", VAR], [" = {", PUN]],
      [["  mobile", KEY], [": [", PUN], ["'Flutter'", STR], [", ", PUN], ["'Swift'", STR], ["],", PUN]],
      [["  backend", KEY], [": [", PUN], ["'C#'", STR], [", ", PUN], ["'Azure'", STR], ["],", PUN]],
      [["  web", KEY], [": [", PUN], ["'React'", STR], [", ", PUN], ["'Next'", STR], ["],", PUN]],
      [["  shipped", KEY], [": ", PUN], ["1_300_000", NUM], [",", PUN]],
      [["};", PUN]],
      [["deploy", KW], ["(engineer)", PUN], ["  // 100K DAU", COM]],
    ];
    const top = 80 * u;
    const lh = Math.min((h - top - 50 * u) / lines.length, 96 * u);
    const fs = Math.min(lh * 0.62, 50 * u);
    ctx.textBaseline = "middle";
    lines.forEach((ln, i) => {
      const y = top + 34 * u + lh * (i + 0.5);
      ctx.fillStyle = DIM(0.24);
      ctx.font = `500 ${fs * 0.72}px ${mono}`;
      ctx.fillText(String(i + 1).padStart(2, " "), 26 * u, y);
      ctx.font = `500 ${fs}px ${mono}`;
      let x = 100 * u;
      for (const [t, c] of ln) {
        ctx.fillStyle = c;
        ctx.fillText(t, x, y);
        x += ctx.measureText(t).width;
      }
    });
  };
}

/** A painted exhibit: one canvas, cropped into `split` side-by-side panes. */
function PaintedDisplay({
  painter,
  canvas,
  split,
  paneW,
  paneH,
  pan,
  accent,
  animate,
  floorY,
}: {
  painter: Painter;
  canvas: [number, number];
  split: number;
  paneW: number;
  paneH: number;
  pan: boolean;
  accent: string;
  animate: boolean;
  floorY: number;
}) {
  const tex = useTextTexture(canvas[0], canvas[1], painter);
  const slides = useMemo(
    () =>
      Array.from({ length: split }, (_, i) => ({
        tex,
        crop: split === 1 ? FULL.clone() : new THREE.Vector4(i / split, 0, 1 / split, 1),
      })),
    [tex, split],
  );
  const panes = useMemo<PaneSpec[]>(
    () => slides.map((_, i) => ({ pool: [i], pan, phase: -i * (PAN_SLIDE / 2) })),
    [slides, pan],
  );
  return (
    <ExhibitDisplay
      paneW={paneW}
      paneH={paneH}
      panes={panes}
      slides={slides}
      accent={accent}
      animate={animate}
      floorY={floorY}
    />
  );
}

/* ── placement ───────────────────────────────────────────────────────────────
 * World units, relative to the bay's screen anchor (desktop: x −1.55 on the
 * back wall; mobile: centred). `x`/`y` place the PANE-AREA centre; y is the
 * absolute height above the bay floor.
 *
 * Desktop: ONE fixture outline in every standard room — the dwell camera sees
 * the back wall free between the left prop column (≈ x −2.65) and the info
 * card's left edge (≈ x 0), and every fixture fills that column (≈ x −2.55…
 * −0.1) with its top just under the ceiling trim. App bays and Nuremi show a
 * diptych of phone-proportioned panes; poster rooms one pane of the same
 * outer size. Only Milestones (trophy case left, podium laurel below) and
 * Capabilities (ceiling cable tray above, desk monitors below) differ.
 * Mobile: the strip of back wall between the lintel and the info card is
 * ≈ 1.6 tall; fixtures are sized to fit it whole.
 * ──────────────────────────────────────────────────────────────────────── */
type Place = { x: number; y: number; paneH: number; ar?: number };
const STD_PANE_H = 2.66;
/** Inner width of the standard fixture: two phone panes and their mullion. */
const STD_INNER_W = STD_PANE_H * WALL_PANE_AR * 2 + PANE_GAP;
const PLACE = {
  phones: { desk: { x: 0.225, y: 2.3, paneH: STD_PANE_H }, mob: { x: 0, y: 2.95, paneH: 1.42 } },
  poster: {
    desk: { x: 0.225, y: 2.3, paneH: STD_PANE_H, ar: STD_INNER_W / STD_PANE_H },
    mob: { x: 0, y: 2.98, paneH: 1.26, ar: 1.47 },
  },
} satisfies Record<string, { desk: Place; mob: Place }>;
const ROOM_PLACE: Record<string, Place> = {
  trophy: { x: 0.29, y: 2.6, paneH: 1.96, ar: 1.2 },
  skills: { x: 0.225, y: 2.28, paneH: 1.92, ar: STD_INNER_W / 1.92 },
};
/** Mobile: the Experience timeline card is taller, so its strip is shorter. */
const ROOM_PLACE_MOB: Record<string, Place> = {
  experience: { x: 0, y: 3.1, paneH: 0.95, ar: 1.47 },
};

/** Picks each room's hero display and hangs it on the back wall. */
export function RoomScreen({ room, animate }: { room: Room; animate: boolean }) {
  const mobile = useIsMobile();
  const p = room.project;
  const acc = room.accent;

  const content = useMemo(() => {
    type Spec = { kind: "app" } | { kind: "phones" | "poster"; painter: Painter };
    if (p && p.kind === "screen" && p.image) return { kind: "app" } as Spec;
    if (p && p.theme === "jewellery") return { kind: "poster", painter: browserPainter(p) } as Spec;
    if (room.theme === "skills") return { kind: "poster", painter: codePainter() } as Spec;
    if (room.theme === "defence") return { kind: "poster", painter: blueprintPainter(acc) } as Spec;
    if (room.kind === "experience") return { kind: "poster", painter: experiencePainter(acc) } as Spec;
    if (room.kind === "trophy") return { kind: "poster", painter: milestonesPainter(acc) } as Spec;
    if (p) return { kind: "phones", painter: nuremiPainter(p) } as Spec;
    return { kind: "poster", painter: experiencePainter(acc) } as Spec;
  }, [p, room.theme, room.kind, acc]);

  const place: Place =
    (mobile ? ROOM_PLACE_MOB : ROOM_PLACE)[room.kind] ??
    PLACE[content.kind === "poster" ? "poster" : "phones"][mobile ? "mob" : "desk"];

  // Undo the bay's per-variant screen scale and move onto the wall face, so
  // the fixture is authored in world units and actually hangs on the wall.
  const anchor = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const a = anchor.current;
    const g = inner.current;
    if (!a || !g) return;
    a.updateWorldMatrix(true, false);
    const s = a.getWorldScale(new THREE.Vector3()).x || 1;
    const y = a.getWorldPosition(new THREE.Vector3()).y;
    g.scale.setScalar(1 / s);
    g.position.set(place.x / s, (place.y - y) / s, -WALL_GAP / s);
  }, [place]);

  const floorY = -place.y;
  let body: ReactNode = null;
  if (content.kind === "app" && p) {
    body = (
      <AppWall project={p} animate={animate} mobile={mobile} paneH={place.paneH} floorY={floorY} accent={acc} />
    );
  } else if (content.kind === "phones") {
    // two painted phone screens in one canvas; mobile panes scroll like the
    // app bays' do
    const ar = mobile ? MOBILE_PANE_AR : WALL_PANE_AR;
    body = (
      <PaintedDisplay
        painter={content.painter}
        canvas={[960, 1066]}
        split={2}
        paneW={place.paneH * ar}
        paneH={place.paneH}
        pan={mobile}
        accent={acc}
        animate={animate}
        floorY={floorY}
      />
    );
  } else if (content.kind === "poster") {
    const ar = place.ar ?? 1.47;
    const cw = ar < 1 ? 1024 : 1120;
    body = (
      <PaintedDisplay
        painter={content.painter}
        canvas={[cw, Math.round(cw / ar)]}
        split={1}
        paneW={place.paneH * ar}
        paneH={place.paneH}
        pan={false}
        accent={acc}
        animate={animate}
        floorY={floorY}
      />
    );
  }
  return (
    <group ref={anchor}>
      <group ref={inner}>
        <TrimCtx.Provider value={TRIM_BY_THEME[room.theme] ?? "steel"}>{body}</TrimCtx.Provider>
      </group>
    </group>
  );
}
