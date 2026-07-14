"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Minimal in-view hook (replaces motion/react's useInView — finding 49).
 * Same call shape as the motion API surface this codebase used:
 * `useInView(ref, { once, amount })` where `amount` is the intersection
 * ratio (IntersectionObserver threshold) that counts as "in view".
 *
 * IntersectionObserver accounts for ancestor transforms, so it keeps working
 * inside the GSAP-translated horizontal track.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, amount = 0 }: { once?: boolean; amount?: number } = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold: amount },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once, amount]);

  return inView;
}
