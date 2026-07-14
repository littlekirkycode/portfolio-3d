"use client";

import { create } from "zustand";

/**
 * Graphics quality tier (finding 46). "high" = the full post chain; "lite" =
 * Bloom + Vignette only — the relief valve for GPUs that are STILL declining
 * once PerformanceMonitor's DPR regulation has hit its floor (Scene escalates
 * automatically), plus a diegetic manual override (the GFX chip in
 * HudReadout). A manual choice persists to localStorage and pins the tier —
 * auto-escalation never overrides the user.
 */

export type GfxQuality = "high" | "lite";

const LS_KEY = "ship-gfx";

type QualityState = {
  quality: GfxQuality;
  /** True once the user chose via the GFX chip (or a stored choice was
   *  restored) — autoLite() stops applying from then on. */
  manual: boolean;
  /** User (GFX chip) choice — persists and pins the tier. */
  setQuality: (q: GfxQuality) => void;
  /** PerformanceMonitor escalation — no-op after any manual choice. */
  autoLite: () => void;
};

export const useQualityStore = create<QualityState>((set) => ({
  // Always boots "high": the chip label is prerendered into the static HTML,
  // so the stored choice is restored post-hydration (restoreStoredQuality)
  // instead of at module scope — no hydration mismatch, no SSR localStorage.
  quality: "high",
  manual: false,
  setQuality: (q) => {
    try {
      localStorage.setItem(LS_KEY, q);
    } catch {}
    set({ quality: q, manual: true });
  },
  autoLite: () => set((s) => (s.manual || s.quality === "lite" ? s : { quality: "lite" })),
}));

/** Restore the persisted chip choice. Call from a mount effect (HudReadout),
 *  never at module scope — see the boot note above. Fails silent. */
export function restoreStoredQuality(): void {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "lite" || v === "high") {
      useQualityStore.setState({ quality: v, manual: true });
    }
  } catch {}
}
