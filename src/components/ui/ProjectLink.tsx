"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { SECTIONS, SITE } from "@/lib/constants";
import { scrollRefs, useScrollStore, useShipSection } from "@/lib/scrollStore";
import { ROOMS, featureFocusAt, galleryFocusAt } from "@/components/canvas/hallConfig";
import DossierOverlay from "@/components/ui/DossierOverlay";
import ScrollCue from "@/components/ui/ScrollCue";
import { track } from "@/lib/analytics";

/**
 * The bottom dock's CONTEXT SLOT (left of Row A). One place that always says
 * what you're looking at, and carries that thing's actions:
 *
 *   airlock  → the scroll cue
 *   a bay    → exhibit tag (index · title) + VISIT LIVE / DOSSIER for projects
 *              (ONE verb per action, shared with the dossier's footer)
 *   a stop   → the lobby showreel / observation gallery (named, unnumbered)
 *   transit  → a quiet "in transit" line (only after a real 600 ms in transit)
 *   bridge   → the © + astronaut CC-BY credit
 *
 * STATE: `slot.current` IS the settled target — there is no chained
 * exit→enter tween whose completion callback could be killed and leave the
 * slot stuck on a stale room (the old failure: "IN TRANSIT" + the previous
 * accent at the SelfAware stop). A settle swaps current and keeps the old
 * one as an absolutely-positioned, aria-hidden ghost that plays a CSS fade-
 * out (`both` fill — even if the cleanup timer never ran it is invisible and
 * inert). The incoming line plays a CSS rise-in keyed on its generation.
 *
 * Debounce: rooms / bridge / airlock settle after holding 160 ms (focus
 * flickers A→null→B at bay edges); TRANSIT only after holding 600 ms, so a
 * bay→bay walk goes straight Exhibit 01 → Exhibit 02 with one swap.
 *
 * The settled slot's accent is published to :root --hud-accent (a registered
 * <color>, so nav, rail, focus rings and buttons ease between rooms).
 */

type Slot =
  | { kind: "hero" }
  | { kind: "transit" }
  | { kind: "bridge" }
  | { kind: "stop"; stop: Stop }
  | { kind: "room"; roomIndex: number };

type Stop = "showreel" | "gallery";
const STOP_COPY: Record<Stop, { kicker: string; title: string }> = {
  showreel: { kicker: "Lobby", title: "Showreel" },
  gallery: { kicker: "Intermission", title: "Observation gallery" },
};

const keyOf = (s: Slot) =>
  s.kind === "room" ? `room:${s.roomIndex}` : s.kind === "stop" ? `stop:${s.stop}` : s.kind;

/** Which non-room dwell stop the camera is parked on (same 0.85 bar the Rig
 *  uses for room focus). A rAF loop reads the camera playhead ref and sets
 *  state ONLY when the answer changes — coarse, never per frame. */
function useDwellStop(): Stop | null {
  const [stop, setStop] = useState<Stop | null>(null);
  useEffect(() => {
    let raf = 0;
    let last: Stop | null = null;
    const loop = () => {
      const p = scrollRefs.cameraProgress ?? scrollRefs.progress;
      const next: Stop | null =
        featureFocusAt(p) > 0.85 ? "showreel" : galleryFocusAt(p) > 0.85 ? "gallery" : null;
      if (next !== last) {
        last = next;
        setStop(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return stop;
}
const SETTLE_MS = 160;
const TRANSIT_SETTLE_MS = 600;
const GHOST_MS = 280;
const DEFAULT_ACCENT = "#ff5c38";
// The bridge keeps the brand accent: it is the signature "talk." colour and
// reads as the complement of the bridge's blue light.
const BRIDGE_ACCENT = DEFAULT_ACCENT;
const YEAR = new Date().getFullYear();

type SlotState = { current: Slot; ghost: Slot | null; gen: number };

export default function ProjectLink() {
  const focusedRoom = useScrollStore((s) => s.focusedRoom);
  const sectionIndex = useShipSection();
  const onBridge = sectionIndex === SECTIONS.length - 1;
  const roomIndex = focusedRoom ? ROOMS.findIndex((r) => r.id === focusedRoom) : -1;
  const dwellStop = useDwellStop();

  const target: Slot = onBridge
    ? { kind: "bridge" }
    : roomIndex >= 0
      ? { kind: "room", roomIndex }
      : dwellStop
        ? { kind: "stop", stop: dwellStop }
        : sectionIndex === 0
          ? { kind: "hero" }
          : { kind: "transit" };
  const targetKey = keyOf(target);

  const [slot, setSlot] = useState<SlotState>(() => ({ current: target, ghost: null, gen: 0 }));
  const [dossierOpen, setDossierOpen] = useState(false);
  const dossierBtnRef = useRef<HTMLButtonElement>(null);
  const shownKey = keyOf(slot.current);

  // Latest target for the timer callback (written every render, read async).
  const targetRef = useRef<Slot>(target);
  useEffect(() => {
    targetRef.current = target;
  });

  // Settle: a target that HOLDS for its debounce replaces the shown slot.
  // Frozen while the dossier is open (Lenis is stopped anyway).
  useEffect(() => {
    if (dossierOpen || targetKey === shownKey) return;
    const wait = targetKey === "transit" ? TRANSIT_SETTLE_MS : SETTLE_MS;
    const t = window.setTimeout(() => {
      const next = targetRef.current;
      setSlot((s) =>
        keyOf(s.current) === keyOf(next) ? s : { current: next, ghost: s.current, gen: s.gen + 1 },
      );
    }, wait);
    return () => window.clearTimeout(t);
  }, [targetKey, shownKey, dossierOpen]);

  // Drop the ghost once its fade has played (cosmetic only — see header).
  useEffect(() => {
    if (!slot.ghost) return;
    const gen = slot.gen;
    const t = window.setTimeout(
      () => setSlot((s) => (s.gen === gen ? { ...s, ghost: null } : s)),
      GHOST_MS,
    );
    return () => window.clearTimeout(t);
  }, [slot.ghost, slot.gen]);

  const shown = slot.current;

  // Publish the shown room's accent to :root (eased by the registered
  // @property transition in globals.css) — nav, focus rings, rail and
  // buttons all retint together.
  const room = shown.kind === "room" ? ROOMS[shown.roomIndex] : null;
  const accent = room ? room.accent : shown.kind === "bridge" ? BRIDGE_ACCENT : DEFAULT_ACCENT;
  useEffect(() => {
    document.documentElement.style.setProperty("--hud-accent", accent);
  }, [accent]);

  // Portal target for the dialog: the dock uses backdrop-filter, which would
  // otherwise become the containing block of the fixed-position overlay.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const project = room?.project;
  const dossier = project?.dossier ?? null;

  // In-world shortcut: clicking a bay's hero screen (Walls) asks for that
  // bay's dossier. Honoured only when it's the bay the dock is showing.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!dossier || !project || project.id !== id || dossierOpen) return;
      setDossierOpen(true);
      track("dossier_opened", { project: id });
    };
    window.addEventListener("open-dossier", onOpen);
    return () => window.removeEventListener("open-dossier", onOpen);
  }, [dossier, project, dossierOpen]);

  /** One slot's content. `live` = the interactive current slot; the ghost
   *  renders the same markup inert (no refs, no handlers reachable). */
  const renderSlot = (sl: Slot, live: boolean): React.ReactNode => {
    if (sl.kind === "hero") return <ScrollCue label="Scroll to board" />;
    if (sl.kind === "transit")
      return (
        <span aria-hidden className="ui-kicker">
          <span className="ui-dot ui-breathe" />
          In transit
        </span>
      );
    if (sl.kind === "stop") {
      const c = STOP_COPY[sl.stop];
      return (
        <div aria-hidden className="flex flex-col items-start gap-2">
          <span className="ui-kicker ui-kicker--dash">
            {c.kicker}
            <span className="desktop:hidden"> · {c.title}</span>
          </span>
          <span className="hidden font-display text-title text-ink desktop:block">
            {c.title}
            <span style={{ color: "var(--hud-accent)" }}>.</span>
          </span>
        </div>
      );
    }
    if (sl.kind === "bridge")
      return (
        // Phones stack the two credits as lines (no separator left dangling
        // at a wrap); desktop runs them on one line with a hairline slash.
        <p aria-hidden className="ui-kicker flex-col items-start gap-1.5 desktop:flex-row desktop:items-center desktop:gap-3">
          <span>
            &copy; {YEAR} {SITE.name}
          </span>
          <span className="hidden text-line-strong desktop:inline">/</span>
          <span>Astronaut model · PW Wu (CC-BY)</span>
        </p>
      );
    const r = ROOMS[sl.roomIndex];
    const pr = r.project;
    const url = pr?.href && pr.href !== "#" ? pr.href : null;
    const dos = pr?.dossier ?? null;
    return (
      <div className="flex flex-col items-start gap-3 desktop:flex-row desktop:items-center desktop:gap-7">
        {/* exhibit tag — the dock's "now showing". Phones drop the title:
            the in-world card right above already names the room. */}
        <div className="flex flex-col items-start gap-2">
          <span className="ui-kicker ui-kicker--dash tabular-nums">
            Exhibit {r.index}
            <span className="text-ink-3/70"> / {String(ROOMS.length).padStart(2, "0")}</span>
          </span>
          <span className="hidden font-display text-title text-ink desktop:block">
            {r.title}
            <span style={{ color: "var(--hud-accent)" }}>.</span>
          </span>
        </div>

        {(url || dos) && (
          <div className="flex items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor
                tabIndex={live ? undefined : -1}
                aria-label={`Visit live — ${r.title} (opens in a new tab)`}
                className="ui-btn ui-btn--primary ui-hit"
                onClick={live ? () => track("project_link_clicked", { project: pr!.id, href: url }) : undefined}
              >
                <span className="ui-dot" aria-hidden />
                Visit live
                <span aria-hidden className="text-ink-2">
                  ↗
                </span>
              </a>
            )}
            {dos && (
              <button
                ref={live ? dossierBtnRef : undefined}
                type="button"
                data-cursor
                tabIndex={live ? undefined : -1}
                aria-haspopup="dialog"
                aria-label={`Dossier — ${r.title} case study`}
                className={`ui-btn ui-hit ${url ? "" : "ui-btn--primary"}`}
                onClick={
                  live
                    ? () => {
                        setDossierOpen(true);
                        track("dossier_opened", { project: pr!.id });
                      }
                    : undefined
                }
              >
                {!url && <span className="ui-dot" aria-hidden />}
                Dossier
                <svg
                  aria-hidden
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  className="opacity-70"
                >
                  <path d="M2.5 2.5h7v7M9.5 2.5l-7 7" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="pointer-events-none relative min-w-0">
        {slot.ghost && (
          <div
            key={`ghost-${slot.gen}`}
            aria-hidden
            inert
            className="ui-slot-out pointer-events-none absolute bottom-0 left-0 whitespace-nowrap"
          >
            {renderSlot(slot.ghost, false)}
          </div>
        )}
        <div key={`live-${slot.gen}`} data-slot={shownKey} className={slot.gen > 0 ? "ui-slot-in" : undefined}>
          {renderSlot(shown, true)}
        </div>
      </div>

      {mounted &&
        dossierOpen &&
        project &&
        dossier &&
        room &&
        createPortal(
          <DossierOverlay
            project={project}
            accent={room.accent}
            onClose={() => {
              setDossierOpen(false);
              // Focus returns to the trigger (dialog contract).
              requestAnimationFrame(() => dossierBtnRef.current?.focus());
            }}
          />,
          document.body,
        )}
    </>
  );
}
