"use client";

import { useEffect, useState } from "react";

/**
 * Tiny DOM toast for one-shot diegetic achievements (finding 45 — the drone's
 * 5th-poke payoff). Canvas code can't render DOM, so Drone fires through this
 * module-scope bridge and the single mounted instance (in HudReadout)
 * listens. Fails silent when nothing is mounted — same contract as the
 * audio cues.
 */

const HOLD_MS = 5000;

let notify: ((text: string) => void) | null = null;

export function showAchievement(text: string): void {
  notify?.(text);
}

export default function AchievementToast() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let timer = 0;
    notify = (t) => {
      setText(t);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setText(null), HOLD_MS);
    };
    return () => {
      notify = null;
      window.clearTimeout(timer);
    };
  }, []);

  if (!text) return null;

  return (
    <div
      role="status"
      data-testid="achievement-toast"
      className="pointer-events-none fixed left-1/2 top-20 z-50 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap border border-accent/60 bg-bg-elev/85 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink backdrop-blur-md"
    >
      <span aria-hidden className="hud-blink h-1.5 w-1.5 rounded-full bg-accent" />
      {text}
    </div>
  );
}
