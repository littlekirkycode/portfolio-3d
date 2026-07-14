"use client";

import { useEffect } from "react";
import { analyticsEnabled, initAnalytics, track } from "@/lib/analytics";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";

/**
 * Null-rendering analytics wiring (finding 42). Mounted once from the root
 * layout; with no NEXT_PUBLIC_POSTHOG_KEY at build (or under Do Not Track)
 * the whole effect returns before attaching a single listener.
 *
 * Wires the two journey-level events here:
 *  - bay_focused: ONE store subscriber (useShipAudio's exact pattern — coarse
 *    focusedRoom transitions, never per frame) emits the LEFT bay's id with
 *    its dwell time. Dwell pauses while the tab is hidden.
 *  - max_progress: furthest corridor progress, sampled ~1 Hz off the plain
 *    scrollRefs (frame-data contract: no store setters, no re-renders), sent
 *    as a beacon on pagehide / tab-hide.
 *
 * Interaction events fire at their sources: project_link_clicked and
 * dossier_opened live in ProjectLink; depart_pressed / sound_toggled /
 * drone_poked are exported via track() and wired where those controls live.
 */
export default function AnalyticsProvider() {
  useEffect(() => {
    if (!analyticsEnabled()) return;
    initAnalytics();

    // ── bay dwell ──────────────────────────────────────────────────────
    let focusedId: string | null = null;
    let focusedAt = 0;
    const leaveBay = () => {
      if (!focusedId) return;
      track("bay_focused", {
        room: focusedId,
        dwell_ms: Math.round(performance.now() - focusedAt),
      });
      focusedId = null;
    };
    const unsubscribe = useScrollStore.subscribe((s, prev) => {
      if (s.focusedRoom === prev.focusedRoom) return;
      leaveBay();
      if (s.focusedRoom) {
        focusedId = s.focusedRoom;
        focusedAt = performance.now();
      }
    });

    // ── furthest progress ──────────────────────────────────────────────
    let maxProgress = scrollRefs.progress;
    const sampler = window.setInterval(() => {
      if (scrollRefs.progress > maxProgress) maxProgress = scrollRefs.progress;
    }, 1000);

    let flushed = false;
    const flush = () => {
      if (flushed) return;
      flushed = true;
      if (scrollRefs.progress > maxProgress) maxProgress = scrollRefs.progress;
      leaveBay(); // close out the open bay's dwell before the beacon
      track(
        "max_progress",
        {
          max_progress: Math.round(maxProgress * 1000) / 1000,
          at_progress: Math.round(scrollRefs.progress * 1000) / 1000,
        },
        { beacon: true },
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        return;
      }
      // Back to the tab: allow a later flush and restart the dwell clock for
      // the still-focused bay (time spent hidden shouldn't count as dwell).
      flushed = false;
      const current = useScrollStore.getState().focusedRoom;
      if (current && !focusedId) {
        focusedId = current;
        focusedAt = performance.now();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(sampler);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
