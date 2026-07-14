"use client";

import { useEffect, useRef } from "react";
import type { Project } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import HudFrame from "@/components/ui/HudFrame";

/**
 * Full-screen case-study overlay (finding 43) — the one-click path from "nice
 * corridor" to "this person can write a case study". Opened by the OPEN
 * DOSSIER pill in ProjectLink for any focused project bay (including the three
 * projects with no live URL).
 *
 * Behaviour contract:
 *  - Lenis is stop()ped for the overlay's lifetime and start()ed on close, so
 *    the corridor cannot scroll away underneath (window.__lenis — the same
 *    handle MobileStops/the screenshot harness use).
 *  - The inner panel scrolls natively: data-lenis-prevent exempts it from
 *    Lenis' wheel/touch hijack, overscroll-contain stops chaining to the page.
 *  - Close: CLOSE chip, Escape, or a click on the backdrop. Focus lands on the
 *    CLOSE chip on open and is trapped in the panel (dialog semantics); the
 *    OPENER returns focus to the trigger pill (ProjectLink owns that half).
 *  - Entrance is a CSS animation, so the global prefers-reduced-motion
 *    backstop (globals.css) collapses it to an instant appear.
 *  - z-[56]: above the nav/menu/grain layers, below the custom cursor (z-60)
 *    so pointer users keep a visible cursor, below the boot overlay (z-58).
 */
export default function DossierOverlay({
  project,
  accent,
  onClose,
}: {
  project: Project;
  accent: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Freeze the scroll engine while open.
  useEffect(() => {
    const lenis = (
      window as unknown as { __lenis?: { stop: () => void; start: () => void } }
    ).__lenis;
    lenis?.stop();
    return () => lenis?.start();
  }, []);

  // Focus in on open; Escape closes; Tab cycles inside the panel.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && panel.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dossier = project.dossier;
  if (!dossier) return null;

  const shots =
    dossier.shots ??
    [project.image, ...(project.gallery ?? [])].filter(
      (s): s is string => !!s,
    );
  const href = project.href !== "#" ? project.href : null;
  const sections: { heading: string; body: string }[] = [
    { heading: "Problem", body: dossier.problem },
    { heading: "Build", body: dossier.build },
    { heading: "Outcome", body: dossier.outcome },
  ];
  const chip =
    "hud-frame pointer-events-auto flex items-center gap-2 bg-bg-elev/80 px-4 py-2 " +
    "font-mono text-[0.65rem] uppercase tracking-[0.25em] text-ink transition-colors hover:text-ink";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${project.title} — dossier`}
      className="fixed inset-0 z-[56] flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm md:p-[6vh]"
      style={{ animation: "hero-fade 0.25s ease-out both" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="w-full max-w-3xl">
        <HudFrame accent={accent} className="bg-bg-elev/95 backdrop-blur-md">
          {/* The overlay scrolls; the page (Lenis-stopped) does not. */}
          <div
            data-lenis-prevent
            className="max-h-[85svh] overflow-y-auto overscroll-contain px-6 py-6 md:px-10 md:py-8"
          >
            {/* header */}
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-ink-dim">
                  Dossier — {project.index} · {project.year} · {project.category}
                </p>
                <h2 className="mt-2 font-display text-3xl leading-none text-ink md:text-4xl">
                  {project.title}
                  <span style={{ color: accent }}>.</span>
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                data-cursor
                aria-label="Close dossier"
                className={chip}
                style={{ boxShadow: `0 0 20px -12px ${accent}` }}
              >
                <span aria-hidden className="hud-bracket tl" />
                <span aria-hidden className="hud-bracket tr" />
                <span aria-hidden className="hud-bracket bl" />
                <span aria-hidden className="hud-bracket br" />
                Close <span aria-hidden>✕</span>
              </button>
            </div>

            {/* metrics */}
            {project.metrics && project.metrics.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {project.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="border border-line bg-bg/60 px-4 py-2"
                  >
                    <span className="font-display text-xl text-ink">
                      {m.value}
                    </span>
                    <span className="ml-2 font-mono text-[0.6rem] uppercase tracking-[0.25em] text-ink-dim">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* narrative */}
            <div className="mt-8 space-y-7">
              {sections.map((s) => (
                <section key={s.heading}>
                  <h3
                    className="font-mono text-[0.65rem] uppercase tracking-[0.3em]"
                    style={{ color: accent }}
                  >
                    {s.heading}
                  </h3>
                  <p className="mt-2 max-w-prose leading-relaxed text-ink-dim">
                    {s.body}
                  </p>
                </section>
              ))}
            </div>

            {/* screenshots */}
            {shots.length > 0 && (
              <div className="mt-8">
                <h3 className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-ink-dim">
                  On the screens
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                  {shots.map((shot, i) => (
                    // Static export — no image optimizer; the JPGs already
                    // ship (they texture the in-world bay screens).
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={shot}
                      src={withBase(shot)}
                      alt={`${project.title} screenshot ${i + 1}`}
                      loading="lazy"
                      className="w-full border border-line bg-bg"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* tech + live link */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
              <ul className="flex flex-wrap gap-2" aria-label="Tech stack">
                {project.tech.map((t) => (
                  <li
                    key={t}
                    className="border border-line px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.25em] text-ink-dim"
                  >
                    {t}
                  </li>
                ))}
              </ul>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor
                  className={chip}
                  style={{ boxShadow: `0 0 20px -12px ${accent}` }}
                >
                  <span aria-hidden className="hud-bracket tl" />
                  <span aria-hidden className="hud-bracket tr" />
                  <span aria-hidden className="hud-bracket bl" />
                  <span aria-hidden className="hud-bracket br" />
                  Visit live <span aria-hidden>↗</span>
                </a>
              )}
            </div>
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
