"use client";

import { useEffect, useState } from "react";
import { BREAKPOINT_MOBILE } from "./constants";

export type ViewportMode = "pending" | "mobile" | "desktop";

/**
 * Tri-state viewport mode. Starts "pending" (matches SSR) so neither the heavy
 * desktop WebGL nor a wrong layout is committed before we know the real device;
 * resolves to "mobile" (small / coarse-pointer) or "desktop" after mount and on
 * change. Used to render a clean vertical DOM site on phones and the full 3D
 * corridor only on desktop — the WebGL is never mounted on mobile.
 */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>("pending");

  useEffect(() => {
    const mq = window.matchMedia(
      `(max-width: ${BREAKPOINT_MOBILE - 1}px), (pointer: coarse)`,
    );
    const sync = () => setMode(mq.matches ? "mobile" : "desktop");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return mode;
}
