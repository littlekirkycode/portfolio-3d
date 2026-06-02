"use client";

import { useEffect, useRef } from "react";
import { scrollRefs } from "@/lib/scrollStore";
import { clamp01 } from "@/lib/math";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";

type ScrollCueProps = {
  /** Hint text before the arrow. */
  label?: string;
  className?: string;
};

/**
 * Small inline "scroll →" cue. A subtle looping nudge animates the arrow track,
 * and a rAF loop reads scrollRefs.progress to fade the whole cue out the moment
 * the journey begins — without ever touching React state.
 */
export default function ScrollCue({
  label = "Scroll",
  className = "",
}: ScrollCueProps) {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let last = -1;

    const loop = () => {
      // Fade out fast across the first ~6% of the journey.
      const opacity = clamp01(1 - scrollRefs.progress / 0.06);
      // Only write when the value actually moved (skip redundant per-frame writes).
      if (Math.abs(opacity - last) > 0.001) {
        el.style.opacity = String(opacity);
        el.style.pointerEvents = opacity < 0.05 ? "none" : "auto";
        last = opacity;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      className={`flex items-center gap-3 font-mono text-[0.7rem] uppercase tracking-[0.35em] text-ink-dim ${className}`}
    >
      <style>{SWEEP_KEYFRAMES}</style>
      <span>{label}</span>
      <span
        className={`relative block overflow-hidden bg-line ${
          isMobile ? "h-12 w-px" : "h-px w-16"
        }`}
        aria-hidden
      >
        <span
          className={`absolute block bg-accent ${
            isMobile ? "inset-x-0 top-0 h-1/2" : "inset-y-0 left-0 w-1/2"
          }`}
          style={
            reduced
              ? undefined
              : {
                  animation: `${
                    isMobile ? "scrollcue-sweep-y" : "scrollcue-sweep"
                  } 1.8s cubic-bezier(0.4,0,0.2,1) infinite`,
                }
          }
        />
      </span>
      <span aria-hidden className="text-accent">
        {isMobile ? "↓" : "→"}
      </span>
    </div>
  );
}

const SWEEP_KEYFRAMES = `
@keyframes scrollcue-sweep {
  0% { transform: translateX(-100%); }
  60%, 100% { transform: translateX(220%); }
}
@keyframes scrollcue-sweep-y {
  0% { transform: translateY(-100%); }
  60%, 100% { transform: translateY(220%); }
}`;
