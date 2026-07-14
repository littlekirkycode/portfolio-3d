"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useScrollStore } from "@/lib/scrollStore";
import { ROOMS, type Room } from "@/components/canvas/hallConfig";
import DossierOverlay from "@/components/ui/DossierOverlay";
import { track } from "@/lib/analytics";

/**
 * Floating action pills that appear when the camera is focused on a PROJECT
 * bay. Lives in the DOM (the WebGL canvas is pointer-events:none), driven by
 * the store's coarse `focusedRoom`.
 *
 *  - "Visit" — the clickable link to the live product (only when the project
 *    has a real URL).
 *  - "Open dossier ▸" — the case-study overlay (finding 43), for EVERY project
 *    bay: the three URL-less projects finally get a payoff action.
 *
 * Enter/exit is gsap (was motion's AnimatePresence mode="wait" — finding 49):
 * the pill row for the PREVIOUS room fades out fully before the next one
 * mounts and fades in, so direct bay-to-bay focus changes never cross-fade.
 */
export default function ProjectLink() {
  const id = useScrollStore((s) => s.focusedRoom);
  const room = id ? ROOMS.find((r) => r.id === id) : null;
  // Any focused project bay shows the row (the dossier pill needs no URL).
  const target = room?.project ? room : null;
  const targetId = target?.id ?? null;

  // The room currently DISPLAYED (kept mounted through its exit animation).
  const [shown, setShown] = useState<Room | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const elRef = useRef<HTMLDivElement>(null);
  const dossierBtnRef = useRef<HTMLButtonElement>(null);
  // Latest focus target, for async callbacks (exit onComplete / the mount
  // rAF). Written in an every-render effect, never during render.
  const targetRef = useRef<Room | null>(null);
  useEffect(() => {
    targetRef.current = target;
  });
  // True while an exit tween is mid-flight (R9). If focus flickers back to
  // the shown room inside the 0.4s exit window (A→null→A, or A→B→A at a bay
  // boundary — Rig publishes focus from a hard threshold with no hysteresis),
  // the effect cleanup kills the tween at an intermediate opacity/y, `shown`
  // never changes, and the entrance effect can't re-run — the row used to
  // stay frozen half-faded. This flag lets the reconcile below detect the
  // interrupted exit and tween the row back to fully visible.
  const exitingRef = useRef(false);

  // Reconcile the displayed pill row with the focused room ("wait" semantics).
  // Frozen while the dossier is open (Lenis is stopped, so focus can't drift —
  // this guard just makes that invariant explicit).
  useEffect(() => {
    if (dossierOpen) return;
    if ((shown?.id ?? null) === targetId) {
      // Focus is back on the row we already show. Normally nothing to do —
      // unless an exit tween was killed mid-flight (see exitingRef above):
      // restore the row instead of leaving it half-faded.
      if (exitingRef.current) {
        exitingRef.current = false;
        const el = elRef.current;
        if (el) {
          const tween = gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 0.3,
            ease: "power4.out",
            overwrite: "auto",
          });
          return () => {
            tween.kill();
          };
        }
      }
      return;
    }
    const el = elRef.current;
    if (el && shown) {
      // animate the old row out, then swap (or clear) in onComplete
      exitingRef.current = true;
      const tween = gsap.to(el, {
        opacity: 0,
        y: 18,
        duration: 0.4,
        ease: "power4.out",
        overwrite: "auto", // kill a still-running entrance on the same row
        onComplete: () => {
          exitingRef.current = false;
          setShown(targetRef.current);
        },
      });
      return () => {
        tween.kill();
      };
    }
    // nothing shown yet — mount the new row on the next frame (the entrance
    // effect below animates it in). rAF keeps this effect setState-free.
    const raf = requestAnimationFrame(() => setShown(targetRef.current));
    return () => cancelAnimationFrame(raf);
  }, [targetId, shown, dossierOpen]);

  // Entrance: whenever a pill row (re)mounts with new content.
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el || !shown) return;
    const tween = gsap.fromTo(
      el,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power4.out" },
    );
    return () => {
      tween.kill();
    };
  }, [shown]);

  const project = shown?.project;
  if (!shown || !project) return null;
  const href = project.href && project.href !== "#" ? project.href : null;
  const dossier = project.dossier ?? null;
  if (!href && !dossier) return null;

  /* Shared HUD-chip styling. The chips are position:relative via .hud-frame —
     the old single-pill needed an inline position:fixed override because
     .hud-frame's relative beat Tailwind's layered `fixed` on the SAME element;
     the fixed positioning now lives on the plain wrapper div instead, so the
     cascade conflict is gone. */
  const chip =
    "hud-frame pointer-events-auto flex items-center gap-3 bg-bg-elev/80 px-6 py-3 " +
    "font-mono text-[0.7rem] uppercase tracking-[0.25em] text-ink backdrop-blur-md " +
    "transition-colors hover:text-ink";
  const brackets = (
    <>
      <span aria-hidden className="hud-bracket tl" />
      <span aria-hidden className="hud-bracket tr" />
      <span aria-hidden className="hud-bracket bl" />
      <span aria-hidden className="hud-bracket br" />
    </>
  );
  const glow = { boxShadow: `0 0 26px -10px ${shown.accent}` };

  return (
    <>
      <div
        ref={elRef}
        key={shown.id}
        className="pointer-events-none fixed bottom-[6vh] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3"
        style={{ "--hud-accent": shown.accent } as React.CSSProperties}
      >
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-cursor
            className={chip}
            style={glow}
            onClick={() =>
              track("project_link_clicked", { project: project.id, href })
            }
          >
            {brackets}
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: shown.accent }}
              aria-hidden
            />
            Visit {project.title}
            <span aria-hidden>↗</span>
          </a>
        )}
        {dossier && (
          <button
            ref={dossierBtnRef}
            type="button"
            data-cursor
            className={chip}
            style={glow}
            onClick={() => {
              setDossierOpen(true);
              track("dossier_opened", { project: project.id });
            }}
          >
            {brackets}
            {!href && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: shown.accent }}
                aria-hidden
              />
            )}
            Open dossier
            <span aria-hidden>▸</span>
          </button>
        )}
      </div>

      {dossierOpen && dossier && (
        <DossierOverlay
          project={project}
          accent={shown.accent}
          onClose={() => {
            setDossierOpen(false);
            // Focus returns to the trigger pill (dialog contract).
            requestAnimationFrame(() => dossierBtnRef.current?.focus());
          }}
        />
      )}
    </>
  );
}
