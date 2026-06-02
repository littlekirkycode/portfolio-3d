"use client";

import { motion } from "motion/react";
import { SITE } from "@/lib/constants";
import { useReducedMotion } from "@/lib/useReducedMotion";
import ScrollCue from "@/components/ui/ScrollCue";

/**
 * Opening panel — deliberately minimal. An oversized name dominates the frame;
 * a small mono kicker and a two-line role sit beneath it; a scroll cue hints the
 * journey. Everything else (stats, projects) lives further down the corridor.
 */
export default function Hero() {
  const reduced = useReducedMotion();
  const [first, ...rest] = SITE.name.split(" ");
  const last = rest.join(" ");

  const rise = {
    hidden: { y: reduced ? 0 : "110%", opacity: reduced ? 0 : 1 },
    show: (i: number) => ({
      y: 0,
      opacity: 1,
      transition: { duration: reduced ? 0.4 : 1.05, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
    }),
  };

  return (
    <section
      data-section
      data-label="Intro"
      id="hero"
      className="relative flex min-h-screen w-full shrink-0 flex-col justify-center px-[8vw] py-24 md:h-screen md:w-screen md:py-0"
    >
      {/* Kicker */}
      <motion.div
        initial="hidden"
        animate="show"
        custom={0}
        variants={rise}
        className="flex items-center gap-5 font-mono text-[0.7rem] uppercase tracking-[0.35em] text-ink-dim"
      >
        <span className="text-accent">(01)</span>
        <span className="h-px w-12 bg-line" aria-hidden />
        <span>Portfolio — 2026</span>
      </motion.div>

      {/* Oversized name */}
      <h1 className="mt-7 font-display leading-[0.82] tracking-[-0.02em] text-ink">
        <span className="block overflow-hidden">
          <motion.span className="block text-[20vw] md:text-[14vw]" initial="hidden" animate="show" custom={1} variants={rise}>
            {first}
          </motion.span>
        </span>
        {last && (
          <span className="block overflow-hidden">
            <motion.span
              className="block pl-[0.06em] text-[20vw] italic text-ink-dim md:text-[14vw]"
              initial="hidden"
              animate="show"
              custom={2}
              variants={rise}
            >
              {last}
              <span className="not-italic text-accent">.</span>
            </motion.span>
          </span>
        )}
      </h1>

      {/* Role — concise two lines */}
      <motion.p
        initial={{ opacity: 0, y: reduced ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-10 max-w-md text-lg leading-relaxed text-ink-dim md:mt-12"
      >
        <span aria-hidden className="pointer-events-none absolute -inset-x-5 -inset-y-3 -z-10 rounded-lg bg-gradient-to-r from-bg/70 via-bg/30 to-transparent" />
        <span className="text-ink">{SITE.role}</span>
        <br />
        {SITE.location}
      </motion.p>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.8 }}
        className="absolute bottom-[7vh] left-[8vw]"
      >
        <ScrollCue label="Scroll" />
      </motion.div>
    </section>
  );
}
