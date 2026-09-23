"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor, useProgress } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { PerspectiveCamera } from "three";
import { useIsMobile, MOBILE_MEDIA_QUERY } from "@/lib/useIsMobile";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useQualityStore } from "@/lib/quality";
import { registerCapture, getComposer } from "@/lib/capture";
import { scrollRefs } from "@/lib/scrollStore";
import Rig from "./Rig";
import Corridor, { CorridorLights } from "./Corridor";
import KitShell from "./KitShell";
import Walls, { BayLightPool } from "./Walls";
import FeatureScreen from "./FeatureScreen";
import Windows from "./Windows";
import BulkheadGates from "./BulkheadGates";
import Lobby from "./Lobby";
import Drone from "./Drone";
import Airlock from "./Airlock";
import Effects from "./Effects";
import { setStudioEnv } from "./studioEnv";
import { preloadDeferredModels } from "./ModelLoader";
import { EYE_Y, HFOV_DESKTOP, HFOV_MOBILE } from "./hallConfig";

// Re-exported for the DOM-side BootOverlay: drei's progress store rides along
// in this (already lazy) chunk, so the overlay observes the SAME
// THREE.DefaultLoadingManager the scene's loaders feed — without pulling
// drei/three into the eager bundle.
export { useProgress } from "@react-three/drei";

const BG = "#090b14";

/**
 * Keeps the side bays in frame on portrait phones. three.js `fov` is VERTICAL,
 * so a tall narrow viewport (aspect < 1) collapses the HORIZONTAL angle and crops
 * the rooms. We widen the vertical fov as aspect drops so the effective
 * horizontal fov stays roughly constant (~the desktop 62°). Reacts to
 * mobile/resize because it runs inside the Canvas against the live camera.
 */
/**
 * Photo-mode registration (finding 47). Lives in a child component — NOT in
 * Canvas onCreated — so React gives us a symmetric cleanup: when the Canvas
 * unmounts (e.g. SceneErrorBoundary tears the 3D layer down after a mid-
 * session asset rejection), registerCapture(null) fires and the HUD's CAPTURE
 * chip withdraws instead of staying armed against a disposed renderer.
 * Mirrors Effects' null-ref composer unregistration.
 */
function CaptureBridge() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // Render ONE fresh frame — through the composer when the post chain is
    // mounted (a bare gl.render would strip bloom/vignette), else directly —
    // then read the canvas back. preserveDrawingBuffer stays false: toBlob
    // snapshots at call time, in the same task as the render, before the
    // buffer is cleared.
    registerCapture(async () => {
      try {
        const composer = getComposer();
        if (composer) composer.render();
        else gl.render(scene, camera);
        return await new Promise<Blob | null>((resolve) =>
          gl.domElement.toBlob((b) => resolve(b), "image/png"),
        );
      } catch {
        return null;
      }
    });
    return () => registerCapture(null);
  }, [gl, scene, camera]);
  return null;
}

/**
 * Soft studio reflection environment (PMREM of three's RoomEnvironment).
 * Without ANY environment every metallic PBR surface — most of the GLB props
 * and the kit trims — has nothing to reflect and renders near-black, which is
 * why the bays' equipment read as silhouettes. Kept dim (environmentIntensity)
 * so the "dark ship, lit exhibits" grade survives: it adds form and sheen, not
 * fill. Symmetric cleanup like CaptureBridge.
 */
export const ENV_INTENSITY = 0.32;
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = new RoomEnvironment();
    const rt = pmrem.fromScene(env, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = ENV_INTENSITY;
    setStudioEnv(rt.texture);
    return () => {
      setStudioEnv(null);
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      env.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        }
      });
    };
  }, [gl, scene]);
  return null;
}

/**
 * Shader + texture warm-up (first-visit hitch fix). Bays are distance-gated
 * (content groups flip .visible at 37 units) and stream in behind Suspense,
 * so each exhibit's materials used to compile — and its app screenshots /
 * canvas boards upload — on the FIRST frame it came into range, mid-scroll.
 * On ANGLE/D3D11 a lit MeshStandardMaterial variant is a ~300 ms HLSL
 * compile: the hitch harness measured 1.2 s at p 0.05, 0.64 s at 0.21,
 * 1.65 s at 0.29, 0.53 s at 0.46 — the camera spring then lurched to catch
 * up, and the bloom state jumped with it.
 *
 * renderer.compile() walks the WHOLE graph (traverse, not traverseVisible),
 * so gated bays are included; compileAsync lets KHR_parallel_shader_compile
 * build them off the main thread. Program keys must match the frames that
 * will use them: under the post chain every scene pass renders into a
 * half-float target (linear output, no tone mapping), so compile with a
 * target bound; without the chain (reduced motion) compile for the screen.
 * Re-runs whenever a loading wave settles (new GLB bays mount) plus a few
 * timed passes for procedural content; already-built programs are cache
 * hits, and textures upload a few per task so the warm-up never becomes the
 * hitch it removes. Materials/lights are untouched — no light-count change.
 */
/**
 * Flat transparent DoubleSide materials → forceSinglePass. three renders a
 * transparent DoubleSide mesh in TWO passes (back faces, then front) and
 * flips `material.side` + `needsUpdate` around each — so every such material
 * bumps its version twice per render (×2 again under the floor mirror) and
 * re-runs the program lookup (getParameters/getProgramCacheKey) EVERY FRAME.
 * The census found one plane doing it ~12×/frame at the SelfAware bay:
 * ~400 ms of self time per 4 s of CPU profile, feeding the frame-time spikes
 * the camera spring then lurches through. For a planar mesh the two passes
 * are pixel-identical to one (a plane cannot overlap itself), so flip only
 * materials whose EVERY user is planar (bounding box flat on some axis).
 */
/*
 * Gloss floor (same pass). The flash trap's hot-pixel bisect (150 s corridor
 * sweep) pinned every >64 linear pixel to a near-mirror PBR surface catching
 * a bay light at the exact reflection angle — e.g. a 0.05-roughness glass
 * sheet peaking at 1,280 (×1000 the authored emitters). GGX peak ∝ 1/r⁴, so
 * r 0.05 → 0.12 cuts that peak ~33× while an env-mapped reflection barely
 * changes. Only the near-mirror tail is lifted; authored satin/gloss (≥ 0.12)
 * is untouched. The HDR guard in Effects stays the backstop.
 */
const FLAT_EPS = 1e-4;
const GLOSS_FLOOR = 0.12;
function sanitizeMaterials(root: THREE.Object3D) {
  const flatByMat = new Map<THREE.Material, boolean>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std && std.isMeshStandardMaterial && std.roughness < GLOSS_FLOOR) std.roughness = GLOSS_FLOOR;
    }
    const cands = mats.filter(
      (m) => m && m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass,
    );
    if (cands.length === 0) return;
    let flat = false;
    if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh && mesh.geometry?.attributes?.position) {
      try {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (bb)
          flat =
            bb.max.x - bb.min.x < FLAT_EPS ||
            bb.max.y - bb.min.y < FLAT_EPS ||
            bb.max.z - bb.min.z < FLAT_EPS;
      } catch {
        flat = false;
      }
    }
    for (const m of cands) flatByMat.set(m, (flatByMat.get(m) ?? true) && flat);
  });
  flatByMat.forEach((flat, m) => {
    if (flat) m.forceSinglePass = true;
  });
}

/**
 * compileAsync that can neither throw asynchronously nor hang. three's own
 * polls `properties.get(m).currentProgram.isReady()` from a bare setTimeout;
 * a material disposed (or re-keyed) mid-compile has no currentProgram, so the
 * poll throws "Cannot read properties of undefined (reading 'isReady')" inside
 * three's timer — uncaught, and the promise never settles (critic r1: it froze
 * <Warmup/>'s `running` flag for the rest of the session). Here a missing
 * program counts as ready, every poll is try-guarded, and the whole wait is
 * raced against a timeout, so the returned promise ALWAYS resolves.
 * compile() itself stays synchronous and may throw — callers keep their
 * try/catch around it.
 */
const COMPILE_TIMEOUT_MS = 3000;
function safeCompileAsync(
  gl: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  camera: THREE.Camera,
  timeoutMs = COMPILE_TIMEOUT_MS,
): Promise<void> {
  const materials = gl.compile(scene, camera) as unknown as Set<THREE.Material>;
  const pending = new Set<THREE.Material>(materials ?? []);
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    const check = () => {
      try {
        pending.forEach((m) => {
          const prog = (gl.properties.get(m) as { currentProgram?: { isReady?: () => boolean } }).currentProgram;
          if (prog?.isReady?.() ?? true) pending.delete(m);
        });
      } catch {
        pending.clear(); // never let a poll error strand the caller
      }
      if (pending.size === 0 || performance.now() - t0 > timeoutMs) resolve();
      else window.setTimeout(check, 10);
    };
    check();
  });
}

function Warmup({ post }: { post: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let queued = false;
    const timers: number[] = [];
    const keyTarget = post
      ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
      : null;
    const uploaded = new WeakSet<THREE.Texture>();
    const yieldTask = () => new Promise<void>((r) => window.setTimeout(r, 0));
    const run = async () => {
      if (cancelled) return;
      if (running) {
        queued = true;
        return;
      }
      running = true;
      try {
        sanitizeMaterials(scene);
        const prev = gl.getRenderTarget();
        let ready: Promise<void>;
        gl.setRenderTarget(keyTarget);
        try {
          ready = safeCompileAsync(gl, scene, camera);
        } finally {
          gl.setRenderTarget(prev);
        }
        await ready; // always settles (timeout-raced); the outer finally resets `running`
        const textures: THREE.Texture[] = [];
        scene.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!mat) return;
          for (const m of Array.isArray(mat) ? mat : [mat]) {
            const uniforms = (m as THREE.ShaderMaterial).uniforms;
            const slots: unknown[] = Object.values(m);
            if (uniforms) for (const u of Object.values(uniforms)) slots.push(u?.value);
            for (const v of slots) {
              if (v instanceof THREE.Texture && !uploaded.has(v) && !(v as THREE.VideoTexture).isVideoTexture) {
                const img = v.image as { width?: number; complete?: boolean } | null;
                if (img && (img.width ?? 0) > 0 && img.complete !== false) textures.push(v);
              }
            }
          }
        });
        for (let i = 0; i < textures.length; i++) {
          if (cancelled) return;
          gl.initTexture(textures[i]);
          uploaded.add(textures[i]);
          if (i % 3 === 2) await yieldTask();
        }
      } catch {
        // warm-up is an optimisation only — never let it break the scene
      } finally {
        running = false;
        if (queued && !cancelled) {
          queued = false;
          void run();
        }
      }
    };
    const later = (ms: number) => timers.push(window.setTimeout(() => void run(), ms));
    // timed passes: first paint settled, props streamed, late canvas boards
    [600, 2500, 6000, 12000, 25000].forEach(later);
    // and after every loading wave (Suspense has committed the new bay)
    let wasActive = useProgress.getState().active;
    const unsub = useProgress.subscribe((s) => {
      if (wasActive && !s.active) later(400);
      wasActive = s.active;
    });
    return () => {
      cancelled = true;
      unsub();
      timers.forEach((t) => window.clearTimeout(t));
      keyTarget?.dispose();
    };
  }, [gl, scene, camera, post]);
  return null;
}

/**
 * First-DRAW warm-up (the part compileAsync can't reach). Even with every
 * program linked and textures initialised, the first real draw of a mesh
 * still stalls on ANGLE/D3D11: the backend builds the D3D executable for the
 * actual vertex-input layout + render-target signature lazily, at draw
 * time, and GPU-side uploads land there too. The profiler put a 697 ms long
 * task on the first frame the SelfAware bay entered view (all of it inside
 * the floor mirror's pass, which simply draws first) and 400–570 ms on other
 * first entries — the camera spring then lurched through the gap.
 *
 * So the scene's HIDDEN subtrees — the distance-gated bays, parked props —
 * are drawn once, offscreen, into a 16×16 target with the same format as the
 * composer's input (half float + depth). Nothing reaches the screen.
 *
 * Budgeted (critic r1: a fixed 10-draw pass measured 1.2 s under GPU load and
 * froze a resting visitor for 1.8 s):
 *   - passes run from requestIdleCallback, ONE mesh per draw, and stop once
 *     the idle deadline or a hard cap (4 ms at rest, 2 ms travelling) is
 *     spent — a single pathological first draw is the floor, never a chain;
 *   - no pass is started after a slow frame (> 20 ms): never stack on a hitch;
 *   - while travelling, only the nearest hidden root AHEAD of the camera is
 *     warmed, so the next bay is ready by the time it enters range;
 *   - for the pass every already-visible drawable is hidden (lights stay, so
 *     the light set — hence every program key — is unchanged), so a pass
 *     costs the picked draws only, not a whole extra scene render. The floor
 *     mirror is one of those drawables, so its onBeforeRender never fires.
 * Visibility, frustumCulled and matrix auto-update are restored in the same
 * task; pending CompileReveal groups are left alone. Each mesh warms once.
 */
const DRAW_WARM_EVERY_MS = 250;
const DRAW_WARM_REST_MS = 4;
const DRAW_WARM_MOVE_MS = 2;
const DRAW_WARM_SLOW_FRAME_MS = 20;
/** Travelling: hidden roots within this many world units ahead qualify. */
const DRAW_WARM_AHEAD = 45;
/** Candidates gathered per pass (the budget, not this, bounds the draws). */
const DRAW_WARM_GATHER = 48;
/** Late-created materials (hover / state swaps) still get the gloss floor +
 *  single-pass flat planes — sanitizeMaterials is cheap and idempotent. */
const SANITIZE_EVERY_MS = 2000;
const isReflector = (o: THREE.Object3D) => (o as unknown as { isReflector?: boolean }).isReflector === true;
const isDrawable = (o: THREE.Object3D) =>
  (o as THREE.Mesh).isMesh ||
  (o as THREE.Points).isPoints ||
  (o as THREE.Line).isLine ||
  (o as THREE.Sprite).isSprite;
const hasLightBelow = (o: THREE.Object3D) => {
  let lit = false;
  for (const c of o.children)
    c.traverse((q) => {
      if ((q as THREE.Light).isLight) lit = true;
    });
  return lit;
};
type IdleDeadline = { timeRemaining: () => number; didTimeout: boolean };
type RequestIdle = (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => number;

function DrawWarm({ post }: { post: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const warmed = useRef(new WeakSet<THREE.Object3D>());
  const last = useRef(0);
  const lastSanitize = useRef(0);
  const lastFrameAt = useRef(0);
  const lastCamX = useRef<number | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const target = useMemo(
    () => new THREE.WebGLRenderTarget(16, 16, { type: post ? THREE.HalfFloatType : THREE.UnsignedByteType }),
    [post],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      target.dispose();
    };
  }, [target]);

  useFrame(({ camera }) => {
    const warmPass = (dir: number, budgetMs: number) => {
      if (!alive.current || pendingReveal.size > 0) return;
      const t0 = performance.now();
      const camX = camera.position.x;

      // hidden roots not yet fully warmed, nearest first (ahead-only when moving)
      const roots: { o: THREE.Object3D; d: number }[] = [];
      const wp = new THREE.Vector3();
      const walk = (o: THREE.Object3D) => {
        if (isReflector(o) || warmed.current.has(o)) return;
        if (o.name.startsWith("reveal:") && pendingReveal.has(o as THREE.Group)) return;
        if (!o.visible) {
          const rel = o.getWorldPosition(wp).x - camX;
          if (dir === 0 || (rel * dir > -4 && rel * dir < DRAW_WARM_AHEAD)) roots.push({ o, d: Math.abs(rel) });
          return; // its subtree is warmed with it
        }
        for (const c of o.children) walk(c);
      };
      walk(scene);
      if (roots.length === 0) return;
      roots.sort((a, b) => a.d - b.d);

      // first root that still has un-warmed draws
      let rootNode: THREE.Object3D | null = null;
      const cands: THREE.Object3D[] = [];
      for (const { o } of roots) {
        o.traverse((c) => {
          if (cands.length < DRAW_WARM_GATHER && isDrawable(c) && !isReflector(c) && !warmed.current.has(c))
            cands.push(c);
        });
        if (cands.length > 0) {
          rootNode = o;
          break;
        }
        warmed.current.add(o); // nothing left to draw in it
        if (dir !== 0) return; // travelling: the nearest root ahead only
      }
      if (!rootNode) return;
      const root: THREE.Object3D = rootNode;

      const rootChain = new Set<THREE.Object3D>();
      for (let q: THREE.Object3D | null = root; q; q = q.parent) rootChain.add(q);

      // 1) every visible drawable elsewhere goes dark for the pass (lights stay
      //    on, so the light set and every program key are unchanged)
      const hidden: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        if (o === scene || rootChain.has(o) || !isDrawable(o)) return;
        if (o.children.length > 0 && hasLightBelow(o)) return;
        hidden.push(o);
      });
      // 2) inside the root everything off (saved), then one chain at a time
      const saved: [THREE.Object3D, boolean][] = [];
      root.traverse((c) => {
        saved.push([c, c.visible]);
        c.visible = false;
      });
      const prevTarget = gl.getRenderTarget();
      const prevAuto = scene.matrixWorldAutoUpdate;
      let drawn = 0;
      try {
        hidden.forEach((o) => (o.visible = false));
        scene.updateMatrixWorld();
        scene.matrixWorldAutoUpdate = false;
        gl.setRenderTarget(target);
        for (const m of cands) {
          if (drawn > 0 && performance.now() - t0 > budgetMs) break;
          const chain: THREE.Object3D[] = [];
          for (let q: THREE.Object3D | null = m; q; q = q.parent) {
            chain.push(q);
            if (q === root) break;
          }
          const wasCulled = m.frustumCulled;
          chain.forEach((q) => (q.visible = true));
          m.frustumCulled = false;
          try {
            gl.render(scene, camera);
          } finally {
            m.frustumCulled = wasCulled;
            chain.forEach((q) => (q.visible = false));
            warmed.current.add(m);
            drawn++;
          }
        }
        if (drawn === cands.length && cands.length < DRAW_WARM_GATHER) warmed.current.add(root);
      } catch {
        // optimisation only
      } finally {
        gl.setRenderTarget(prevTarget);
        scene.matrixWorldAutoUpdate = prevAuto;
        for (let i = saved.length - 1; i >= 0; i--) saved[i][0].visible = saved[i][1];
        hidden.forEach((o) => (o.visible = true));
        if (process.env.NODE_ENV !== "production") {
          const w = window as unknown as { __drawWarm?: { t: number; ms: number; n: number; mv: number }[] };
          (w.__drawWarm ??= []).push({ t: Math.round(t0), ms: Math.round(performance.now() - t0), n: drawn, mv: dir });
        }
      }
    };

    const now = performance.now();
    const frameMs = lastFrameAt.current ? now - lastFrameAt.current : 0;
    lastFrameAt.current = now;
    const camX = camera.position.x;
    const dx = lastCamX.current === null ? 0 : camX - lastCamX.current;
    lastCamX.current = camX;
    if (frameMs > DRAW_WARM_SLOW_FRAME_MS) return; // never stack on a hitch
    if (now - lastSanitize.current > SANITIZE_EVERY_MS) {
      lastSanitize.current = now;
      try {
        sanitizeMaterials(scene);
      } catch {
        // optimisation only
      }
      return; // one chore per frame
    }
    if (inFlight.current || now - last.current < DRAW_WARM_EVERY_MS) return;
    if (pendingReveal.size > 0) return;
    const atRest =
      Math.abs(scrollRefs.velocity) <= 0.02 && Math.abs(scrollRefs.cameraProgress - scrollRefs.progress) <= 0.002;
    const dir = atRest ? 0 : Math.sign(dx);
    if (!atRest && dir === 0) return;
    last.current = now;
    inFlight.current = true;
    const cap = atRest ? DRAW_WARM_REST_MS : DRAW_WARM_MOVE_MS;
    const run = (budget: number) => {
      inFlight.current = false;
      warmPass(dir, budget);
    };
    const ric = (window as unknown as { requestIdleCallback?: RequestIdle }).requestIdleCallback;
    if (ric) ric((d) => run(Math.min(cap, Math.max(1, d.timeRemaining()))), { timeout: 400 });
    else window.setTimeout(() => run(cap), 0);
  });
  return null;
}

/**
 * Compile-before-reveal for every streamed subtree. When a Suspense boundary
 * resolves, its meshes used to draw on the very next frame — and a program
 * that isn't built blocks that frame until it is (three waits in
 * onFirstUse). Worse, a subtree that brings its OWN lights changes the light
 * count, which re-keys EVERY lit program in the scene: the next frame then
 * rebuilt them all synchronously (hitch harness: 1–4 s freezes at boot, right
 * while the airlock doors animate).
 *
 * Now a freshly-committed subtree mounts hidden. One debounced pass shows
 * every pending subtree for the duration of a synchronous compileAsync()
 * call — so the light set it sees is the FINAL one and all programs are
 * built for it, in parallel (KHR_parallel_shader_compile) — hides them
 * again, and reveals them together once every program reports ready. Frames
 * keep rendering the already-built scene meanwhile. 5 s fallback reveal.
 */
const pendingReveal = new Set<THREE.Group>();
/** When each pending group was queued (performance.now ms) — see <RevealGuard/>. */
const pendingSince = new Map<THREE.Group, number>();
const SHELL_LABEL = "reveal:shell";

/**
 * Coarse reveal state for the DOM (BootOverlay can hold its card until the
 * corridor shell is actually drawable). Re-exported through this lazy chunk
 * the same way as drei's useProgress. `shellRevealed` flips false again if
 * the shell subtree ever re-suspends and re-queues.
 */
export const useShellReveal = create<{ shellRevealed: boolean }>(() => ({ shellRevealed: false }));

function revealNow(g: THREE.Group) {
  pendingSince.delete(g);
  if (!pendingReveal.delete(g)) return;
  g.visible = true;
  if (g.name === SHELL_LABEL) useShellReveal.setState({ shellRevealed: true });
}

let revealTimer = 0;
let revealKeyTarget: THREE.WebGLRenderTarget | null = null;
function scheduleReveal(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  post: boolean,
) {
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => {
    const batch = [...pendingReveal];
    if (batch.length === 0) return;
    const reveal = () => batch.forEach(revealNow);
    let ready: Promise<void>;
    try {
      if (post && !revealKeyTarget)
        revealKeyTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
      const prev = gl.getRenderTarget();
      batch.forEach(sanitizeMaterials);
      batch.forEach((g) => (g.visible = true));
      // program keys must match the frames that use them (see <Warmup/>)
      gl.setRenderTarget(post ? revealKeyTarget : null);
      try {
        ready = safeCompileAsync(gl, scene, camera);
      } finally {
        gl.setRenderTarget(prev);
        batch.forEach((g) => (g.visible = false));
      }
    } catch {
      reveal();
      return;
    }
    const fallback = window.setTimeout(reveal, 5000);
    const done = () => {
      window.clearTimeout(fallback);
      reveal();
    };
    ready.then(done, done);
  }, 60);
}

function CompileReveal({ post, label, children }: { post: boolean; label: string; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = false;
    pendingReveal.add(g);
    pendingSince.set(g, performance.now());
    if (g.name === SHELL_LABEL) useShellReveal.setState({ shellRevealed: false });
    scheduleReveal(gl, scene, camera, post);
    return () => {
      pendingReveal.delete(g);
      pendingSince.delete(g);
    };
  }, [gl, scene, camera, post]);
  return (
    <group ref={ref} name={`reveal:${label}`}>
      {children}
    </group>
  );
}

/**
 * Never let the camera look at a world that is still waiting on its compile.
 * Behind the closed airlock doors (camera playhead < DOORS_PART_P) hiding a
 * pending subtree is free — the doors occlude the hall. But a visitor who
 * scrolls during boot on a slow GPU used to fly past the parting doors into a
 * BLACK VOID (critic BK1: camera at x=99, 8 of 224 meshes visible, the shell
 * group still hidden 8–10 s after load — compileAsync on a loaded GPU can take
 * seconds, with a 5 s fallback). Once the doors part:
 *   - the corridor shell reveals IMMEDIATELY — its remaining programs finish
 *     on the next frame (one hitch) instead of a void;
 *   - any other pending subtree (bays, lobby, drone) reveals once it has
 *     waited PENDING_MAX_MS, so a first jump into a bay never shows the empty
 *     shell for seconds before the whole exhibit pops in.
 * Runs at the default useFrame priority, i.e. before the composer renders.
 */
const DOORS_PART_P = 0.008; // Airlock UNLOCK_B / PART_A boundary
const PENDING_MAX_MS = 700;
function RevealGuard() {
  useFrame(() => {
    if (pendingReveal.size === 0) return;
    if (scrollRefs.cameraProgress < DOORS_PART_P) return;
    const now = performance.now();
    for (const g of [...pendingReveal]) {
      if (g.name === SHELL_LABEL || now - (pendingSince.get(g) ?? now) > PENDING_MAX_MS) revealNow(g);
    }
  });
  return null;
}

function FovFit({ mobile }: { mobile: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const targetHFov = mobile ? HFOV_MOBILE : HFOV_DESKTOP;
    let fov: number;
    if (aspect >= 1) {
      fov = targetHFov;
    } else {
      // vfov = 2·atan(tan(hfov/2) / aspect)
      const hRad = (targetHFov * Math.PI) / 180;
      fov = (2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180) / Math.PI;
      fov = Math.min(fov, mobile ? 86 : 90); // clamp so it never gets fisheye
    }
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, mobile]);
  return null;
}

/**
 * The corridor you walk forward down as you scroll. Lit dark hall with recessed
 * lounge alcoves (sofa + a glowing screen) cut into the walls — each one a
 * project. Camera dolly lives in <Rig/>.
 *
 * Performance: AdaptiveDpr + PerformanceMonitor scale resolution under load; the
 * render loop pauses while the tab is hidden; reduced-motion keeps the camera
 * scroll-mapped but strips all time-based easing (see Rig) and removes the
 * post stack.
 */
export default function Scene() {
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();

  // Mobile BOOTS at 1.5 and EARNS 2: starting phones at dpr 2 paid the
  // worst-case pixel cost through the whole post chain during the first
  // seconds (exactly the first-impression window), and the old regulation was
  // reactive-only — it dropped dpr only after visible jank (finding 5). Now
  // PerformanceMonitor's onIncline (+0.25, capped at 2) climbs capable phones
  // back to full sharpness within a few seconds, so the "canvas panels
  // visibly soft at 1.5" QA note still lands where it matters — steady state.
  // Desktop keeps its cap at 2 from the first frame. (matchMedia, not the
  // isMobile state, so the mobile boot never renders a dpr-2 frame while
  // useIsMobile is still settling.) A breakpoint-crossing resize re-derives
  // the cap — which also clears any PerformanceMonitor-declined value for the
  // new device class.
  const [dprMax, setDprMax] = useState(() =>
    window.matchMedia(MOBILE_MEDIA_QUERY).matches ? 1.5 : 2,
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => setDprMax(mq.matches ? 1.5 : 2);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  // Mirror for the PerformanceMonitor callbacks (they close over renders).
  const dprMaxRef = useRef(dprMax);
  // Hysteresis for the DPR regulator: after a decline, hold off climbing for
  // 30 s. Unbounded decline(-0.5)/incline(+0.25) ping-pong resized the canvas,
  // the composer's targets and the floor mirror every few seconds on
  // borderline GPUs — each step a visible sharpness jump + reallocation.
  const lastDeclineRef = useRef(-Infinity);
  useEffect(() => {
    dprMaxRef.current = dprMax;
  }, [dprMax]);

  // Quality tier (finding 46): once DPR regulation has bottomed out, the only
  // relief left is shedding post passes — Effects drops to Bloom + Vignette
  // on "lite". The store also carries the user's GFX-chip override.
  const quality = useQualityStore((s) => s.quality);

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Stage the non-critical world strictly BEHIND the shell (R0). The old
  // requestIdleCallback trigger measured main-thread idle, not network: on a
  // slow cold load it fired within milliseconds of chunk eval — while
  // kit-wall/kit-floor/colormap were still streaming — so the ~1.1 MB prop
  // wave fused with the shell wave in THREE.DefaultLoadingManager, starving
  // the shell AND holding the BootOverlay (keyed on manager quiescence) up
  // until the LAST asset landed. Now both the deferred preloads and the
  // prop-consuming subtrees below wait for the manager's FIRST active→false
  // edge (drei's useProgress store mirrors the DefaultLoadingManager), i.e.
  // for the shell wave to clear. ~3s fallback for the pathological session
  // where the manager never activates at all, re-armed while a wave is still
  // visibly in flight so a slow shell is never cut in on.
  const [shellReady, setShellReady] = useState(false);
  useEffect(() => {
    let done = false;
    let unsub: (() => void) | null = null;
    let fallback = 0;
    const finish = () => {
      if (done) return;
      done = true;
      unsub?.();
      window.clearTimeout(fallback);
      setShellReady(true);
      preloadDeferredModels();
    };
    const snap = useProgress.getState();
    if (!snap.active && snap.loaded > 0) {
      // The shell wave already came and went before this effect ran.
      finish();
      return;
    }
    let everActive = snap.active;
    unsub = useProgress.subscribe((s) => {
      if (s.active) {
        everActive = true;
        return;
      }
      if (everActive) finish();
    });
    const arm = () => {
      fallback = window.setTimeout(() => {
        if (done) return;
        if (useProgress.getState().active) arm(); // shell mid-flight — hold
        else finish();
      }, 3000);
    };
    arm();
    return () => {
      done = true;
      unsub?.();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <Canvas
      dpr={[1, dprMax]}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
      }}
      camera={{ position: [0, EYE_Y, 0], fov: 62, near: 0.1, far: 120 }}
      frameloop={visible ? "always" : "never"}
      // In-world interactives (bridge comms kiosks, the drone): the canvas
      // layer is pointer-events:none behind the DOM, so R3F listens on <body>
      // instead — events bubbling up from ANY DOM element get raycast, no
      // pointer-events restack needed. eventPrefix MUST be "client": body's
      // offset coords don't map to the fixed full-viewport canvas, client
      // coords do. (This module is ssr:false — document exists at render.)
      eventSource={document.body}
      eventPrefix="client"
      onCreated={({ gl, scene, camera, invalidate }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.25;
        // Photo mode lives in <CaptureBridge/> (symmetric register/unregister).
        // Context-loss resilience (finding 28): preventDefault signals the
        // browser we can handle a restore (common under mobile-Safari memory
        // pressure); on restore, poke the frameloop so rendering resumes
        // immediately instead of waiting for the next external invalidation.
        gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());
        gl.domElement.addEventListener("webglcontextrestored", () => invalidate());
        // Debug/verify hook (screenshot harness scene probes — see Rig's
        // __rig). NON-ENUMERABLE: dev tooling that walks/serialises window
        // globals chokes on the scene graph's circular parent/children refs
        // (QA: "Converting circular structure to JSON" overlay error).
        Object.defineProperty(window, "__scene", { value: scene, configurable: true });
        Object.defineProperty(window, "__camera", { value: camera, configurable: true });
        // Renderer handle for the harness's HDR scan (NaN / Inf / firefly
        // census of the raw scene buffer the post chain receives).
        Object.defineProperty(window, "__gl", { value: gl, configurable: true });
        if (process.env.NODE_ENV !== "production")
          Object.defineProperty(window, "__three", { value: THREE, configurable: true });
      }}
    >
      <color attach="background" args={[BG]} />
      {/* fog a step BELOW the wall value so distance recedes to black, not grey */}
      <fogExp2 attach="fog" args={["#06070d", reduced ? 0.01 : 0.013]} />

      {/* PerformanceMonitor alone regulates DPR. AdaptiveDpr (pixelated) also
          scaled dpr straight to the perf score — every load dip softened the
          whole canvas then snapped back (QA: "posters sometimes go blurry").
          Desktop floor 1.25 keeps text legible even under sustained decline. */}
      <PerformanceMonitor
        onDecline={() => {
          const floor = isMobile ? 1 : 1.25;
          // Still declining AT the floor → nothing left to shed resolution-
          // wise; escalate to the lite post tier (finding 46). A manual GFX-
          // chip choice always wins (autoLite no-ops once `manual` is set).
          lastDeclineRef.current = performance.now();
          if (dprMaxRef.current <= floor) useQualityStore.getState().autoLite();
          else setDprMax(Math.max(floor, dprMaxRef.current - 0.5));
        }}
        onIncline={() => {
          if (performance.now() - lastDeclineRef.current < 30000) return;
          setDprMax((d) => Math.min(2, d + 0.25));
        }}
        // R1: effectively immortal. drei counts EVERY incline/decline event
        // against flipflops — not direction CHANGES — and permanently stops
        // sampling once exceeded. At a locked refresh rate the monitor fires
        // a no-op onIncline every ~2.5s, so flipflops={3} killed it ~10s into
        // the session and the degrade-later path (thermal throttle → decline
        // → dprMax floor → autoLite) could never fire. Infinity keeps the
        // sampler alive for the whole session; the callbacks above are
        // already idempotent at their caps so immortality costs nothing.
        flipflops={Infinity}
      />

      {/* "Dark ship, lit exhibits" — base fill kept low so the bays' own accent
          lighting carries the exhibits and the kit walls read as moody steel. */}
      <ambientLight intensity={0.15} />
      <hemisphereLight args={["#4d5c80", "#0a0b12", 0.35]} />
      {/* FIXED LIGHT RIG — every light that can be hoisted lives here, mounted
          from the first frame and never inside a Suspense/shellReady gate.
          three keys each lit program on the scene's light COUNT: the corridor
          fixtures used to arrive with the shell Suspense and the bay pool with
          shellReady, and each arrival recompiled every lit material (hitch
          harness: 2.2 s and 3.8 s main-thread freezes during boot, while the
          airlock doors animate). Pure components — they never suspend. */}
      {/* (mounted just below <Rig/> so the pool reads this frame's playhead) */}

      <Rig frozen={reduced} mobile={isMobile} />
      <CorridorLights />
      <BayLightPool />
      <FovFit mobile={isMobile} />
      <CaptureBridge />
      <StudioEnvironment />
      <Warmup post={!reduced} />
      <RevealGuard />
      <DrawWarm post={!reduced} />

      {/* Same corridor geometry on every device — mobile framing comes from
          the Rig's portrait step-in, not from squashing the world.

          Suspense is SPLIT so the world streams in front-to-back instead of
          all-or-nothing: the shell boundary resolves on just kit-wall +
          kit-floor (~15 KB with colormap.png), then each content group pops
          in as its own assets land. The content groups are additionally
          gated on shellReady (R0): mounting them any earlier starts their
          useGLTF fetches at first render, which is exactly the shell-wave
          bandwidth contention ModelLoader's staging exists to prevent. The
          Airlock — the p=0 hero — is outside Suspense entirely: it never
          suspends (all CanvasTexture), so the docking door renders on the
          canvas's first frame. */}
      <Suspense fallback={null}>
        {/* corridor shell: gates the first paint, so keep it models-light.
            Corridor + BulkheadGates are procedural (never suspend) and ride
            along so the whole hull appears as one piece. */}
        <CompileReveal post={!reduced} label="shell">
          <KitShell />
          <Corridor mobile={isMobile} quality={quality} />
          <BulkheadGates />
        </CompileReveal>
      </Suspense>
      {shellReady && (
        <>
          <Suspense fallback={null}>
            <CompileReveal post={!reduced} label="walls">
              <Walls animate={!reduced} mobile={isMobile} />
            </CompileReveal>
          </Suspense>
          <Suspense fallback={null}>
            <CompileReveal post={!reduced} label="feature">
              <FeatureScreen />
            </CompileReveal>
          </Suspense>
          <Suspense fallback={null}>
            <CompileReveal post={!reduced} label="windows">
              <Windows />
            </CompileReveal>
          </Suspense>
          <Suspense fallback={null}>
            <CompileReveal post={!reduced} label="lobby">
              <Lobby />
            </CompileReveal>
          </Suspense>
          <Suspense fallback={null}>
            <CompileReveal post={!reduced} label="drone">
              <Drone mobile={isMobile} />
            </CompileReveal>
          </Suspense>
        </>
      )}
      <Airlock />

      {!reduced && <Effects mobile={isMobile} quality={quality} />}
    </Canvas>
  );
}
