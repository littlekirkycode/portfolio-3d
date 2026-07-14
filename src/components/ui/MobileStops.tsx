"use client";

import { scrollRefs, useScrollStore } from "@/lib/scrollStore";
import { STOP_PROGRESSES } from "@/components/canvas/hallConfig";
import { useIsMobile } from "@/lib/useIsMobile";

type LenisLike = {
  limit: number;
  scrollTo: (target: number, opts?: { duration?: number }) => void;
};

/**
 * Mobile-only hop chevrons, centred on the right edge (thumb zone). The
 * corridor is ~9 screens of thumb-scroll, so ▲/▼ jump to the previous/next
 * dwell stop (airlock, showreel, each bay, the gallery, bridge). Progress is
 * read AT TAP TIME from scrollRefs — no per-frame React state (frame-data
 * contract). Desktop keeps wheel/keys/nav clicks.
 */
export default function MobileStops() {
  const isMobile = useIsMobile();
  const ready = useScrollStore((s) => s.ready);
  const menuOpen = useScrollStore((s) => s.menuOpen);

  if (!isMobile || !ready || menuOpen) return null;

  const hop = (dir: 1 | -1) => {
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    if (!lenis || !(lenis.limit > 0)) return;
    const p = scrollRefs.progress;
    // 0.012 margin so a tap mid-glide targets the stop PAST the one just left
    const target =
      dir === 1
        ? STOP_PROGRESSES.find((s) => s > p + 0.012)
        : [...STOP_PROGRESSES].reverse().find((s) => s < p - 0.012);
    if (target === undefined) return;
    lenis.scrollTo(target * lenis.limit, { duration: 1.05 });
  };

  /* h-11/w-11 = 44px tap targets (platform guidance for a control tapped ~9
     times per traversal); gap-3 keeps the two chevrons comfortably distinct. */
  const btn =
    "flex h-11 w-11 items-center justify-center border border-line bg-bg-elev/60 " +
    "font-mono text-sm text-ink-dim backdrop-blur-md transition-colors " +
    "active:border-accent active:text-ink";

  return (
    /* 60% down the right edge: thumb zone, below the bay info panel's text
       rows and clear of the sound chip / progress footer at the bottom.
       safe-area inset keeps the chevrons off rounded corners / the notch
       side in landscape (env() is 0 where there are no insets). */
    <nav
      aria-label="Corridor stops"
      className="fixed right-[calc(0.5rem+env(safe-area-inset-right))] top-[60%] z-40 flex -translate-y-1/2 flex-col gap-3"
    >
      <button type="button" aria-label="Previous stop" onClick={() => hop(-1)} className={btn}>
        <span aria-hidden>↑</span>
      </button>
      <button type="button" aria-label="Next stop" onClick={() => hop(1)} className={btn}>
        <span aria-hidden>↓</span>
      </button>
    </nav>
  );
}
