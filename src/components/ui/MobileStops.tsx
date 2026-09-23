"use client";

import { scrollRefs } from "@/lib/scrollStore";
import { STOP_PROGRESSES } from "@/components/canvas/hallConfig";

type LenisLike = {
  limit: number;
  scrollTo: (target: number, opts?: { duration?: number }) => void;
};

/** Glide to a dwell stop (progress 0..1). Duration grows with distance —
 *  the same 1.2 s + up-to-1 s curve SmoothScrollProvider uses for Home/End
 *  and section jumps — so a long jump reads as a walk down the hall, not a
 *  teleport. The provider's scrollTo wrapper supplies the cubic in-out
 *  easing whenever a duration is given. */
export function goToStop(target: number) {
  const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
  if (!lenis || !(lenis.limit > 0)) return;
  const dist = Math.abs(target - scrollRefs.progress);
  lenis.scrollTo(target * lenis.limit, { duration: 1.2 + Math.min(1, dist * 1.6) });
}

/** Jump to the previous/next dwell stop (airlock, showreel, each bay, the
 *  gallery, bridge). Progress is read AT CALL TIME from scrollRefs — no
 *  per-frame React state. */
export function hopStop(dir: 1 | -1) {
  const p = scrollRefs.progress;
  // 0.012 margin so a tap mid-glide targets the stop PAST the one just left
  const target =
    dir === 1
      ? STOP_PROGRESSES.find((s) => s > p + 0.012)
      : [...STOP_PROGRESSES].reverse().find((s) => s < p - 0.012);
  if (target === undefined) return;
  goToStop(target);
}

const Chevron = ({ up }: { up?: boolean }) => (
  <svg
    aria-hidden
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={up ? undefined : { transform: "rotate(180deg)" }}
  >
    <path d="M3.5 8.75L7 5.25l3.5 3.5" />
  </svg>
);

/**
 * The stop pager — previous / next dwell stop as one segmented pill.
 * Phones: 44px tap targets, chevrons up/down (the page scrolls down).
 * Desktop (`compact`): the dock's first control and the KEYBOARD ROUTE
 * through the ship — Tab to it, press Next, and the settled room's
 * VISIT LIVE / DOSSIER are the very next tab stops. Chevrons point
 * left/right there (the camera walks sideways).
 */
export default function MobileStops({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <nav aria-label="Corridor stops" className="ui-seg ui-seg--sm shrink-0">
        <button type="button" data-cursor aria-label="Previous stop" title="Previous stop" onClick={() => hopStop(-1)} className="ui-hit !min-w-10 !px-0">
          <span className="-rotate-90">
            <Chevron up />
          </span>
        </button>
        <button type="button" data-cursor aria-label="Next stop" title="Next stop" onClick={() => hopStop(1)} className="ui-hit !min-w-10 !px-0">
          <span className="rotate-90">
            <Chevron up />
          </span>
        </button>
      </nav>
    );
  }
  return (
    <nav aria-label="Corridor stops" className="ui-seg h-11 shrink-0">
      <button type="button" aria-label="Previous stop" onClick={() => hopStop(-1)} className="!min-w-11 !px-0">
        <Chevron up />
      </button>
      <button type="button" aria-label="Next stop" onClick={() => hopStop(1)} className="!min-w-11 !px-0">
        <Chevron />
      </button>
    </nav>
  );
}
