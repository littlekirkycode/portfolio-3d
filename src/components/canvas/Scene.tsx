"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, useProgress } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import { useIsMobile, MOBILE_MEDIA_QUERY } from "@/lib/useIsMobile";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useQualityStore } from "@/lib/quality";
import { registerCapture, getComposer } from "@/lib/capture";
import Rig from "./Rig";
import Corridor from "./Corridor";
import KitShell from "./KitShell";
import Walls from "./Walls";
import FeatureScreen from "./FeatureScreen";
import Windows from "./Windows";
import BulkheadGates from "./BulkheadGates";
import Lobby from "./Lobby";
import Drone from "./Drone";
import Airlock from "./Airlock";
import Effects from "./Effects";
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
          if (dprMaxRef.current <= floor) useQualityStore.getState().autoLite();
          else setDprMax(Math.max(floor, dprMaxRef.current - 0.5));
        }}
        onIncline={() => setDprMax((d) => Math.min(2, d + 0.25))}
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

      <Rig frozen={reduced} mobile={isMobile} />
      <FovFit mobile={isMobile} />
      <CaptureBridge />

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
        <KitShell />
        <Corridor />
        <BulkheadGates />
      </Suspense>
      {shellReady && (
        <>
          <Suspense fallback={null}>
            <Walls animate={!reduced} mobile={isMobile} />
          </Suspense>
          <Suspense fallback={null}>
            <FeatureScreen />
          </Suspense>
          <Suspense fallback={null}>
            <Windows />
          </Suspense>
          <Suspense fallback={null}>
            <Lobby />
          </Suspense>
          <Suspense fallback={null}>
            <Drone mobile={isMobile} />
          </Suspense>
        </>
      )}
      <Airlock />

      {!reduced && <Effects mobile={isMobile} quality={quality} />}
    </Canvas>
  );
}
