"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useScrollStore } from "@/lib/scrollStore";
import { ROOMS, type Room } from "@/components/canvas/hallConfig";

/**
 * A floating "visit" button that appears when the camera is focused on a bay
 * whose project has a real live URL — the clickable link to the actual product.
 * Lives in the DOM (the WebGL canvas is pointer-events:none), driven by the
 * store's coarse `focusedRoom`.
 *
 * Enter/exit is gsap (was motion's AnimatePresence mode="wait" — finding 49):
 * the pill for the PREVIOUS room fades out fully before the next one mounts
 * and fades in, so direct bay-to-bay focus changes never cross-fade.
 */
export default function ProjectLink() {
  const id = useScrollStore((s) => s.focusedRoom);
  const room = id ? ROOMS.find((r) => r.id === id) : null;
  const target = room?.project?.href && room.project.href !== "#" ? room : null;
  const targetId = target?.id ?? null;

  // The room currently DISPLAYED (kept mounted through its exit animation).
  const [shown, setShown] = useState<Room | null>(null);
  const elRef = useRef<HTMLAnchorElement>(null);
  // Latest focus target, for async callbacks (exit onComplete / the mount
  // rAF). Written in an every-render effect, never during render.
  const targetRef = useRef<Room | null>(null);
  useEffect(() => {
    targetRef.current = target;
  });

  // Reconcile the displayed pill with the focused room ("wait" semantics).
  useEffect(() => {
    if ((shown?.id ?? null) === targetId) return;
    const el = elRef.current;
    if (el && shown) {
      // animate the old pill out, then swap (or clear) in onComplete
      const tween = gsap.to(el, {
        opacity: 0,
        y: 18,
        duration: 0.4,
        ease: "power4.out",
        overwrite: "auto", // kill a still-running entrance on the same pill
        onComplete: () => setShown(targetRef.current),
      });
      return () => {
        tween.kill();
      };
    }
    // nothing shown yet — mount the new pill on the next frame (the entrance
    // effect below animates it in). rAF keeps this effect setState-free.
    const raf = requestAnimationFrame(() => setShown(targetRef.current));
    return () => cancelAnimationFrame(raf);
  }, [targetId, shown]);

  // Entrance: whenever a pill (re)mounts with new content.
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
  const href = project?.href && project.href !== "#" ? project.href : null;
  if (!shown || !project || !href) return null;

  return (
    <a
      ref={elRef}
      key={shown.id}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor
      className="hud-frame pointer-events-auto fixed bottom-[6vh] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 bg-bg-elev/80 px-6 py-3 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-ink backdrop-blur-md transition-colors hover:text-ink"
      style={
        {
          // .hud-frame (unlayered globals.css) sets position:relative, which
          // beats Tailwind's LAYERED `fixed` utility under CSS cascade layers
          // — the pill silently rendered in-flow at the document tail (never
          // on screen, verified on the pre-refactor deploy too). Inline style
          // outranks both; keep it until hud-frame drops its position rule.
          position: "fixed",
          boxShadow: `0 0 26px -10px ${shown.accent}`,
          "--hud-accent": shown.accent,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="hud-bracket tl" />
      <span aria-hidden className="hud-bracket tr" />
      <span aria-hidden className="hud-bracket bl" />
      <span aria-hidden className="hud-bracket br" />
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: shown.accent }} aria-hidden />
      Visit {project.title}
      <span aria-hidden>↗</span>
    </a>
  );
}
