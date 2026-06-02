"use client";

import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";

/**
 * Full-screen animated film-grain overlay. The grain texture is an inline
 * SVG feTurbulence data URI tiled as a background; flicker is achieved by
 * nudging the background-position in stepped keyframes (cheap, GPU-friendly)
 * plus a subtle opacity pulse. Static when the OS asks to reduce motion.
 *
 * pointer-events-none + a fixed full-screen layer means it never blocks input.
 */

// A small tiling turbulence tile, base64-free (URL-encoded) data URI.
const GRAIN_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
    <filter id="g">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#g)"/>
  </svg>`,
)}`;

const KEYFRAMES = `
@keyframes grainShift {
  0%   { background-position: 0 0; }
  10%  { background-position: -5% -10%; }
  20%  { background-position: -15% 5%; }
  30%  { background-position: 7% -25%; }
  40%  { background-position: -5% 25%; }
  50%  { background-position: -15% 10%; }
  60%  { background-position: 15% 0; }
  70%  { background-position: 0 15%; }
  80%  { background-position: 3% 35%; }
  90%  { background-position: -10% 10%; }
  100% { background-position: 0 0; }
}
@keyframes grainFlicker {
  0%, 100% { opacity: 0.06; }
  50%      { opacity: 0.08; }
}`;

export default function Grain() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();

  // Decorative soft-light overlay is a costly full-screen blended repaint; skip
  // it entirely on touch / low-power devices.
  if (isMobile) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[55] [mix-blend-mode:soft-light]"
        style={{
          // Oversize so background-position shifts never reveal edges.
          inset: "-50%",
          width: "200%",
          height: "200%",
          backgroundImage: `url("${GRAIN_SVG}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "160px 160px",
          opacity: 0.07,
          willChange: reduced ? undefined : "background-position, opacity",
          animation: reduced
            ? undefined
            : "grainShift 0.6s steps(6) infinite, grainFlicker 3.2s ease-in-out infinite",
        }}
      />
    </>
  );
}
