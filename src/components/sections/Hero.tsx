"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { SITE } from "@/lib/constants";
import { scrollRefs } from "@/lib/scrollStore";
import { useReducedMotion } from "@/lib/useReducedMotion";
import ScrollCue from "@/components/ui/ScrollCue";
import HudFrame from "@/components/ui/HudFrame";

/**
 * Opening panel — one compact HUD card (name, role, crew line) low-left and a
 * scroll cue. The airlock door art behind it (KIRKHAM·01 stencil, hazard band,
 * status lamp) IS the hero image, so the type stays out of its way: no
 * oversized name doubling the stencil, and the whole overlay fades out over
 * the first beat of scroll (p 0.004→0.024) so the doors open in the clear.
 */
export default function Hero() {
  const reduced = useReducedMotion();

  // Scroll-driven fade — style writes on a ref via rAF, zero React state.
  const fadeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = fadeRef.current;
      if (el) {
        const k = Math.min(1, Math.max(0, (scrollRefs.progress - 0.004) / 0.02));
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
      className="relative flex min-h-screen w-full shrink-0 flex-col justify-end px-[8vw] pb-[18vh] pt-24 outline-none md:h-screen md:w-screen"
    >
      <div ref={fadeRef}>
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-fit max-w-md"
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
            <p className="mt-3 border-t border-line pt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim/80">
              CREW: 1 — does everything
            </p>
          </HudFrame>
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.8 }}
          className="absolute bottom-[7vh] left-[8vw]"
        >
          <ScrollCue label="Scroll" />
        </motion.div>
      </div>
    </section>
  );
}
