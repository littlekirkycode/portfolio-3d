"use client";

import dynamic from "next/dynamic";
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

export default function SceneCanvas() {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      >
        <Scene />
      </div>
      {/* Diegetic "DOCKING CLEARANCE" boot readout while the chunk + GLBs
          stream; unmounts itself once drei's progress store settles. */}
      <BootOverlay scene={sceneImport} />
    </>
  );
}
