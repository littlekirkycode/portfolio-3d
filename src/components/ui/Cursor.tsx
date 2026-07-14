"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Cinematic custom cursor: a tight dot that tracks the pointer 1:1 and a
 * trailing ring lagged behind via a soft tween. Renders only on fine
 * pointers; on mount it tags <html> so globals.css hides the native cursor.
 *
 * Fully disabled (native cursor kept — has-custom-cursor never set) when the
 * OS asks for reduced motion (the spring-lagged ring is exactly the kind of
 * secondary motion vestibular users opt out of) or under forced-colors mode,
 * where mix-blend-difference is unreliable.
 *
 * Per-frame tracking is gsap (quickSetter for the dot, quickTo for the ring's
 * lagged follow — was motion useSpring, finding 49); gsap owns the wrappers'
 * x/y translation while the hover/press scale lives on nested children as a
 * plain CSS transition, so the two transforms never fight. State changes
 * (hover / press) are coarse, so React state is fine here.
 */
export default function Cursor() {
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);

  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  // Track how many cursor-interactive elements we're currently over, so
  // nested pointerover/out events can't prematurely drop the hover state.
  const hoverDepth = useRef(0);

  // In-WORLD interactives (bridge comms kiosks etc.) can't carry data-cursor —
  // they announce hover via a window "world-hover" CustomEvent instead.
  const [worldHover, setWorldHover] = useState(false);
  useEffect(() => {
    const onWorldHover = (e: Event) =>
      setWorldHover((e as CustomEvent).detail === true);
    window.addEventListener("world-hover", onWorldHover);
    return () => window.removeEventListener("world-hover", onWorldHover);
  }, []);

  // Track pointer capability reactively so hybrid/convertible devices (and
  // DevTools device-mode) gain/lose the custom cursor when the input changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)");
    const forced = window.matchMedia("(forced-colors: active)");
    const sync = () => setEnabled(fine.matches && !forced.matches);
    sync();
    fine.addEventListener("change", sync);
    forced.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      forced.removeEventListener("change", sync);
    };
  }, []);

  // Attach pointer listeners + hide the native cursor only while active —
  // under reduced motion the class is never added, so the native cursor stays.
  const active = enabled && !reduced;
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    const root = document.documentElement;
    root.classList.add("has-custom-cursor");

    // Dot snaps 1:1; the ring chases with a short eased tween per move —
    // reads as the old overdamped spring (stiffness 350 / damping 30).
    gsap.set([dot, ring], { x: -100, y: -100 });
    const dotX = gsap.quickSetter(dot, "x", "px") as (v: number) => void;
    const dotY = gsap.quickSetter(dot, "y", "px") as (v: number) => void;
    const ringX = gsap.quickTo(ring, "x", { duration: 0.35, ease: "power3" });
    const ringY = gsap.quickTo(ring, "y", { duration: 0.35, ease: "power3" });

    const isInteractive = (el: Element | null): boolean =>
      !!el?.closest(
        'a, button, [data-cursor], [role="button"], input, textarea, select, label',
      );

    const onMove = (e: PointerEvent) => {
      dotX(e.clientX);
      dotY(e.clientY);
      ringX(e.clientX);
      ringY(e.clientY);
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
      dotX(-100);
      dotY(-100);
      ringX(-100);
      ringY(-100);
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
      gsap.killTweensOf([dot, ring]);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerout", onWindowOut);
      window.removeEventListener("blur", park);
    };
  }, [active]);

  if (!active) return null;

  const ringScale = hovering || worldHover ? 1.9 : pressed ? 0.7 : 1;
  const dotScale = hovering || worldHover ? 0.4 : pressed ? 1.6 : 1;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] mix-blend-difference"
    >
      {/* Trailing ring (wrapper: gsap x/y; child: CSS-transitioned scale) */}
      <div ref={ringRef} className="absolute top-0 left-0">
        <div
          className="rounded-full border border-ink transition-[transform,opacity] duration-300 ease-out"
          style={{
            width: 34,
            height: 34,
            marginLeft: -17,
            marginTop: -17,
            transform: `scale(${ringScale})`,
            opacity: hovering || worldHover ? 1 : 0.6,
          }}
        />
      </div>
      {/* Core dot */}
      <div ref={dotRef} className="absolute top-0 left-0">
        <div
          className="rounded-full bg-ink transition-transform duration-200 ease-out"
          style={{
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            transform: `scale(${dotScale})`,
          }}
        />
      </div>
    </div>
  );
}
