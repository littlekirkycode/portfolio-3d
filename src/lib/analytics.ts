"use client";

import type { PostHog } from "posthog-js";

/**
 * Opt-in product analytics (finding 42) — PostHog, dogfooding the tool already
 * on the Capabilities wall.
 *
 * OFF BY DEFAULT: `NEXT_PUBLIC_POSTHOG_KEY` is inlined at build time; when it
 * is empty (local dev, and CI until the secret is added — see README
 * "Analytics") `analyticsEnabled()` is false, every `track()` call is a no-op,
 * and the posthog-js chunk is never even fetched (it is only reachable behind
 * a dynamic import guarded by the key). Zero network calls, zero cookies.
 *
 * Also hard-respects Do Not Track: DNT visitors are never initialized or
 * captured, key or no key.
 *
 * Event schema (all fired via `track()`):
 *  - bay_focused          { room, dwell_ms }       on LEAVING a focused bay
 *  - max_progress         { max_progress, at_progress }  beacon on pagehide
 *  - project_link_clicked { project, href }        Visit pill
 *  - dossier_opened       { project }              dossier pill
 *  - depart_pressed       {}                       (wired from Contact — TODO)
 *  - sound_toggled        { on }                   (wired from HudReadout — TODO)
 *  - drone_poked          {}                       (wired from Drone — TODO)
 */

export type AnalyticsEvent =
  | "bay_focused"
  | "max_progress"
  | "depart_pressed"
  | "sound_toggled"
  | "drone_poked"
  | "project_link_clicked"
  | "dossier_opened";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/** Max events buffered while the posthog chunk streams in. */
const QUEUE_CAP = 50;

let client: PostHog | null = null;
let loading = false;
const queue: Array<{
  name: AnalyticsEvent;
  props?: AnalyticsProps;
  beacon: boolean;
}> = [];

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return (
    nav.doNotTrack === "1" || win.doNotTrack === "1" || nav.msDoNotTrack === "1"
  );
}

/** True only when a key was baked in at build AND the visitor allows tracking. */
export function analyticsEnabled(): boolean {
  return KEY !== "" && typeof window !== "undefined" && !doNotTrack();
}

function deliver(name: AnalyticsEvent, props?: AnalyticsProps, beacon = false) {
  client?.capture(name, props, beacon ? { transport: "sendBeacon" } : undefined);
}

/**
 * Boot the PostHog client (idempotent; called by AnalyticsProvider and lazily
 * by the first `track()`). Dynamic import keeps posthog-js out of the eager
 * bundle — and unreachable entirely when no key is configured.
 */
export function initAnalytics(): void {
  if (!analyticsEnabled() || client || loading) return;
  loading = true;
  import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        // Curated event set only — no DOM autocapture, no session recording.
        autocapture: false,
        disable_session_recording: true,
        capture_pageview: true,
        // max_progress is our own richer page-leave beacon.
        capture_pageleave: false,
        persistence: "localStorage",
      });
      client = posthog;
      for (const q of queue.splice(0)) deliver(q.name, q.props, q.beacon);
    })
    .catch(() => {
      // Ad-blocked or offline — fail silent forever (queue stays capped).
      loading = false;
    });
}

/**
 * Fire-and-forget event capture. Safe to call from anywhere, any time: it is a
 * literal no-op without a build-time key or under Do Not Track, and buffers
 * until the client is ready otherwise. `beacon: true` sends via sendBeacon —
 * use it for pagehide-time events that must survive the tab closing.
 */
export function track(
  name: AnalyticsEvent,
  props?: AnalyticsProps,
  opts?: { beacon?: boolean },
): void {
  if (!analyticsEnabled()) return;
  if (client) {
    deliver(name, props, opts?.beacon);
    return;
  }
  if (queue.length < QUEUE_CAP) {
    queue.push({ name, props, beacon: !!opts?.beacon });
  }
  initAnalytics();
}
