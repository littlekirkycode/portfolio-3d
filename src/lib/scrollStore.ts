"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { SECTIONS } from "@/lib/constants";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE FRAME-DATA CONTRACT (load-bearing — read this before touching motion)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Per-frame values (scroll progress, velocity, pointer) live in PLAIN MUTABLE
 *  OBJECTS below — NOT in React state. Read them inside `useFrame` (R3F) or a
 *  requestAnimationFrame loop. Writing/reading them never triggers a React
 *  re-render, which is what keeps the site at 60fps.
 *
 *  React STATE (the zustand store) is only for COARSE, occasional changes that
 *  UI needs to re-render on: which section is active, ready flag, menu open.
 *  Never call a setter every frame.
 */

/** Updated every frame by SmoothScrollProvider. */
export const scrollRefs = {
  /** 0 → 1 normalized progress across the whole horizontal journey. */
  progress: 0,
  /** Signed scroll velocity from Lenis (px/frame-ish). */
  velocity: 0,
  /** 1 = moving forward (right), -1 = backward (left). */
  direction: 1 as 1 | -1,
};

/** Pointer position, normalized to -1..1 (origin = viewport center). Updated on pointermove. */
export const pointerRefs = {
  x: 0,
  y: 0,
};

/** Cross-component FX channels (plain refs, read in useFrame — same contract as
 *  scrollRefs). `warp` 0→1 drives the hyperspace star-streak on the bridge
 *  window; written by the DOM DEPART control, read by the bridge shader. */
export const fxRefs = {
  warp: 0,
};

type ScrollState = {
  /** Index into SECTIONS of the currently-centered section. */
  sectionIndex: number;
  /** Id of the bay the camera is currently focused on (null between rooms). */
  focusedRoom: string | null;
  setFocusedRoom: (id: string | null) => void;
  /** True once Lenis + ScrollTrigger are wired up. */
  ready: boolean;
  /** Mobile / fullscreen menu open state. */
  menuOpen: boolean;
  /** Smoothly scroll to a section by index. Set by SmoothScrollProvider; no-op until mounted. */
  scrollToSection: (index: number) => void;
  setSectionIndex: (i: number) => void;
  setReady: (v: boolean) => void;
  setMenuOpen: (v: boolean) => void;
  toggleMenu: () => void;
  setScrollToSection: (fn: (index: number) => void) => void;
};

/** Progress past which the 3D bridge fills the frame. The DOM contact panel's
 *  offsetLeft only crosses the viewport centre at p ≈ 0.95 (the work spacer is
 *  ~10 screens wide), so the store's sectionIndex flips far too late for the
 *  HUD — the camera is already parked on the bridge from ~0.86. */
const BRIDGE_ENTER_P = 0.86;

/**
 * Display section for the HUD chrome (nav dots, chapter rail, readout strip).
 * Identical to the store's coarse sectionIndex except the FINAL section (the
 * bridge) activates when the CAMERA arrives — a scroll-progress threshold —
 * instead of waiting for the DOM panel to cross the viewport centre. Coarse
 * state only: the rAF loop calls setState exactly once per threshold crossing,
 * never per frame (see the frame-data contract above).
 */
export function useShipSection(): number {
  const sectionIndex = useScrollStore((s) => s.sectionIndex);
  const [atBridge, setAtBridge] = useState(false);
  useEffect(() => {
    let raf = 0;
    let last: boolean | null = null;
    const tick = () => {
      const now = scrollRefs.progress > BRIDGE_ENTER_P;
      if (now !== last) {
        last = now;
        setAtBridge(now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return atBridge ? SECTIONS.length - 1 : sectionIndex;
}

export const useScrollStore = create<ScrollState>((set) => ({
  sectionIndex: 0,
  focusedRoom: null,
  setFocusedRoom: (id) => set({ focusedRoom: id }),
  ready: false,
  menuOpen: false,
  scrollToSection: () => {},
  setSectionIndex: (i) => set({ sectionIndex: i }),
  setReady: (v) => set({ ready: v }),
  setMenuOpen: (v) => set({ menuOpen: v }),
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  setScrollToSection: (fn) => set({ scrollToSection: fn }),
}));
