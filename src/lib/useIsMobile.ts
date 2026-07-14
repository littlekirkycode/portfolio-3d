"use client";

import { useSyncExternalStore } from "react";
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

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(MOBILE_MEDIA_QUERY).matches;
// Static export prerender has no viewport — render the desktop variant, the
// same markup a hydrating client shows until React reconciles the snapshot.
const getServerSnapshot = () => false;

/**
 * True on small / coarse-pointer devices (drives the vertical-stack fallback).
 *
 * useSyncExternalStore instead of the useState+useEffect idiom (finding 20):
 * components that mount OUTSIDE hydration — the whole ssr:false canvas tree —
 * now read the real matchMedia value on their FIRST render, so a phone never
 * commits one desktop-variant frame (Rig/Effects/FovFit) before the old
 * effect landed. SSR'd DOM components still hydrate against the server
 * snapshot (false) and reconcile right after — hydration-safe by design.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
