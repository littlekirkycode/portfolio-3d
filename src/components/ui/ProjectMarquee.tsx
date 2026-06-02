"use client";

import { PROJECTS } from "@/lib/constants";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** Auto-scrolling teaser of every project — keeps the hero from being one app. */
export default function ProjectMarquee() {
  const reduced = useReducedMotion();
  const items = [...PROJECTS, ...PROJECTS]; // duplicated for a seamless -50% loop

  return (
    <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]">
      <style>{`@keyframes pm-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div
        className="flex w-max gap-3"
        style={reduced ? undefined : { animation: "pm-scroll 30s linear infinite" }}
      >
        {items.map((p, i) => (
          <span
            key={i}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-line/80 bg-bg-elev/40 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.22em]"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.accent }} aria-hidden />
            <span className="text-ink">{p.title}</span>
            <span className="text-ink-dim/60">{p.category}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
