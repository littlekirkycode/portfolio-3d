"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import { useIsMobile } from "@/lib/useIsMobile";
import { useReducedMotion } from "@/lib/useReducedMotion";
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
import { EYE_Y, HFOV_DESKTOP, HFOV_MOBILE } from "./hallConfig";

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
 * render loop pauses while the tab is hidden; reduced-motion freezes the camera
 * and removes the post stack.
 */
export default function Scene() {
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();

  // Mobile cap raised 1.5 → 2: phones are ≥3× native, and 1.5 rendered the
  // canvas-texture panels visibly soft ("mobile looks worse"). The
  // PerformanceMonitor still steps down under real load.
  const [dprMax, setDprMax] = useState(2);
  useEffect(() => {
    setDprMax(2);
  }, [isMobile]);

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
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
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.25;
        // Debug/verify hook (screenshot harness scene probes — see Rig's
        // __rig). NON-ENUMERABLE: dev tooling that walks/serialises window
        // globals chokes on the scene graph's circular parent/children refs
        // (QA: "Converting circular structure to JSON" overlay error).
        Object.defineProperty(window, "__scene", { value: scene, configurable: true });
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
        onDecline={() => setDprMax((d) => Math.max(isMobile ? 1 : 1.25, d - 0.5))}
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
          the Rig's portrait step-in, not from squashing the world. */}
      <Suspense fallback={null}>
        <KitShell />
        <Corridor />
        <Walls animate={!reduced} mobile={isMobile} />
        <FeatureScreen />
        <Windows />
        <BulkheadGates />
        <Lobby />
        <Airlock />
        <Drone mobile={isMobile} />
      </Suspense>

      {!reduced && <Effects mobile={isMobile} />}
    </Canvas>
  );
}
