"use client";

import { useSyncExternalStore } from "react";
import type { Texture } from "three";

/* The PMREM studio environment (Scene's <StudioEnvironment/>) published for
 * materials that need their OWN, weaker reflection level. three.js applies
 * scene.environmentIntensity to every standard material without an envMap,
 * so a material opts out by taking the texture as its envMap and setting its
 * own envMapIntensity (the kit shell does this to keep the hall moody). */

let tex: Texture | null = null;
const listeners = new Set<() => void>();

export function setStudioEnv(t: Texture | null) {
  tex = t;
  listeners.forEach((l) => l());
}

export function useStudioEnv(): Texture | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tex,
    () => null,
  );
}
