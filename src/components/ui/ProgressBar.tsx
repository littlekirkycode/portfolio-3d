"use client";

import { useEffect, useRef } from "react";
import { SECTIONS } from "@/lib/constants";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";
import { clamp01 } from "@/lib/math";

/**
 * Thin progress line pinned to the bottom of the viewport. A single rAF loop
 * reads scrollRefs.progress (mutated every frame elsewhere) and writes scaleX
 * to the fill via a ref — never setState per frame. The "N / M" counter uses
 * store state because sectionIndex changes only occasionally.
 */
export default function ProgressBar() {
  const fillRef = useRef<HTMLDivElement>(null);
  const sectionIndex = useScrollStore((s) => s.sectionIndex);
  const total = SECTIONS.length;

  useEffect(() => {
    let raf = 0;
    let last = -1;

    const tick = () => {
      const p = clamp01(scrollRefs.progress);
      // Only touch the DOM when the value actually moved (cheap guard).
      if (fillRef.current && Math.abs(p - last) > 0.0005) {
        fillRef.current.style.transform = `scaleX(${p})`;
        last = p;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-[8vw] pb-5"
    >
      <div className="flex items-center gap-4">
        {/* Counter + live section label (chapter marker) */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.25em] text-ink-dim tabular-nums">
            {String(sectionIndex + 1).padStart(2, "0")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink transition-opacity duration-300">
            {SECTIONS[sectionIndex]?.label}
          </span>
        </div>

        {/* Track + fill */}
        <div className="relative h-px flex-1 overflow-hidden bg-line">
          <div
            ref={fillRef}
            className="absolute inset-0 origin-left"
            style={{
              transform: "scaleX(0)",
              background:
                "linear-gradient(90deg, var(--color-accent), var(--color-glow))",
              boxShadow: "0 0 8px var(--color-glow)",
            }}
          />
        </div>

        {/* Total */}
        <span className="font-mono text-[10px] tracking-[0.25em] text-ink-dim tabular-nums">
          {String(total).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
