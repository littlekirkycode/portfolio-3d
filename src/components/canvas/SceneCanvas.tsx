"use client";

import dynamic from "next/dynamic";

/**
 * Client-side shell for the WebGL scene. The actual R3F <Canvas> lives in
 * ./Scene and is dynamically imported with ssr:false (WebGL can't render on the
 * server). This component is the single fixed, full-viewport layer that sits
 * BEHIND all DOM content (z-0, pointer-events-none).
 */
const Scene = dynamic(() => import("./Scene"), {
  ssr: false,
  loading: () => null,
});

export default function SceneCanvas() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    >
      <Scene />
    </div>
  );
}
