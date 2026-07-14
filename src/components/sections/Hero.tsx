"use client";

import { useEffect, useRef } from "react";
import { SITE } from "@/lib/constants";
import { scrollRefs } from "@/lib/scrollStore";
import { HERO_FADE_START } from "@/components/canvas/hallConfig";
import ScrollCue from "@/components/ui/ScrollCue";
import HudFrame from "@/components/ui/HudFrame";

/**
 * Opening panel — one compact HUD card (name, role, crew line) low-left and a
 * scroll cue. The airlock door art behind it (KIRKHAM·01 stencil, hazard band,
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
         to push the scroll cue below the first-paint fold. */
      className="relative flex min-h-svh w-full shrink-0 flex-col justify-end px-[8vw] pb-[18vh] pt-24 outline-none desktop:h-screen desktop:w-screen"
    >
      <div ref={fadeRef}>
        <div
          className="w-fit max-w-md"
          style={{ animation: "hero-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both" }}
        >
          <HudFrame className="bg-bg/55 px-6 py-5 backdrop-blur-sm">
            <h1 className="font-display text-4xl leading-none tracking-[-0.01em] text-ink md:text-5xl">
              {SITE.name}
              <span className="text-accent">.</span>
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-ink-dim">
              <span className="text-ink">{SITE.role}</span>
              <br />
              {SITE.location}
            </p>
            <p className="mt-3 border-t border-line pt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim">
              CREW: 1 — does everything
            </p>
          </HudFrame>
        </div>

        {/* Scroll cue */}
        <div
          className="absolute bottom-[7vh] left-[8vw]"
          style={{ animation: "hero-fade 0.8s ease-out 1s both" }}
        >
          <ScrollCue label="Scroll" />
        </div>
      </div>
    </section>
  );
}
