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

  /* R12: the role="status" live region must EXIST (empty) before content is
     inserted — screen readers only announce CHANGES to a live region, so
     mounting the region together with its text (one mutation) was typically
     silent and the one-shot payoff permanently missed. The always-mounted
     outer div is the region (zero-size, invisible, but in the a11y tree —
     never display:none, which would drop it from the tree); only the styled
     toast content mounts/unmounts inside it. */
  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2"
    >
      {text && (
        <div
          data-testid="achievement-toast"
          className="flex items-center gap-2.5 whitespace-nowrap border border-accent/60 bg-bg-elev/85 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink backdrop-blur-md"
        >
          <span aria-hidden className="hud-blink h-1.5 w-1.5 rounded-full bg-accent" />
          {text}
        </div>
      )}
    </div>
  );
}
