"use client";

import { useEffect, useRef } from "react";
import { scrollRefs } from "@/lib/scrollStore";
import { clamp01 } from "@/lib/math";
import { useReducedMotion } from "@/lib/useReducedMotion";

type ScrollCueProps = {
  /** Hint text before the track. */
  label?: string;
  className?: string;
};

/**
 * The airlock's scroll cue, living in the bottom dock's context slot: a mono
 * label, a short static hairline that brightens into the room accent, and a
 * small direction arrow (→ on desktop, where the camera walks sideways; ↓ on
 * phones) that drifts 3px and back on a slow 3.6 s eased cycle. NO light
 * travels along the track (owner: no travelling pulses). A rAF loop reads
 * scrollRefs.progress to fade the cue out as the journey begins, without
 * touching React state. Fully static under reduced motion.
 */
export default function ScrollCue({ label = "Scroll", className = "" }: ScrollCueProps) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let last = -1;
    const loop = () => {
      const opacity = clamp01(1 - scrollRefs.progress / 0.05);
      if (Math.abs(opacity - last) > 0.001) {
        el.style.opacity = String(opacity);
        last = opacity;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={rootRef} aria-hidden className={`ui-kicker gap-3.5 text-[color:var(--ui-ink-2)] ${className}`}>
      <style>{KEYFRAMES}</style>
      <span>{label}</span>
      <span
        className="block h-px w-12"
        style={{
          background: "linear-gradient(90deg, var(--ui-line-strong), color-mix(in srgb, var(--hud-accent) 80%, transparent))",
        }}
      />
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="var(--hud-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="-ml-1.5 rotate-90 desktop:rotate-0"
      >
        <g style={reduced ? undefined : { animation: "scrollcue-nudge 3.6s cubic-bezier(0.65,0,0.35,1) infinite" }}>
          <path d="M2 6h7.5M6.5 3l3 3-3 3" />
        </g>
      </svg>
    </div>
  );
}

const KEYFRAMES = `
@keyframes scrollcue-nudge {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(2.5px); }
}`;
