"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { useReducedMotion } from "@/lib/useReducedMotion";

function fmt(v: number, to: number): string {
  if (to >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M+`;
  if (to >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

/**
 * Counts up to `to` once, after `delay` seconds, formatting like the final
 * value ("1.3M+", "100K"). Drives a ref's textContent (not React state) so it
 * never re-renders per frame. Renders the final value immediately under
 * reduced motion.
 */
export default function CountUp({
  to,
  final,
  delay = 0,
  className,
}: {
  to: number;
  final: string;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (reduced) {
      setDone(true);
      return;
    }
    const controls = animate(0, to, {
      duration: 1.7,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(v, to);
      },
      onComplete: () => setDone(true),
    });
    return () => controls.stop();
  }, [to, delay, reduced]);

  // Once done (or reduced) show the exact designed string.
  return (
    <span ref={ref} className={className}>
      {done ? final : fmt(0, to)}
    </span>
  );
}
