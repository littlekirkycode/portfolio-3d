"use client";

/**
 * Photo-mode plumbing (finding 47) — a tiny module-scope registry shared by
 * the lazy canvas chunk (Scene registers the capture fn, Effects the live
 * composer) and the eager DOM HUD (the CAPTURE chip in HudReadout). Kept
 * deliberately free of three/drei value imports so the eager bundle stays
 * lean — the same reason BootOverlay reads useProgress off the Scene chunk.
 */

export type CaptureFn = () => Promise<Blob | null>;

/** Structural stand-in for postprocessing's EffectComposer. */
type ComposerLike = { render: (deltaTime?: number) => void };

let captureFn: CaptureFn | null = null;
let composer: ComposerLike | null = null;
const listeners = new Set<(ready: boolean) => void>();

/** Scene's onCreated registers the real capture; null unregisters. */
export function registerCapture(fn: CaptureFn | null): void {
  captureFn = fn;
  for (const l of listeners) l(captureFn !== null);
}

export function getCapture(): CaptureFn | null {
  return captureFn;
}

/** Subscribe to capture availability. Fires immediately with the current
 *  state (the scene chunk usually lands after the HUD mounts), then on every
 *  register/unregister. Returns an unsubscribe. */
export function onCaptureChange(cb: (ready: boolean) => void): () => void {
  listeners.add(cb);
  cb(captureFn !== null);
  return () => {
    listeners.delete(cb);
  };
}

/** Effects registers the live composer so captures include the post chain —
 *  a bare gl.render() would strip bloom/vignette from the exported still. */
export function registerComposer(c: ComposerLike | null): void {
  composer = c;
  // Harness probe (same pattern as window.__scene / __rig): non-enumerable so
  // window-walking dev tooling never trips over renderer internals.
  if (typeof window !== "undefined") {
    try {
      Object.defineProperty(window, "__composer", { value: c, configurable: true });
    } catch {}
  }
}

export function getComposer(): ComposerLike | null {
  return composer;
}
