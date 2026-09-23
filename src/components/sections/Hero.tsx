"use client";

import { useEffect, useRef } from "react";
import { SITE } from "@/lib/constants";
import { scrollRefs } from "@/lib/scrollStore";
import { HERO_FADE_START } from "@/components/canvas/hallConfig";
import HudFrame from "@/components/ui/HudFrame";

/**
 * Opening panel — one compact glass card (name, role, crew line) low-left;
 * the scroll cue lives in the bottom dock's context slot. The airlock door art behind it (KIRKHAM·01 stencil, hazard band,
 * status lamp) IS the hero image, so the type stays out of its way: no
 * oversized name doubling the stencil, and the whole overlay fades out over
 * the first beat of scroll (p 0.004→0.024) so the doors open in the clear.
 *
 * Entrance is a plain CSS animation (hero-rise / hero-fade in globals.css) —
 * the motion/react tween it replaced was the only thing this panel needed the
 * library for (finding 49). The reduced-motion backstop in globals.css
 * collapses the animation to an instant settle.
 */
export default function Hero() {
  // Scroll-driven fade — style writes on a ref via rAF, zero React state.
  const fadeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = fadeRef.current;
      if (el) {
        const k = Math.min(1, Math.max(0, (scrollRefs.progress - HERO_FADE_START) / 0.02));
        el.style.opacity = String(1 - k);
        el.style.pointerEvents = k > 0.6 ? "none" : "";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      data-section
      data-label="Intro"
      id="hero"
      tabIndex={-1}
      /* min-h-svh (small viewport): with the mobile URL bar visible, 100vh used
         to push the card below the first-paint fold. pb clears the bottom
         dock (context row + rail) at every height. */
      className="relative flex min-h-svh w-full shrink-0 flex-col justify-end px-[var(--ui-gutter)] pb-[max(15vh,128px)] pt-24 outline-none desktop:h-screen desktop:w-screen desktop:pb-[max(17vh,132px)]"
    >
      <div ref={fadeRef}>
        <div
          className="w-full max-w-[21.5rem] desktop:max-w-[27rem]"
          style={{ animation: "hero-rise 1s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both" }}
        >
          <HudFrame solid className="px-5 pb-4 pt-5 desktop:px-7 desktop:pb-5 desktop:pt-6">
            <p className="ui-kicker ui-kicker--dash">Crew manifest</p>
            <h1 className="mt-4 whitespace-nowrap font-display text-h2 tracking-[-0.01em] text-ink">
              {SITE.name}
              <span style={{ color: "var(--hud-accent)" }}>.</span>
            </h1>
            <p className="mt-3 text-lead text-ink">{SITE.role}</p>
            <p className="mt-1 text-body-s text-ink-2">{SITE.location}</p>
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4 desktop:mt-5">
              <span className="ui-kicker">Crew 1 — does everything</span>
              <span aria-hidden className="ui-kicker hidden gap-2 text-ink-2 desktop:inline-flex">
                <span className="ui-dot ui-breathe" />
                Aboard
              </span>
            </div>
          </HudFrame>
        </div>
      </div>
    </section>
  );
}
