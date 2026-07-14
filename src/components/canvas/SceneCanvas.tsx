"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import BootOverlay from "./BootOverlay";

/**
 * Client-side shell for the WebGL scene. The actual R3F <Canvas> lives in
 * ./Scene and is dynamically imported with ssr:false (WebGL can't render on the
 * server). This component is the single fixed, full-viewport layer that sits
 * BEHIND all DOM content (z-0, pointer-events-none).
 *
 * The import promise is HOISTED to module scope so the ~430 KB gz Scene chunk
 * starts downloading the moment this (eager) module evaluates — i.e. during
 * hydration — instead of only after React mounts <SceneCanvas/>. Guarded on
 * `window`: this module also evaluates during the static-export prerender on
 * Node, where eagerly pulling in Scene would run its module-scope
 * useGLTF.preload calls (they throw on relative /models/ URLs off-browser).
 */
const sceneImport = typeof window === "undefined" ? null : import("./Scene");
// dynamic() attaches its own handlers a beat later — swallow the interim
// rejection so a failed chunk fetch can't surface as an unhandled-rejection.
sceneImport?.catch(() => {});

const Scene = dynamic(() => sceneImport ?? import("./Scene"), {
  ssr: false,
  loading: () => null,
});

/* ── WebGL failure containment (finding 28) ────────────────────────────────
 * three 0.184 is WebGL2-only, but R3F 9 constructs the renderer inside an
 * un-awaited async task — a constructor throw on a GL-less browser surfaces
 * as an UNHANDLED REJECTION that no React boundary ever sees. So we probe for
 * WebGL2 synchronously and throw during render instead, where the boundary
 * below catches it. The boundary also catches everything R3F re-throws
 * outward through React (e.g. a rejected useGLTF/useTexture fetch), which
 * used to unmount the root and blank the entire site. */

let webgl2Supported: boolean | null = null;
function hasWebGL2(): boolean {
  if (webgl2Supported === null) {
    try {
      webgl2Supported =
        typeof WebGL2RenderingContext !== "undefined" &&
        !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl2Supported = false;
    }
  }
  return webgl2Supported;
}

/** Render-phase probe so an unsupported browser fails INSIDE the boundary.
 *  No-op during the static-export prerender (no window → no probe). */
function WebGL2Gate({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined" && !hasWebGL2()) {
    throw new Error("WebGL2 unavailable — skipping the 3D layer.");
  }
  return children;
}

type BoundaryState = { failed: boolean };

/**
 * Last line of defence for the WebGL layer: a GL init failure or an asset-load
 * rejection inside the Canvas must never blank the page — the DOM (with its
 * sr-only mirror) carries all real content, so losing the 3D backdrop is pure
 * graceful degradation. On error we swap in a static gradient so the site
 * keeps its deep-space mood instead of a flat void.
 */
class SceneErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };
  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("3D scene disabled — falling back to the static backdrop:", error);
  }
  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 18%, #10131f 0%, #090b14 55%, #06070d 100%)",
          }}
        />
      );
    }
    return this.props.children;
  }
}

export default function SceneCanvas() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      >
        <SceneErrorBoundary>
          <WebGL2Gate>
            <Scene />
          </WebGL2Gate>
        </SceneErrorBoundary>
      </div>
      {/* Diegetic "DOCKING CLEARANCE" boot readout while the chunk + GLBs
          stream; unmounts itself once drei's progress store settles. */}
      <BootOverlay scene={sceneImport} />
    </>
  );
}
