"use client";

import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";

/**
 * Full-screen animated film-grain overlay. The grain texture is an inline
 * SVG feTurbulence data URI tiled as a background; it drifts very slowly
 * (18 s eased transform — no stepped jitter, no opacity flicker). Static
 * when the OS asks to reduce motion.
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

// Slow drift only (was a 0.6 s stepped background jitter — a 10 fps noise
// strobe). Grain now breathes by position over 18 s, eased: still alive, never
// flickering.
const KEYFRAMES = `
@keyframes grainDrift {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(-2%, 1.5%, 0); }
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
          willChange: reduced ? undefined : "transform",
          animation: reduced ? undefined : "grainDrift 18s cubic-bezier(0.65,0,0.35,1) infinite",
        }}
      />
    </>
  );
}
