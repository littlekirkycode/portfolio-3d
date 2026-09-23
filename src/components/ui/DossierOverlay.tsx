"use client";

import { useEffect, useRef, type CSSProperties } from "react";
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
 *  - Rendered through a portal to <body> by ProjectLink (the dock's
 *    blurred children would otherwise capture position:fixed).
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dossier-title"
      className="fixed inset-0 z-[56] flex items-end justify-center bg-[rgb(5_5_8/0.72)] backdrop-blur-md md:items-center md:p-[5vh]"
      style={{ animation: "hero-fade 0.3s ease-out both", "--hud-accent": accent } as CSSProperties}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[56rem]"
        style={{ animation: "ui-rise 0.46s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both" }}
      >
        <HudFrame
          accent={accent}
          strong
          rim
          className="overflow-hidden !rounded-b-none md:!rounded-[var(--ui-r-lg)]"
        >
          {/* accent hairline across the top edge — the board rim, lit */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
              opacity: 0.7,
            }}
          />
          {/* HEADER BAR — pinned OUTSIDE the scroll body: the kicker and the
              close control never scroll, and scrolled text slides under the
              bar's soft bottom edge instead of running beneath the close
              button. */}
          <div className="relative z-10 flex items-center justify-between gap-4 px-5 pb-2 pt-4 md:px-10 md:pb-3 md:pt-6">
            <p className="ui-kicker ui-kicker--dash min-w-0 truncate">
              Dossier · Exhibit {project.index}
              <span className="hidden text-ink-3/70 sm:inline"> · {project.category}</span>
            </p>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              data-cursor
              aria-label="Close dossier"
              title="Close (Esc)"
              className="ui-btn ui-icon-btn ui-btn--lg shrink-0"
            >
              <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
          {/* The overlay scrolls; the page (Lenis-stopped) does not.
              ui-fade-y: content softens into the header bar / panel base
              instead of being sliced. */}
          <div
            data-lenis-prevent
            className="ui-fade-y max-h-[calc(88svh-68px)] overflow-y-auto overscroll-contain px-5 pb-[calc(28px+var(--ui-safe-b))] pt-3 md:max-h-[calc(86svh-84px)] md:px-10 md:pb-10 md:pt-2"
          >
            <h2 id="dossier-title" className="font-display text-h1 text-ink">
              {project.title}
              <span style={{ color: accent }}>.</span>
            </h2>

            {/* lede + stat tiles | fact sheet */}
            <div className="mt-5 grid gap-7 md:grid-cols-[minmax(0,1fr)_19rem] md:gap-10">
              <div className="min-w-0">
                <p className="max-w-[46ch] text-body text-ink-2 md:text-lead">{project.description}</p>
                {/* metrics — stat tiles (numbers straight from constants) */}
                {project.metrics && project.metrics.length > 0 && (
                  <dl
                    className="mt-6 grid w-fit max-w-full gap-px overflow-hidden rounded-[var(--ui-r)] border border-line bg-line"
                    style={{ gridTemplateColumns: `repeat(${Math.min(project.metrics.length, 4)}, minmax(0, 12rem))` }}
                  >
                    {project.metrics.map((m) => (
                      <div key={m.label} className="flex min-w-[8.5rem] flex-col-reverse gap-2.5 bg-[rgb(14_15_20/0.96)] px-4 py-4 md:min-w-[10rem] md:px-5 md:py-5">
                        <dt className="ui-kicker">{m.label}</dt>
                        <dd className="font-display text-h3 text-ink">{m.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {/* fact sheet — only fields that exist on the project. Compact
                  (year + category share a row, the stack is a run of tags)
                  so it never towers over the lede column and leaves a void
                  under the stat tiles. */}
              <dl className="grid content-start gap-x-6 border-t border-line pt-1 md:grid-cols-2 md:border-l md:border-t-0 md:pl-7 md:pt-0">
                {[
                  { k: "Year", v: project.year },
                  { k: "Category", v: project.category },
                ].map((f) => (
                  <div key={f.k} className="flex items-baseline justify-between gap-4 border-b border-line py-3 md:block md:py-3.5">
                    <dt className="ui-kicker">{f.k}</dt>
                    <dd className="text-right text-body-s text-ink md:mt-1.5 md:text-left">{f.v}</dd>
                  </div>
                ))}
                <div className="border-b border-line py-3 md:col-span-2 md:py-3.5">
                  <dt className="ui-kicker">Stack</dt>
                  <dd className="mt-2.5 flex flex-wrap gap-1.5">
                    {project.tech.map((t) => (
                      <span key={t} className="ui-tag">
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3 md:col-span-2 md:block md:py-3.5">
                  <dt className="ui-kicker">Live</dt>
                  <dd className="min-w-0 truncate text-right text-body-s md:mt-1.5 md:text-left">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cursor
                        className="text-ink underline decoration-[color:var(--hud-accent)] decoration-1 underline-offset-4 transition-colors hover:text-[color:var(--hud-accent)]"
                      >
                        {href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        <span aria-hidden> ↗</span>
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <span className="text-ink-3">No public link</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* narrative */}
            <div className="mt-9 grid gap-7 md:grid-cols-3 md:gap-8">
              {sections.map((s, i) => (
                <section key={s.heading}>
                  <h3 className="ui-kicker">
                    <span className="tabular-nums" style={{ color: accent }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.heading}
                  </h3>
                  <p className="mt-3 text-body text-ink-2">{s.body}</p>
                </section>
              ))}
            </div>

            {/* screenshots */}
            {shots.length > 0 && (
              <div className="mt-10">
                <h3 className="ui-kicker">On the screens</h3>
                {/* one even-height strip — mixed aspect ratios line up, nothing
                    leaves an orphan grid cell; scrolls sideways (focusable
                    region so keyboard users can scroll it too) */}
                <div
                  role="region"
                  aria-label={`${project.title} screenshots`}
                  tabIndex={0}
                  className="ui-strip-fade -mx-5 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-3 md:-mx-10 md:gap-4 md:scroll-px-10 md:px-10"
                  style={{ scrollbarWidth: "none" }}
                >
                  {shots.map((shot, i) => (
                    // Each shot on a dark mat, toned + accent-washed at rest
                    // (.ui-shot) so bright store art sits IN the room.
                    <figure key={shot} className="ui-shot snap-start">
                      {/* Static export — no image optimizer; the JPGs already
                          ship (they texture the in-world bay screens). */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={withBase(shot)}
                        alt={`${project.title} screenshot ${i + 1}`}
                        loading="lazy"
                        className="h-[224px] w-auto max-w-none bg-bg md:h-[284px]"
                      />
                    </figure>
                  ))}
                  {/* trailing spacer so the last shot can clear the edge fade */}
                  <span aria-hidden className="w-10 shrink-0" />
                </div>
              </div>
            )}

            {/* close-out: back to the corridor · visit live */}
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
              <button type="button" onClick={onClose} data-cursor className="ui-btn">
                <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <path d="M7.5 2.5L4 6l3.5 3.5" />
                </svg>
                Back<span className="hidden sm:inline"> to corridor</span>
              </button>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cursor
                  aria-label={`Visit live — ${project.title} (opens in a new tab)`}
                  className="ui-btn ui-btn--primary"
                >
                  <span className="ui-dot" aria-hidden />
                  Visit live
                  <span aria-hidden className="text-ink-2">↗</span>
                </a>
              )}
            </div>
          </div>
        </HudFrame>
      </div>
    </div>
  );
}
