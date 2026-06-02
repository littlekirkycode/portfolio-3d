"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import { useIsMobile } from "@/lib/useIsMobile";
import { useReducedMotion } from "@/lib/useReducedMotion";
import Rig from "./Rig";
import Corridor from "./Corridor";
import KitShell from "./KitShell";
import Walls from "./Walls";
import Figures from "./Figures";
import FeatureScreen from "./FeatureScreen";
import Effects from "./Effects";
import { EYE_Y, MOBILE_Z, HFOV_DESKTOP, HFOV_MOBILE } from "./hallConfig";

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

  const [dprMax, setDprMax] = useState(isMobile ? 1.5 : 2);
  useEffect(() => {
    setDprMax(isMobile ? 1.5 : 2);
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
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.25;
      }}
    >
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, reduced ? 0.01 : 0.013]} />

      <PerformanceMonitor
        onDecline={() => setDprMax((d) => Math.max(1, d - 0.5))}
        onIncline={() => setDprMax((d) => Math.min(isMobile ? 1.5 : 2, d + 0.25))}
        flipflops={3}
      />
      <AdaptiveDpr pixelated />

      <ambientLight intensity={0.6} />
      <hemisphereLight args={["#5a6a8c", "#15161f", 0.85]} />

      <Rig frozen={reduced} zScale={isMobile ? MOBILE_Z : 1} />
      <FovFit mobile={isMobile} />

      {/* On mobile, squash the world on Z (corridor width) so the side walls sit
          closer to the props in portrait. X/Y unchanged; desktop scale = 1. */}
      <group scale={[1, 1, isMobile ? MOBILE_Z : 1]}>
        <Suspense fallback={null}>
          <KitShell />
          <Corridor />
          <Walls animate={!reduced} mobile={isMobile} />
          <Figures />
          <FeatureScreen />
        </Suspense>
      </group>

      {!reduced && <Effects mobile={isMobile} />}
    </Canvas>
  );
}
