"use client";

import { useEffect } from "react";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";
import { ROOMS, STOP_PROGRESSES } from "@/components/canvas/hallConfig";

/**
 * Hash deep links (finding 41): `#selfquest` boards the ship already parked at
 * that bay; walking the corridor writes the focused bay back into the hash so
 * any moment of the walk is shareable. Hash-only state — no router, no query
 * params — so it works unchanged under static export + the GitHub Pages
 * basePath.
 *
 * Inbound jump math is MobileStops' exact pattern (progress × lenis.limit):
 * on desktop the pin spacer makes lenis.limit equal the track's translate
 * distance, and on mobile the provider's measured limit is the same
 * scrollHeight − innerHeight Lenis exposes — so one formula lands the camera
 * dead-centre in the dwell band on both layouts.
 */

type LenisLike = {
  limit: number;
  scrollTo: (
    target: number,
    opts?: { immediate?: boolean; duration?: number },
  ) => void;
};

/* STOP_PROGRESSES layout (hallConfig): [airlock, showreel, ...ten dwell-slot
 * centres, bridge]. Rooms 0-4 own slots 0-4, the observation gallery owns
 * slot 5, rooms 5-8 own slots 6-9 — mirrors hallConfig's module-private
 * roomSlot()/GALLERY_SLOT (hallConfig is read-only shared config; MobileStops
 * leans on the same documented ordering). */
const SLOT_CENTRE_OFFSET = 2;
const GALLERY_SLOT = 5;

/** Every linkable id → its dwell-stop progress. */
const DEEP_LINKS: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  m.set("showreel", STOP_PROGRESSES[1]);
  m.set("gallery", STOP_PROGRESSES[SLOT_CENTRE_OFFSET + GALLERY_SLOT]);
  m.set("bridge", STOP_PROGRESSES[STOP_PROGRESSES.length - 1]);
  ROOMS.forEach((room, i) => {
    const slot = i < GALLERY_SLOT ? i : i + 1;
    m.set(room.id, STOP_PROGRESSES[SLOT_CENTRE_OFFSET + slot]);
  });
  return m;
})();

export function useDeepLink(): void {
  const ready = useScrollStore((s) => s.ready);

  // ── Inbound: #<id> → jump the scroll engine to that stop, once, on boot ──
  useEffect(() => {
    if (!ready) return;
    // R7: browsers preserve raw '%' in fragments, so a truncated share link
    // (#selfquest%2) or copy-paste junk (#75%) reaches us malformed and
    // decodeURIComponent THROWS. Uncaught inside this effect it would unmount
    // the whole React tree (no app-level boundary). Malformed hash = not a
    // deep link = ignore.
    let id = "";
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    const target = id ? DEEP_LINKS.get(id) : undefined;
    if (target === undefined) return;

    let cancelled = false;
    let raf = 0;
    // S1: on desktop lenis.limit stays 0 until the lazy 3D chunk mounts and
    // the pin spacer is measured (~1.2s after Lenis creation), so a one-shot
    // jump always bailed and the camera never parked. Poll (a rAF with two
    // cheap reads) until the limit is real; give up if the visitor starts
    // walking (progress > 0.02 — never yank them off their own scroll) or
    // after a generous deadline (something is wrong; a late teleport would
    // only confuse).
    const deadline = performance.now() + 15_000;
    const jump = () => {
      if (cancelled) return;
      if (scrollRefs.progress > 0.02) return;
      const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
      if (!lenis || !(lenis.limit > 0)) {
        if (performance.now() < deadline) raf = requestAnimationFrame(jump);
        return;
      }
      lenis.scrollTo(target * lenis.limit, { immediate: true });
    };
    // Start after the font-settle ScrollTrigger.refresh() (SmoothScrollProvider
    // registers its fonts.ready handler first, so ours resolves after it) plus
    // a double rAF so the re-measured lenis.limit is final. The boot overlay is
    // pointer-events-none and purely visual — jumping beneath it is safe; the
    // corridor simply fades in already at the linked bay.
    const fontsReady: Promise<unknown> =
      "fonts" in document ? document.fonts.ready : Promise.resolve();
    fontsReady
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(jump);
        });
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [ready]);

  // ── Outbound: focused bay → hash (replaceState — no history spam, no
  //    navigation, no scroll side effects). Same store-subscriber pattern as
  //    useShipAudio's bay beep: coarse change events only, never per frame. ──
  useEffect(() => {
    const applyHash = (id: string | null) => {
      const { pathname, search, hash } = window.location;
      const next = id ? `#${id}` : "";
      if (hash === next) return;
      try {
        history.replaceState(null, "", next || pathname + search);
      } catch {
        /* some embedded webviews throw on replaceState — links still work */
      }
    };
    const unsub = useScrollStore.subscribe((s, prev) => {
      if (s.focusedRoom === prev.focusedRoom && s.atBridge === prev.atBridge)
        return;
      // The bridge park (atBridge) isn't a focusedRoom — fold it in so the
      // '#bridge' inbound id round-trips symmetrically.
      applyHash(s.atBridge ? "bridge" : s.focusedRoom);
    });
    return unsub;
  }, []);
}

/** Null-rendering mount point so the server-component page can host the hook. */
export default function DeepLink(): null {
  useDeepLink();
  return null;
}
