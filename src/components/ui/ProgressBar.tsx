"use client";

import { useEffect, useRef } from "react";
import { SECTIONS } from "@/lib/constants";
import { scrollRefs, useShipSection } from "@/lib/scrollStore";
import { clamp01 } from "@/lib/math";
import { shipLabel } from "./hud";
import HudReadout from "./HudReadout";

/**
 * Thin progress line pinned to the bottom of the viewport. A single rAF loop
 * reads scrollRefs.progress (mutated every frame elsewhere) and writes scaleX
 * to the fill via a ref — never setState per frame. The "N / M" counter uses
 * store state because sectionIndex changes only occasionally.
 */
export default function ProgressBar() {
  const fillRef = useRef<HTMLDivElement>(null);
  // Ship display section — flips to BRIDGE when the camera arrives (~p 0.86),
  // ahead of the raw store index (the DOM contact panel crosses at ~0.95).
  const sectionIndex = useShipSection();
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
    <>
      {/* Diegetic ship readout + sound chip (sits just above the bar) */}
      <HudReadout />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-[8vw] pb-5"
      >
      <div className="flex items-center gap-4">
        {/* Counter + live section label (chapter marker, ship naming) */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] tracking-[0.25em] text-ink-dim tabular-nums">
            {String(sectionIndex + 1).padStart(2, "0")}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink transition-opacity duration-300">
            {shipLabel(SECTIONS[sectionIndex]?.id, SECTIONS[sectionIndex]?.label ?? "")}
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
    </>
  );
}
