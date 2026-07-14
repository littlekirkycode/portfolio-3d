"use client";

import { AnimatePresence, motion } from "motion/react";
import { SECTIONS, SITE } from "@/lib/constants";
import { useScrollStore, useShipSection } from "@/lib/scrollStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { shipLabel } from "./hud";

/**
 * Fixed top chrome. mix-blend-difference keeps it legible over any background.
 * Wrapper is pointer-events-none; only the interactive bits opt back in so the
 * 3D scene stays draggable in the gaps. Active section is driven by the store's
 * sectionIndex (coarse state — fine to subscribe to). Navigation is delegated
 * to scrollToSection from the store.
 */
export default function Nav() {
  const isMobile = useIsMobile();
  // Display section (not the raw store index): the BRIDGE item lights up when
  // the camera reaches the bridge, not when the wide DOM panel finally crosses.
  const sectionIndex = useShipSection();
  const menuOpen = useScrollStore((s) => s.menuOpen);

  const go = (index: number) => {
    useScrollStore.getState().scrollToSection(index);
    useScrollStore.getState().setMenuOpen(false);
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[8vw] py-6">
        {/* Top scrim — guarantees legibility over the moving scene without
            mix-blend-difference (which inverted to off-brand cyan over accents). */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-bg/70 to-transparent"
        />
        {/* Monogram → back to intro (full name lives in the hero, not repeated
            here). Accessible name contains the visible "JK" (WCAG 2.5.3). */}
        <button
          type="button"
          data-cursor
          aria-label={`JK — ${SITE.name}, back to intro`}
          onClick={() => go(0)}
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.25em] text-ink transition-opacity hover:opacity-60"
        >
          JK<span className="text-accent">.</span>
        </button>

        {/* Desktop section list (CSS-gated so there's no first-paint flash).
            The visible ship name IS the accessible name (WCAG 2.5.3 label-in-
            name — voice control users say what they see), with an sr-only
            descriptive suffix: "MANIFEST — Intro". */}
        <nav className="pointer-events-auto hidden items-center gap-8 desktop:flex">
            {SECTIONS.map((section, i) => {
              const active = i === sectionIndex;
              return (
                <button
                  key={section.id}
                  type="button"
                  data-cursor
                  aria-current={active ? "true" : undefined}
                  onClick={() => go(i)}
                  className="group relative flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em]"
                >
                  <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                        active ? "scale-100 bg-accent" : "scale-0 bg-ink"
                      }`}
                    />
                    {active && (
                      <motion.span
                        layoutId="nav-dot-glow"
                        className="absolute h-3.5 w-3.5 rounded-full bg-accent/40 blur-[3px]"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                  </span>
                  <span
                    className={`transition-colors duration-300 ${
                      active ? "text-ink" : "text-ink-dim group-hover:text-ink"
                    }`}
                  >
                    {shipLabel(section.id, section.label)}
                  </span>
                  <span className="sr-only"> — {section.label}</span>
                </button>
              );
            })}
        </nav>

        {/* Mobile menu toggle (CSS-gated). The two hairlines are ~24x8px, so
            padding + matching negative margins grow the hit area to 48x44px
            (platform tap-target guidance) with zero visual/layout change. */}
        <button
            type="button"
            data-cursor
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => useScrollStore.getState().toggleMenu()}
            className="pointer-events-auto -mx-3 -my-[18px] flex flex-col items-end gap-1.5 px-3 py-[18px] desktop:hidden"
          >
            <span
              className={`block h-px w-6 bg-ink transition-transform duration-300 ${
                menuOpen ? "translate-y-[3.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-px bg-ink transition-all duration-300 ${
                menuOpen ? "w-6 -translate-y-[3.5px] -rotate-45" : "w-4"
              }`}
            />
          </button>
      </header>

      {/* Mobile full-screen overlay menu */}
      <AnimatePresence>
        {isMobile && menuOpen && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[45] flex flex-col justify-center gap-2 bg-bg/92 px-[8vw] backdrop-blur-md"
          >
            <nav className="flex flex-col gap-1">
              {SECTIONS.map((section, i) => {
                const active = i === sectionIndex;
                return (
                  <motion.button
                    key={section.id}
                    type="button"
                    data-cursor
                    aria-current={active ? "true" : undefined}
                    onClick={() => go(i)}
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{
                      delay: 0.08 + i * 0.07,
                      duration: 0.5,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="flex items-baseline gap-4 py-1 text-left"
                  >
                    <span className="font-mono text-xs text-ink-dim">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`font-display text-5xl leading-none transition-colors ${
                        active ? "text-accent" : "text-ink"
                      }`}
                    >
                      {shipLabel(section.id, section.label)}
                    </span>
                    <span className="sr-only"> — {section.label}</span>
                  </motion.button>
                );
              })}
            </nav>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mt-12 flex flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-dim"
            >
              <a
                data-cursor
                href={`mailto:${SITE.email}`}
                className="pointer-events-auto w-fit transition-colors hover:text-ink"
              >
                {SITE.email}
              </a>
              <span>{SITE.location}</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
