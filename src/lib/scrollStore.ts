"use client";

import { create } from "zustand";

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
