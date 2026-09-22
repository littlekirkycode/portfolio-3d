"use client";

import * as THREE from "three";

/* ── the ship's colour + material system ─────────────────────────────────────
 * One place for the palette every surface draws from, so rooms, panels and the
 * DOM HUD read as ONE authored ship instead of nine separately-lit boxes.
 * See docs/DESIGN_SYSTEM.md for the rules; the short version:
 *
 *  - NEUTRALS carry every structural surface (hull, furniture, housings).
 *    Never pure black: the darkest authored surface is `hull.shadow`.
 *  - Each bay has ONE accent (constants.ts) used for light/emission and small
 *    trims only — never to paint large lit surfaces (that's what made rooms
 *    look like tinted boxes). Large surfaces take neutrals; the accent arrives
 *    as light spill and emitters.
 *  - WARM (#ffd9b0) is the only secondary hue: practical lights, brass, wood.
 *  - Emissive strengths come from GLOW so bloom behaves the same everywhere.
 * ──────────────────────────────────────────────────────────────────────── */

export const INK = "#f4f1ea"; // primary text / near-white
export const INK_DIM = "rgba(244,241,234,0.62)";

export const NEUTRAL = {
  void: "#06070d", // fog / deep background
  hullShadow: "#141824", // darkest authored surface (never #000)
  hull: "#232a3a", // painted structure
  hullLight: "#3a4358", // lit painted structure, housings
  steel: "#8d96a8", // bare metal
  steelLight: "#c9d0dc", // machined / polished metal
  rubber: "#1d2026", // gym floor, grips, tyres
  wood: "#6b4a33", // desks, warm accents
  glassTint: "#cfd8ff",
} as const;

export const WARM = "#ffd9b0";

/** Emissive multipliers (toneMapped:false materials). Bloom threshold is 0.78
 *  luminance, so: TRIM stays under it (reads lit, no halo), LINE just blooms,
 *  HOT is for small true light sources only (bulbs, LEDs, core glows). */
export const GLOW = { trim: 0.75, line: 1.25, hot: 2.0 } as const;

type MatOpts = { color?: THREE.ColorRepresentation };

/** Authored PBR presets. All tuned against the studio environment
 *  (Scene ENV_INTENSITY) + the bay light pool — they hold their form in the
 *  dim bays instead of collapsing to silhouettes. Call inside useMemo. */
export const MATERIALS = {
  paint: (o: MatOpts = {}) =>
    new THREE.MeshStandardMaterial({ color: o.color ?? NEUTRAL.hull, roughness: 0.62, metalness: 0.15 }),
  paintLight: (o: MatOpts = {}) =>
    new THREE.MeshStandardMaterial({ color: o.color ?? NEUTRAL.hullLight, roughness: 0.55, metalness: 0.2 }),
  steel: (o: MatOpts = {}) =>
    new THREE.MeshStandardMaterial({ color: o.color ?? NEUTRAL.steel, roughness: 0.38, metalness: 0.75 }),
  polished: (o: MatOpts = {}) =>
    new THREE.MeshStandardMaterial({ color: o.color ?? NEUTRAL.steelLight, roughness: 0.22, metalness: 0.9 }),
  rubber: (o: MatOpts = {}) =>
    new THREE.MeshStandardMaterial({ color: o.color ?? NEUTRAL.rubber, roughness: 0.9, metalness: 0 }),
  wood: (o: MatOpts = {}) =>
    new THREE.MeshStandardMaterial({ color: o.color ?? NEUTRAL.wood, roughness: 0.7, metalness: 0 }),
  glass: () =>
    new THREE.MeshStandardMaterial({
      color: NEUTRAL.glassTint,
      roughness: 0.05,
      metalness: 0.9,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
  /** Accent emitter — `k` from GLOW. */
  emit: (accent: THREE.ColorRepresentation, k: number = GLOW.line) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(k), toneMapped: false }),
};

/** Tint a neutral a touch toward the bay accent (0..1, keep ≤ 0.15) — lets a
 *  room's structure belong to its colour story without becoming a tinted box. */
export function tintNeutral(neutral: string, accent: string, t = 0.1): THREE.Color {
  return new THREE.Color(neutral).lerp(new THREE.Color(accent), t);
}

/** Motion rules (seconds). Nothing blinks or strobes; loops are slow and eased. */
export const MOTION = {
  minLoop: 3, // no periodic visual change faster than this
  ease: 0.6, // default fade/ease duration
} as const;
