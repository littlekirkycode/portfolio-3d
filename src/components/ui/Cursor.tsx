"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

/**
 * Cinematic custom cursor: a tight dot that tracks the pointer 1:1 and a
 * trailing ring lagged behind via a soft spring. Renders only on fine
 * pointers; on mount it tags <html> so globals.css hides the native cursor.
 *
 * State changes (hover / press) are coarse, so React state is fine here —
 * the per-frame tracking is driven entirely by motion values + a spring,
 * never by setState.
 */
export default function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);

  // Raw pointer position (instant) — dot follows this directly.
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);

  // Ring lags behind with a springy follow.
  const ringX = useSpring(x, { stiffness: 350, damping: 30, mass: 0.4 });
  const ringY = useSpring(y, { stiffness: 350, damping: 30, mass: 0.4 });

  // Track how many cursor-interactive elements we're currently over, so
  // nested pointerover/out events can't prematurely drop the hover state.
  const hoverDepth = useRef(0);

  // Track pointer capability reactively so hybrid/convertible devices (and
  // DevTools device-mode) gain/lose the custom cursor when the input changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)");
    const sync = () => setEnabled(fine.matches);
    sync();
    fine.addEventListener("change", sync);
    return () => fine.removeEventListener("change", sync);
  }, []);

  // Attach pointer listeners + hide the native cursor only while enabled.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.add("has-custom-cursor");

    const isInteractive = (el: Element | null): boolean =>
      !!el?.closest(
        'a, button, [data-cursor], [role="button"], input, textarea, select, label',
      );

    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };

    const onOver = (e: PointerEvent) => {
      if (isInteractive(e.target as Element)) {
        hoverDepth.current += 1;
        setHovering(true);
      }
    };

    const onOut = (e: PointerEvent) => {
      if (isInteractive(e.target as Element)) {
        hoverDepth.current = Math.max(0, hoverDepth.current - 1);
        if (hoverDepth.current === 0) setHovering(false);
      }
    };

    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);

    // Park the cursor offscreen when the pointer truly leaves the window.
    // document's pointerleave is unreliable, so use pointerout-to-null + blur.
    const park = () => {
      x.set(-100);
      y.set(-100);
    };
    const onWindowOut = (e: PointerEvent) => {
      if (e.relatedTarget === null) park();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointerout", onWindowOut);
    window.addEventListener("blur", park);

    return () => {
      root.classList.remove("has-custom-cursor");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerout", onWindowOut);
      window.removeEventListener("blur", park);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] mix-blend-difference"
    >
      {/* Trailing ring */}
      <motion.div
        className="absolute top-0 left-0 rounded-full border border-ink"
        style={{
          x: ringX,
          y: ringY,
          width: 34,
          height: 34,
          marginLeft: -17,
          marginTop: -17,
        }}
        animate={{
          scale: hovering ? 1.9 : pressed ? 0.7 : 1,
          opacity: hovering ? 1 : 0.6,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      />
      {/* Core dot */}
      <motion.div
        className="absolute top-0 left-0 rounded-full bg-ink"
        style={{
          x,
          y,
          width: 6,
          height: 6,
          marginLeft: -3,
          marginTop: -3,
        }}
        animate={{
          scale: hovering ? 0.4 : pressed ? 1.6 : 1,
        }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
      />
    </div>
  );
}
