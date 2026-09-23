"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS } from "@/lib/constants";
import { scrollRefs, useScrollStore, useShipSection } from "@/lib/scrollStore";
import { cameraXAt, GATES, ROOMS, STOP_PROGRESSES } from "@/components/canvas/hallConfig";
import { clamp01 } from "@/lib/math";
import { useIsMobile } from "@/lib/useIsMobile";
import HudReadout from "./HudReadout";
import ProjectLink from "./ProjectLink";
import MobileStops, { goToStop } from "./MobileStops";

/**
 * THE BOTTOM DOCK — one designed instrument instead of stacked widgets.
 *
 *   Row A  [context slot: scroll cue · exhibit tag + VISIT LIVE/DOSSIER · credit]  [DECK 01 · CREW 1]
 *   ─────────────────────────── hairline (the dock's top edge) ─────────────────────────────
 *   Row B  [‹ ›] ────────── the corridor map: one named tick per stop ────────── [sound·gfx·capture]
 *
 * ONE numbering system: the context slot says "Exhibit 01 / 09"; the rail
 * carries position with its ticks (hover a tick → its name, click → glide
 * there). Row B's two ends have FIXED widths, so the rail (and every tick)
 * sits at the same x in every state. (The old section label was dropped —
 * the nav's lit pill already says MANIFEST / EXHIBITS / BRIDGE.)
 *
 * LAYOUT is one CSS grid (.ui-dock in globals.css, named areas), so DOM
 * order is free to be TAB ORDER: the stop pager, then the settled room's
 * actions, then the settings. Press Next, Tab once, and you are on VISIT
 * LIVE for the room the camera just parked at.
 *
 * Phones: Row A is the context slot alone (full width); Row B carries the
 * icon settings, the rail and the stop chevrons.
 *
 * A single rAF loop reads scrollRefs.progress and writes the rail fill +
 * passed-tick state via refs — never setState per frame.
 */

// Rail ticks = every dwell stop between the airlock and the bridge:
// [showreel, slot 0 … slot 9], where slot 5 is the observation gallery
// (GALLERY_SLOT in hallConfig) and the other slots are ROOMS in order.
const TICKS = STOP_PROGRESSES.slice(1, -1);
const GALLERY_SLOT = 5;
type TickMeta = { p: number; kicker: string; name: string; accent?: string };
const TICK_META: TickMeta[] = TICKS.map((p, i) => {
  if (i === 0) return { p, kicker: "Lobby", name: "Showreel" };
  const slot = i - 1;
  if (slot === GALLERY_SLOT) return { p, kicker: "Deck 02", name: "Observation gallery" };
  const room = ROOMS[slot < GALLERY_SLOT ? slot : slot - 1];
  return room
    ? { p, kicker: room.index, name: room.title, accent: room.accent }
    : { p, kicker: "", name: "Stop" };
});

export default function ProgressBar() {
  const fillRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<HTMLDivElement>(null);
  const sectionIndex = useShipSection();
  const focusedRoom = useScrollStore((s) => s.focusedRoom);
  // Deck telemetry — which side of each bulkhead gate the camera is on (the
  // gates ARE the deck boundaries). Derived from scroll position, so a jump
  // straight to the gallery or a transit never shows a stale deck.
  const [deckNo, setDeckNo] = useState(1);
  const isMobile = useIsMobile();
  const total = SECTIONS.length;
  const onBridge = sectionIndex === total - 1;

  useEffect(() => {
    let raf = 0;
    let last = -1;
    let lastPassed = -1;
    const tick = () => {
      const p = clamp01(scrollRefs.progress);
      if (Math.abs(p - last) > 0.0005) {
        if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
        // --p drives the rail's head marker (left: calc(var(--p) * 100%))
        railRef.current?.style.setProperty("--p", p.toFixed(4));
        last = p;
        const cx = cameraXAt(p);
        setDeckNo(1 + GATES.filter((g) => cx > g.x).length); // bails out when unchanged
        // passed-tick count changes only at stop boundaries — cheap guard
        let passed = 0;
        for (const t of TICKS) if (p >= t - 0.004) passed++;
        if (passed !== lastPassed && ticksRef.current) {
          const kids = ticksRef.current.children;
          for (let i = 0; i < kids.length; i++) {
            (kids[i] as HTMLElement).dataset.on = i < passed ? "1" : "0";
          }
          lastPassed = passed;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const roomIndex = focusedRoom ? ROOMS.findIndex((r) => r.id === focusedRoom) : -1;
  const deck = onBridge ? "03" : String(deckNo).padStart(2, "0");
  const telemetry = onBridge
    ? "DECK 03 · BRIDGE · CREW 1"
    : `DECK ${deck} · GRAVITY NOMINAL · CREW 1`;
  // Photo-mode caption (the capture still's corner label).
  const shotLabel = onBridge
    ? "BRIDGE"
    : roomIndex >= 0
      ? `EXHIBIT ${ROOMS[roomIndex].index}/${String(ROOMS.length).padStart(2, "0")}`
      : "IN TRANSIT";

  // Screen-reader summary of where the voyage is (coarse state only).
  const valueText = onBridge
    ? "Bridge — end of the corridor"
    : roomIndex >= 0
      ? `Exhibit ${ROOMS[roomIndex].index} of ${String(ROOMS.length).padStart(2, "0")} — ${ROOMS[roomIndex].title}`
      : sectionIndex === 0
        ? "Airlock — start of the corridor"
        : "In transit";

  return (
    <>
      {/* Bottom scrim — a tall, soft falloff so the dock always sits on
          darkness over a lit bay floor / starfield, without a visible band
          edge. Five stops (eased curve) so there is no Mach band where it
          ends. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-52 desktop:h-56"
        style={{
          background:
            "linear-gradient(to top, rgb(var(--ui-scrim) / 0.94) 0%, rgb(var(--ui-scrim) / 0.84) 26%, rgb(var(--ui-scrim) / 0.58) 50%, rgb(var(--ui-scrim) / 0.26) 74%, rgb(var(--ui-scrim) / 0.08) 90%, transparent 100%)",
        }}
      />

      {/* THE DOCK — one grid, two rows:
            Row A  [now showing: exhibit tag + actions]            [telemetry]
            ────────────────────────── hairline ──────────────────────────
            Row B  [‹ ›] ─────────── corridor map ─────────── [sound·gfx·capture]
          Every control sits on ONE baseline (Row B); Row A is content only,
          so the room's actions are the only pills above the line.
          DOM order = tab order (grid areas place them visually): pager →
          the settled room's VISIT LIVE / DOSSIER → settings. */}
      <div
        className="ui-dock pointer-events-none fixed inset-x-0 bottom-0 z-40"
        style={{
          paddingLeft: "var(--ui-gutter)",
          paddingRight: "var(--ui-gutter)",
          paddingBottom: "calc(14px + var(--ui-safe-b))",
        }}
      >
        <div className="ui-dock__pager">
          {isMobile ? <MobileStops /> : <MobileStops compact />}
        </div>

        <div className="ui-dock__ctx">
          <ProjectLink />
        </div>

        {/* ONE HudReadout instance (single-instance audio hook). The end
            cell has a FIXED width, so the rail never shifts when CAPTURE
            appears. */}
        <div className="ui-dock__end">
          <HudReadout readout={shotLabel} compact={!isMobile} />
        </div>

        <span aria-hidden className="ui-dock__tele ui-label tabular-nums text-ink-3">
          {telemetry}
        </span>

        {/* The dock's edge — a hairline faded at both ends. */}
        <div aria-hidden className="ui-dock__line" />

        {/* Track + fill + named stop ticks + head marker */}
        <div ref={railRef} className="ui-dock__rail relative h-3 min-w-0" style={{ ["--p" as string]: "0" }}>
          <div
            role="progressbar"
            aria-label="Voyage"
            aria-valuetext={valueText}
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong"
          />
          <div
            ref={fillRef}
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 origin-left"
            style={{
              transform: "scaleX(0)",
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--hud-accent) 40%, transparent), var(--hud-accent))",
            }}
          />
          {/* Named ticks: pointer + screen-reader shortcuts (tabIndex -1 —
              the pager is the keyboard route; eleven extra tab stops
              would bury the room actions). */}
          <div ref={ticksRef} className="hidden desktop:block">
            {TICK_META.map((t) => (
              <button
                key={t.p}
                type="button"
                data-on="0"
                data-cursor
                tabIndex={-1}
                aria-label={`Go to ${t.name}`}
                onClick={() => goToStop(t.p)}
                className="ui-rail-tick"
                style={{ left: `${t.p * 100}%`, ...(t.accent ? { ["--tick-accent" as string]: t.accent } : {}) }}
              >
                <span aria-hidden className="ui-rail-tip">
                  <span className="ui-dot" style={t.accent ? { background: t.accent } : undefined} />
                  {t.kicker && <span className="tabular-nums text-ink-3">{t.kicker}</span>}
                  {t.name}
                </span>
              </button>
            ))}
          </div>
          {/* head — where you are, a small lit bead (static glow, no pulse) */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: "calc(var(--p) * 100%)",
              background: "var(--hud-accent)",
              boxShadow:
                "0 0 0 3px color-mix(in srgb, var(--hud-accent) 18%, transparent), 0 0 10px color-mix(in srgb, var(--hud-accent) 55%, transparent)",
            }}
          />
        </div>
      </div>
    </>
  );
}
