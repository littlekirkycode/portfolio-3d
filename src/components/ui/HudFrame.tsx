"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * The shared glass surface for every floating DOM card (hero, dossier, boot,
 * toast) — the DOM twin of the in-world boards: smoked translucent slab,
 * hairline rim, optional accent rim. Styles live in globals.css (.ui-glass).
 * Pass padding/size via className; pass `accent` to retint the rim + kicker
 * dash for a room.
 */
export default function HudFrame({
  children,
  className = "",
  accent,
  strong = false,
  solid = false,
  rim = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
  /** Near-opaque variant for dialogs / long-form reading. */
  strong?: boolean;
  /** Solid glass for text-bearing cards (hero, boot) — nothing behind it
   *  reads through the type. */
  solid?: boolean;
  /** Accent-tinted rim (the in-world board edge). */
  rim?: boolean;
}) {
  return (
    <div
      className={`ui-glass ${strong ? "ui-glass--strong" : ""} ${solid ? "ui-glass--solid" : ""} ${rim ? "ui-glass--rim" : ""} ${className}`}
      style={accent ? ({ "--hud-accent": accent } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
