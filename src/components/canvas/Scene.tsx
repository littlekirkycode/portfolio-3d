"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
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

  // Stage the non-critical GLB preloads: the shell pieces (kit-wall/kit-floor)
  // warm up at ModelLoader module scope; the other ~30 models wait for browser
  // idle so they never contend with the shell + scene chunk on a cold load.
  // Components that suspend on a model before idle still fetch it on demand.
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => preloadDeferredModels());
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(preloadDeferredModels, 200); // Safari < 18
    return () => window.clearTimeout(t);
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
        // Photo mode (finding 47): render ONE fresh frame — through the
        // composer when the post chain is mounted (a bare gl.render would
        // strip bloom/vignette), else directly — then read the canvas back.
        // preserveDrawingBuffer stays false: toBlob snapshots at call time,
        // in the same task as the render, before the buffer is cleared.
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
        flipflops={3}
      />

      {/* "Dark ship, lit exhibits" — base fill kept low so the bays' own accent
          lighting carries the exhibits and the kit walls read as moody steel. */}
      <ambientLight intensity={0.15} />
      <hemisphereLight args={["#4d5c80", "#0a0b12", 0.35]} />

      <Rig frozen={reduced} mobile={isMobile} />
      <FovFit mobile={isMobile} />

      {/* Same corridor geometry on every device — mobile framing comes from
          the Rig's portrait step-in, not from squashing the world.

          Suspense is SPLIT so the world streams in front-to-back instead of
          all-or-nothing: the shell boundary resolves on just kit-wall +
          kit-floor (~15 KB with colormap.png), then each content group pops
          in as its own assets land. The Airlock — the p=0 hero — is outside
          Suspense entirely: it never suspends (all CanvasTexture), so the
          docking door renders on the canvas's first frame. */}
      <Suspense fallback={null}>
        {/* corridor shell: gates the first paint, so keep it models-light.
            Corridor + BulkheadGates are procedural (never suspend) and ride
            along so the whole hull appears as one piece. */}
        <KitShell />
        <Corridor />
        <BulkheadGates />
      </Suspense>
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
      <Airlock />
      <Suspense fallback={null}>
        <Drone mobile={isMobile} />
      </Suspense>

      {!reduced && <Effects mobile={isMobile} quality={quality} />}
    </Canvas>
  );
}
