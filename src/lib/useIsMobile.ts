"use client";

import { useEffect, useState } from "react";
import { BREAKPOINT_MOBILE } from "./constants";

/** True on small / coarse-pointer devices (drives the vertical-stack fallback). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(
      `(max-width: ${BREAKPOINT_MOBILE - 1}px), (pointer: coarse)`,
    );
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
