"use client";

import { useEffect, useRef, useState } from "react";
import { SECTIONS } from "@/lib/constants";
import { useScrollStore, useShipSection } from "@/lib/scrollStore";
import { ROOMS } from "@/components/canvas/hallConfig";
import { useShipAudio } from "@/lib/useShipAudio";
import { useQualityStore, restoreStoredQuality } from "@/lib/quality";
import { getCapture, onCaptureChange } from "@/lib/capture";
import { useIsMobile } from "@/lib/useIsMobile";
import AchievementToast from "./AchievementToast";
import { track } from "@/lib/analytics";

/**
 * Fixed diegetic readout strip near the progress bar + the chip row (SOUND /
 * GFX / CAPTURE). Re-renders only on COARSE store changes (focusedRoom /
 * sectionIndex) — the scrollStore contract forbids per-frame React state, and
 * nothing here needs it. The readout text is decorative flavor (aria-hidden);
 * the chips are real, labelled buttons.
 */

/** Shared chip styling — the invisible before: overlay extends the tap target
 *  to >=44px tall without enlarging the visible chip. */
const CHIP =
  "pointer-events-auto relative flex items-center gap-2 border border-line bg-bg-elev/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim backdrop-blur-md transition-colors duration-300 before:absolute before:inset-x-0 before:-inset-y-2 hover:border-accent hover:text-ink";

export default function HudReadout() {
  const focusedRoom = useScrollStore((s) => s.focusedRoom);
  const sectionIndex = useShipSection();
  const { on, toggle } = useShipAudio();
  const isMobile = useIsMobile();
  const onBridge = sectionIndex === SECTIONS.length - 1;

  // Graphics tier (finding 46): store boots "high" for hydration; the
  // persisted chip choice is restored once, post-mount.
  const quality = useQualityStore((s) => s.quality);
  const setQuality = useQualityStore((s) => s.setQuality);
  useEffect(() => {
    restoreStoredQuality();
  }, []);
  const lite = quality === "lite";

  // Photo mode (finding 47): the chip appears once Scene registers a capture
  // fn (the canvas chunk lands after this mounts) and hides itself for good
  // if a capture ever fails — graceful absence over a broken control.
  const [capture, setCapture] = useState<"wait" | "ready" | "busy" | "failed">("wait");
  const busyRef = useRef(false);
  useEffect(
    () =>
      onCaptureChange((ready) =>
        setCapture((c) =>
          c === "failed" || c === "busy" ? c : ready ? "ready" : "wait",
        ),
      ),
    [],
  );

  // Retain the last visited exhibit between bays so the strip never blanks.
  // State adjusted during render (React's documented "adjust state when props
  // change" pattern) — NOT a ref: mutating/reading a ref mid-render is unsafe
  // under StrictMode/concurrent rendering and was flagged by react-hooks/refs.
  const roomIndex = focusedRoom
    ? ROOMS.findIndex((r) => r.id === focusedRoom)
    : -1;
  const [last, setLast] = useState({ deck: "01", exhibit: "--" });
  // Deck boundaries mirror the bulkhead gates: rooms 0–2 | 3–4 (+gallery) | 5–8.
  const current =
    roomIndex >= 0
      ? {
          deck: roomIndex <= 2 ? "01" : roomIndex <= 4 ? "02" : "03",
          exhibit: ROOMS[roomIndex].index,
        }
      : last;
  if (current.deck !== last.deck || current.exhibit !== last.exhibit) {
    setLast(current);
  }
  const deck = onBridge ? "03" : current.deck;
  const exhibit = current.exhibit;
  // On the bridge the strip stops counting exhibits; before the first bay it
  // reads IN TRANSIT instead of a broken-looking "--/09" placeholder.
  const readout = onBridge
    ? "DECK 03 · BRIDGE · GRAVITY NOMINAL · CREW 1"
    : exhibit === "--"
      ? `DECK ${deck} · IN TRANSIT · GRAVITY NOMINAL · CREW 1`
      : `DECK ${deck} · EXHIBIT ${exhibit}/09 · GRAVITY NOMINAL · CREW 1`;

  const shoot = async () => {
    if (busyRef.current) return;
    const fn = getCapture();
    if (!fn) return;
    busyRef.current = true;
    setCapture("busy");
    try {
      const frame = await fn();
      if (!frame) throw new Error("capture failed");
      const { composePhoto } = await import("@/lib/photoShot");
      const shotReadout = onBridge
        ? "KIRKHAM·01 — BRIDGE"
        : exhibit === "--"
          ? "KIRKHAM·01 — IN TRANSIT"
          : `KIRKHAM·01 — EXHIBIT ${exhibit}/09`;
      const url = (location.host + location.pathname).replace(/\/$/, "");
      const png = await composePhoto(frame, { readout: shotReadout, url });
      if (!png) throw new Error("compose failed");
      const name = onBridge
        ? "kirkham-01-bridge.png"
        : exhibit === "--"
          ? "kirkham-01-corridor.png"
          : `kirkham-01-exhibit-${exhibit}.png`;
      // Mobile: hand the still to the native share sheet when files are
      // shareable. A cancelled sheet is NOT a failure — fall back to saving.
      if (isMobile && typeof navigator.share === "function") {
        const file = new File([png], name, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            setCapture("ready");
            return;
          } catch {}
        }
      }
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(png);
      a.href = objectUrl;
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      setCapture("ready");
    } catch {
      setCapture("failed"); // capture isn't working here — hide the chip
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <>
      {/* One-shot achievement toast (fired by the drone's 5th-poke payoff). */}
      <AchievementToast />
      <div
        // Desktop: the strip lifts clear of the contact section's footer line
        // while the bridge is framed — otherwise the fixed readout/chip and the
        // panel's bottom chrome (location · gravity · ©) collide into garbled
        // text. Mobile: no lift (it landed the chip mid-card on the bridge);
        // the chip just sits a step higher, above the flowing footer.
        // flex-wrap: three chips can two-row on narrow phones instead of
        // spilling off the left edge.
        className={`pointer-events-none fixed bottom-24 right-[8vw] z-40 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 transition-transform duration-500 ease-out desktop:bottom-12 ${
          onBridge ? "desktop:-translate-y-24" : ""
        }`}
      >
        <p
          aria-hidden
          className="hidden items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ink-dim desktop:flex"
        >
          <span className="hud-blink inline-block h-1 w-1 rounded-full bg-accent" />
          <span>{readout}</span>
        </p>

        <button
          type="button"
          data-cursor
          aria-pressed={on}
          aria-label={on ? "Mute ship audio" : "Enable ship audio"}
          onClick={() => {
            track("sound_toggled", { on: !on });
            toggle();
          }}
          className={CHIP}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${on ? "hud-blink bg-accent" : "bg-ink-dim/50"}`}
          />
          SOUND {on ? "ON" : "OFF"}
        </button>

        {/* GFX tier chip (finding 46) — manual escape hatch for the auto
            escalation; the choice persists and pins the tier. */}
        <button
          type="button"
          data-cursor
          aria-pressed={lite}
          aria-label={
            lite ? "Switch to cinematic graphics" : "Switch to lite graphics"
          }
          onClick={() => setQuality(lite ? "high" : "lite")}
          className={CHIP}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${lite ? "bg-ink-dim/50" : "bg-accent-2"}`}
          />
          GFX {lite ? "LITE" : "CINEMATIC"}
        </button>

        {/* CAPTURE chip (finding 47) — absent until the scene can actually
            deliver a frame; disappears permanently on a failed capture. */}
        {(capture === "ready" || capture === "busy") && (
          <button
            type="button"
            data-cursor
            aria-label="Save a framed still of the current view"
            onClick={shoot}
            className={CHIP}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                capture === "busy" ? "hud-blink bg-accent" : "bg-ink-dim/50"
              }`}
            />
            {capture === "busy" ? "SAVING" : "CAPTURE"}
          </button>
        )}
      </div>
    </>
  );
}
