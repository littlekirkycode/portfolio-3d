"use client";

import { useEffect, useRef, useState } from "react";
import HudFrame from "@/components/ui/HudFrame";

/**
 * Diegetic boot screen shown while the 3D corridor's chunk + assets stream in.
 * Pure DOM — it lives OUTSIDE the canvas and reads drei's `useProgress` store
 * (a plain zustand store fed by THREE.DefaultLoadingManager, so every
 * useGLTF/useTexture load — preloads included — reports here). The store is
 * pulled off the lazy Scene chunk via the promise passed in from SceneCanvas,
 * which keeps drei/three out of the eager bundle.
 *
 * Behaviour contract:
 *  - SERVER-RENDERED VEIL: the overlay's dark backdrop is in the very first
 *    HTML paint (no card yet), so the nav + dock never paint alone on a
 *    black page and then vanish under a late-mounting card. Everything —
 *    corridor, chrome, hero card — is revealed together by ONE fade;
 *  - the card itself never appears if everything resolves within GRACE_MS
 *    (warm cache) — the veil just lifts;
 *  - closes on SHELL readiness (R0): the first time the loading manager goes
 *    active→false the corridor shell has resolved, and the overlay commits to
 *    closing — the staged deferred-prop wave that re-activates the manager
 *    moments later streams into a VISIBLE corridor and must never re-arm or
 *    cancel the close (it used to hold the opaque card up for the full ~1.1 MB
 *    payload on slow connections);
 *  - fades out and UNMOUNTS once closed (instant unmount, no fade, under
 *    prefers-reduced-motion);
 *  - pointer-events-none for its entire life — it can never block the page.
 */

type SceneModule = typeof import("./Scene");

/** Anti-flash gate: don't appear at all if loading finishes inside this. */
const GRACE_MS = 220;
/** Hold the finished frame briefly so 100% doesn't flash past. */
const LINGER_MS = 350;
/** Fade-out length — keep in sync with the duration-[600ms] class below. */
const FADE_MS = 600;
/** After the scene chunk evaluates, how long to wait for any load to start
 *  before concluding there is nothing left to fetch (fully warm session). */
const SETTLE_MS = 500;

/** Once the corridor has been revealed in this JS realm, the boot card must
 *  never come back: a remount (Fast Refresh, an error-boundary reset, a
 *  canvas remount) used to re-run the machine and drop the opaque card over
 *  a live scene for a beat — a full-screen dark flash. */
let bootedOnce = false;

const BOOT_LINES = [
  { at: 35, label: "PRESSURIZING AIRLOCK" },
  { at: 70, label: "CALIBRATING HULL LIGHTING" },
  { at: 96, label: "WAKING MAINTENANCE DRONE" },
] as const;

export default function BootOverlay({
  scene,
}: {
  /** The hoisted Scene-chunk import from SceneCanvas (null during prerender). */
  scene: Promise<SceneModule> | null;
}) {
  // "veil" = the SSR state (dark backdrop, no card). A remount after the
  // reveal starts at "done", so it can never drop the veil over a live scene.
  const [phase, setPhase] = useState<"veil" | "shown" | "fading" | "done">(() =>
    bootedOnce ? "done" : "veil",
  );
  const [cardShown, setCardShown] = useState(false);
  const [pct, setPct] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scene || bootedOnce) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    let unsub: (() => void) | null = null;
    // Effect-local machine state (not React state: read inside timer/store
    // callbacks without re-render races).
    const s = {
      everActive: false,
      active: false,
      chunkReady: false,
      shellDone: false,
      shown: false,
      closing: false,
    };

    const close = () => {
      if (s.closing) return;
      s.closing = true;
      bootedOnce = true;
      unsub?.();
      unsub = null;
      if (reduced) {
        // Reduced motion → no fade, the veil simply lifts.
        setPhase("done");
        return;
      }
      // Card shown or not, the VEIL is up — always lift it with the fade so
      // the corridor + chrome arrive together (never a hard cut). The SSR
      // card may already be on screen through its CSS-delayed entrance
      // (slow hydration): if so it stays and fades WITH the veil; if not it
      // is dropped so it can never start rising inside the fade.
      const el = cardRef.current;
      if (el && parseFloat(getComputedStyle(el).opacity) > 0.02) s.shown = true;
      setCardShown(s.shown);
      if (s.shown) setPct(100);
      setPhase("fading");
      timers.push(window.setTimeout(() => setPhase("done"), FADE_MS));
    };

    // Debounced "are we actually done?". Once the shell wave has cleared the
    // manager (shellDone) the answer is unconditionally yes — the staged
    // deferred-prop wave may already be re-activating the manager, and it
    // must not cancel the close (R0: it streams into a visible corridor).
    const scheduleDoneCheck = (delay: number) => {
      timers.push(
        window.setTimeout(() => {
          if (s.closing) return;
          const looksDone =
            s.shellDone || (s.everActive ? !s.active : s.chunkReady);
          if (looksDone) close();
        }, delay),
      );
    };

    // Anti-flash gate: only materialise if, after the grace period, the shell
    // is still pending (or the chunk hasn't even landed yet). shellDone also
    // short-circuits here: a fast shell followed by an already-active
    // deferred wave must not flash the overlay.
    timers.push(
      window.setTimeout(() => {
        if (s.closing) return;
        if (s.shellDone || (s.everActive && !s.active)) {
          close(); // finished before we ever showed — never flash
          return;
        }
        s.shown = true;
        setCardShown(true);
        setPhase("shown");
      }, GRACE_MS),
    );

    scene.then(
      (m) => {
        if (s.closing) return;
        const store = m.useProgress;
        const apply = (snap: { active: boolean; progress: number }) => {
          if (snap.active) s.everActive = true;
          s.active = snap.active;
          // Monotonic display % — drei's progress can step back when a new
          // wave of items joins the manager mid-flight.
          setPct((p) => Math.max(p, Math.min(100, Math.floor(snap.progress))));
          // First active→false edge = the shell wave cleared. Latch it: the
          // overlay's job is done regardless of any later wave.
          if (s.everActive && !snap.active && !s.shellDone) {
            s.shellDone = true;
            scheduleDoneCheck(LINGER_MS);
          }
        };
        apply(store.getState());
        unsub = store.subscribe(apply);
        s.chunkReady = true;
        scheduleDoneCheck(SETTLE_MS);
      },
      // Chunk failed to load — there is no progress to report; get out of the way.
      () => close(),
    );

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      unsub?.();
    };
  }, [scene]);

  if (phase === "done") return null;

  return (
    <div
      role="status"
      aria-label="Docking — loading ship interior"
      className={`pointer-events-none fixed inset-0 z-[58] flex items-center justify-center bg-bg transition-opacity duration-[600ms] ease-[cubic-bezier(0.65,0,0.35,1)] ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      } ${phase === "veil" ? "boot-veil--ssr" : ""}`}
    >
      {/* The card is SERVER-RENDERED with the veil but enters on a CSS
          delay (0.6 s): a cold load / slow hydration shows it before any JS
          runs (never a blank black page), while a warm load lifts the veil
          before it ever appears. After hydration, `cardShown` owns it. */}
      {(phase === "veil" || cardShown) && (
        <div
          ref={cardRef}
          aria-hidden
          className="w-[min(22rem,86vw)]"
          style={{ animation: `ui-rise 0.5s cubic-bezier(0.22,1,0.36,1) ${cardShown ? "0s" : "0.6s"} both` }}
        >
          <HudFrame solid className="px-6 pb-5 pt-5">
            <p className="ui-kicker ui-kicker--dash text-[color:var(--ui-ink-2)]">KIRKHAM·01 — Docking clearance</p>

            <div className="mt-5 flex items-center gap-4">
              <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-[color:var(--ui-line)]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, color-mix(in srgb, var(--hud-accent) 50%, transparent), var(--hud-accent))",
                  }}
                />
              </div>
              {/* no zero-padding ("000%" read as broken) — fixed width instead */}
              <span className="ui-label min-w-[4ch] text-right tabular-nums text-[color:var(--ui-ink)]">{pct}%</span>
            </div>

            <ul className="mt-5 space-y-2.5">
              {BOOT_LINES.map(({ at, label }) => {
                const lineDone = pct >= at;
                return (
                  <li
                    key={label}
                    className={`ui-kicker flex w-full justify-between gap-6 transition-colors duration-500 ${
                      lineDone ? "text-[color:var(--ui-ink-2)]" : "text-ink-3/60"
                    }`}
                  >
                    <span>{label}</span>
                    <span style={lineDone ? { color: "var(--hud-accent)" } : undefined}>{lineDone ? "OK" : "—"}</span>
                  </li>
                );
              })}
            </ul>
          </HudFrame>
        </div>
      )}
    </div>
  );
}
