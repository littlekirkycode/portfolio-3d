"use client";

import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { useInView } from "motion/react";
import SplitType from "split-type";
import { useReducedMotion } from "@/lib/useReducedMotion";

type SplitKind = "chars" | "words" | "lines";

/** Escape text for safe use as innerHTML (content is plain copy from constants). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type SplitTextProps = {
  /** Plain string to split. Prefer this over children for clean aria handling. */
  text?: string;
  /** Alternative to `text` — only a plain string child is supported for splitting. */
  children?: ReactNode;
  className?: string;
  /** The rendered wrapper tag. Defaults to a block-level span. */
  as?: ElementType;
  /** Granularity of the split reveal. */
  type?: SplitKind;
  /** Seconds before the stagger begins (once in view). */
  delay?: number;
  /** Seconds between each split unit. */
  stagger?: number;
  /** Per-unit travel distance in em (vertical clip rise). */
  riseEm?: number;
  /** Re-run the reveal every time it enters view (default: once). */
  repeat?: boolean;
  style?: CSSProperties;
};

/**
 * Staggered split-text reveal driven by split-type + the Web Animations API.
 *
 * Axis-agnostic: triggered by `useInView` so it works inside the horizontal
 * track. On reduced-motion it renders the plain string with a single soft fade
 * and never splits. The full text is always exposed via `aria-label`, and every
 * split unit is `aria-hidden`, so screen readers read one clean string.
 */
export default function SplitText({
  text,
  children,
  className,
  as = "span",
  type = "chars",
  delay = 0,
  stagger = 0.022,
  riseEm = 1.05,
  repeat = false,
  style,
}: SplitTextProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const splitRef = useRef<SplitType | null>(null);
  const inView = useInView(ref, { once: !repeat, amount: 0.35 });
  const [units, setUnits] = useState<HTMLElement[]>([]);
  // Keep the wrapper hidden until split + initial hidden styles are applied,
  // so the un-split full-opacity text never paints for a frame.
  const [ready, setReady] = useState(false);

  const content = text ?? (typeof children === "string" ? children : "");

  // Split once mounted (client-only). Re-split if the content/type changes.
  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    const instance = new SplitType(el, {
      types: type,
      tagName: "span",
    });
    splitRef.current = instance;

    // Keep the generated spans out of the a11y tree (host carries aria-label).
    el.querySelectorAll("span").forEach((s) => s.setAttribute("aria-hidden", "true"));

    const list =
      type === "lines"
        ? instance.lines
        : type === "words"
          ? instance.words
          : instance.chars;

    // Hide units synchronously (before the next paint) so nothing flashes
    // at full opacity between the split and the reveal effect taking over.
    for (const u of list ?? []) {
      u.style.display = "inline-block";
      u.style.opacity = "0";
    }
    setUnits(list ?? []);
    setReady(true);

    return () => {
      instance.revert();
      splitRef.current = null;
      setUnits([]);
      setReady(false);
    };
  }, [content, type, reduced]);

  // Drive the per-unit reveal with the Web Animations API (no per-frame React).
  useEffect(() => {
    if (reduced || units.length === 0) return;

    // Prep: make each unit a clippable inline-block and offset it.
    for (const u of units) {
      u.style.display = "inline-block";
      u.style.willChange = "transform, opacity";
      if (!inView) {
        u.style.transform = `translateY(${riseEm}em)`;
        u.style.opacity = "0";
      }
    }
    if (!inView) return;

    const anims = units.map((u, i) =>
      u.animate(
        [
          { transform: `translateY(${riseEm}em)`, opacity: 0 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        {
          duration: 820,
          delay: delay * 1000 + i * stagger * 1000,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      ),
    );

    return () => anims.forEach((a) => a.cancel());
  }, [inView, units, reduced, delay, stagger, riseEm]);

  // Reduced-motion path: plain text, single CSS fade, no splitting.
  if (reduced) {
    return createElement(
      as,
      {
        className,
        style,
        "aria-label": content || undefined,
      },
      content || children,
    );
  }

  // The wrapper holds the raw string via dangerouslySetInnerHTML so React treats
  // its inner DOM as OPAQUE — split-type then rewrites it into spans without React
  // ever trying to reconcile/removeChild those nodes (which crashed on re-render).
  // The aria-label keeps the full text readable to assistive tech.
  return createElement(as, {
    ref,
    className,
    style: {
      ...style,
      overflow: "hidden",
      // visibility (not opacity/display) keeps layout + IntersectionObserver intact.
      visibility: ready ? "visible" : "hidden",
    },
    "aria-label": content || undefined,
    dangerouslySetInnerHTML: { __html: escapeHtml(content) },
  });
}
