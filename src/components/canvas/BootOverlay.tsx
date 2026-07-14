"use client";

import { useEffect, useState } from "react";
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
 *  - never appears if everything resolves within GRACE_MS (warm cache);
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
/** Fade-out length — keep in sync with the duration-[450ms] class below. */
const FADE_MS = 450;
/** After the scene chunk evaluates, how long to wait for any load to start
 *  before concluding there is nothing left to fetch (fully warm session). */
const SETTLE_MS = 500;

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
  const [phase, setPhase] = useState<"idle" | "shown" | "fading" | "done">("idle");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!scene) return;
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
      unsub?.();
      unsub = null;
      if (!s.shown || reduced) {
        // Never shown (cache hit) → just stay unmounted; reduced motion → no fade.
        setPhase("done");
        return;
      }
      setPct(100);
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

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      role="status"
      aria-label="Docking — loading ship interior"
      className={`pointer-events-none fixed inset-0 z-[58] flex items-center justify-center bg-bg transition-opacity duration-[450ms] ease-out ${
        phase === "fading" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div aria-hidden className="w-[min(21rem,84vw)]">
        <HudFrame className="bg-bg-elev/60 px-6 py-5 backdrop-blur-md">
          <p className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink">
            <span className="hud-blink inline-block h-1 w-1 rounded-full bg-accent" />
            <span>KIRKHAM·01 — DOCKING CLEARANCE</span>
          </p>

          <div className="mt-4 flex items-center gap-3">
            <div className="relative h-px flex-1 bg-line">
              <div
                className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-accent transition-[width] duration-200 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] tabular-nums tracking-[0.22em] text-ink">
              {String(pct).padStart(3, "0")}%
            </span>
          </div>

          <ul className="mt-4 space-y-1.5 font-mono text-[10px] uppercase tracking-[0.22em]">
            {BOOT_LINES.map(({ at, label }) => {
              const lineDone = pct >= at;
              return (
                <li
                  key={label}
                  className={`flex items-center justify-between gap-6 ${
                    lineDone ? "text-ink-dim" : "text-ink-dim/45"
                  }`}
                >
                  <span>{label}</span>
                  <span className={lineDone ? "text-accent" : "hud-blink"}>
                    {lineDone ? "OK" : "· ·"}
                  </span>
                </li>
              );
            })}
          </ul>
        </HudFrame>
      </div>
    </div>
  );
}
