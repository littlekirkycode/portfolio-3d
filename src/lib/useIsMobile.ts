"use client";

import { useEffect, useState } from "react";
import { BREAKPOINT_MOBILE } from "./constants";

/**
 * THE desktop/mobile gate — single source of truth for every JS layer.
 *
 * These two conditions are exact complements and MUST stay byte-for-byte in
 * sync with the `desktop:` @custom-variant in globals.css. Any structural
 * layout class gated on width-only `md:` while JS gates on these strings
 * re-opens the iPad/landscape-phone bug: desktop CSS (one viewport tall,
 * overflow clipped) with the mobile JS branch (no pin) = unscrollable page.
 */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${BREAKPOINT_MOBILE}px) and (pointer: fine)`;
export const MOBILE_MEDIA_QUERY = `(max-width: ${BREAKPOINT_MOBILE - 1}px), (pointer: coarse)`;

/** True on small / coarse-pointer devices (drives the vertical-stack fallback). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
