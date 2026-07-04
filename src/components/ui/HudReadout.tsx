"use client";

import { useRef } from "react";
import { SECTIONS } from "@/lib/constants";
import { useScrollStore, useShipSection } from "@/lib/scrollStore";
import { ROOMS } from "@/components/canvas/hallConfig";
import { useShipAudio } from "@/lib/useShipAudio";

/**
 * Fixed diegetic readout strip near the progress bar + the SOUND chip.
 * Re-renders only on COARSE store changes (focusedRoom / sectionIndex) — the
 * scrollStore contract forbids per-frame React state, and nothing here needs
 * it. The readout text is decorative flavor (aria-hidden); the sound toggle
 * is a real, labelled button.
 */
export default function HudReadout() {
  const focusedRoom = useScrollStore((s) => s.focusedRoom);
  const sectionIndex = useShipSection();
  const { on, toggle } = useShipAudio();
  const onBridge = sectionIndex === SECTIONS.length - 1;

  // Retain the last visited exhibit between bays so the strip never blanks.
  const last = useRef({ deck: "01", exhibit: "--" });
  if (focusedRoom) {
    const i = ROOMS.findIndex((r) => r.id === focusedRoom);
    if (i >= 0) {
      // Deck boundaries mirror the bulkhead gates: rooms 0–2 | 3–4 (+gallery) | 5–8.
      last.current = {
        deck: i <= 2 ? "01" : i <= 4 ? "02" : "03",
        exhibit: ROOMS[i].index,
      };
    }
  }
  const deck = onBridge ? "03" : last.current.deck;
  const exhibit = last.current.exhibit;
  // On the bridge the strip stops counting exhibits; before the first bay it
  // reads IN TRANSIT instead of a broken-looking "--/09" placeholder.
  const readout = onBridge
    ? "DECK 03 · BRIDGE · GRAVITY NOMINAL · CREW 1"
    : exhibit === "--"
      ? `DECK ${deck} · IN TRANSIT · GRAVITY NOMINAL · CREW 1`
      : `DECK ${deck} · EXHIBIT ${exhibit}/09 · GRAVITY NOMINAL · CREW 1`;

  return (
    <div
      // Desktop: the strip lifts clear of the contact section's footer line
      // while the bridge is framed — otherwise the fixed readout/chip and the
      // panel's bottom chrome (location · gravity · ©) collide into garbled
      // text. Mobile: no lift (it landed the chip mid-card on the bridge);
      // the chip just sits a step higher, above the flowing footer.
      className={`pointer-events-none fixed bottom-24 right-[8vw] z-40 flex items-center gap-4 transition-transform duration-500 ease-out md:bottom-12 ${
        onBridge ? "md:-translate-y-24" : ""
      }`}
    >
      <p
        aria-hidden
        className="hidden items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim md:flex"
      >
        <span className="hud-blink inline-block h-1 w-1 rounded-full bg-accent" />
        <span>{readout}</span>
      </p>

      <button
        type="button"
        data-cursor
        aria-pressed={on}
        aria-label={on ? "Mute ship audio" : "Enable ship audio"}
        onClick={toggle}
        className="pointer-events-auto flex items-center gap-2 border border-line bg-bg-elev/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-dim backdrop-blur-md transition-colors duration-300 hover:border-accent hover:text-ink"
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${on ? "hud-blink bg-accent" : "bg-ink-dim/50"}`}
        />
        SOUND {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}
