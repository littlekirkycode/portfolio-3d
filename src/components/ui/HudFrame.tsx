"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Diegetic HUD wrapper for the floating DOM cards: four CSS corner brackets +
 * a 1px accent border (styles in globals.css). Purely presentational — pass
 * bg/blur/padding via className; pass `accent` to retint the chrome per room.
 */
export default function HudFrame({
  children,
  className = "",
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`hud-frame ${className}`}
      style={accent ? ({ "--hud-accent": accent } as CSSProperties) : undefined}
    >
      <span aria-hidden className="hud-bracket tl" />
      <span aria-hidden className="hud-bracket tr" />
      <span aria-hidden className="hud-bracket bl" />
      <span aria-hidden className="hud-bracket br" />
      {children}
    </div>
  );
}
