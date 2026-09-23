"use client";

import { useEffect, useRef, useState } from "react";
import { useShipAudio } from "@/lib/useShipAudio";
import { useQualityStore, restoreStoredQuality } from "@/lib/quality";
import { getCapture, onCaptureChange } from "@/lib/capture";
import { useIsMobile } from "@/lib/useIsMobile";
import AchievementToast from "./AchievementToast";
import { track } from "@/lib/analytics";

/**
 * Ship controls — SOUND / GFX / CAPTURE as ONE segmented glass pill in the
 * bottom dock's right slot (was three free-floating chips that collided with
 * the room CTAs). Desktop shows icon + label; phones show icons only (each
 * keeps a full accessible name). Mounted exactly once (useShipAudio is a
 * single-instance hook). Re-renders only on coarse state.
 */

const ICON = {
  width: 15,
  height: 15,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg {...ICON}>
      <path d="M2.5 6.2h2.2L8 3.5v9L4.7 9.8H2.5z" />
      {on ? (
        <>
          <path d="M10.4 6a2.8 2.8 0 0 1 0 4" />
          <path d="M12.3 4.2a5.4 5.4 0 0 1 0 7.6" />
        </>
      ) : (
        <path d="M10.6 6.3l3 3.4M13.6 6.3l-3 3.4" />
      )}
    </svg>
  );
}

function GfxIcon({ lite }: { lite: boolean }) {
  return (
    <svg {...ICON}>
      <path d="M8 2.2l5.3 5.8L8 13.8 2.7 8z" />
      {!lite && <path d="M8 5.3l2.5 2.7L8 10.7 5.5 8z" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg {...ICON}>
      <path d="M2.5 5.5h2.3l1.2-1.8h4l1.2 1.8h2.3v7h-11z" />
      <circle cx="8" cy="8.9" r="2.1" />
    </svg>
  );
}

export default function HudReadout({ readout, compact = false }: { readout: string; compact?: boolean }) {
  const { on, toggle } = useShipAudio();
  const isMobile = useIsMobile();

  // Graphics tier (finding 46): store boots "high" for hydration; the
  // persisted choice is restored once, post-mount.
  const quality = useQualityStore((s) => s.quality);
  const setQuality = useQualityStore((s) => s.setQuality);
  useEffect(() => {
    restoreStoredQuality();
  }, []);
  const lite = quality === "lite";

  // Photo mode (finding 47): the segment appears once Scene registers a
  // capture fn and hides itself for good if a capture ever fails.
  const [capture, setCapture] = useState<"wait" | "ready" | "busy" | "failed">("wait");
  const busyRef = useRef(false);
  useEffect(
    () =>
      onCaptureChange((ready) =>
        setCapture((c) => (c === "failed" || c === "busy" ? c : ready ? "ready" : "wait")),
      ),
    [],
  );

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
      const url = (location.host + location.pathname).replace(/\/$/, "");
      const png = await composePhoto(frame, { readout: `KIRKHAM·01 — ${readout}`, url });
      if (!png) throw new Error("compose failed");
      const slug = readout
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const name = `kirkham-01-${slug || "corridor"}.png`;
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
      setCapture("failed"); // capture isn't working here — hide the segment
    } finally {
      busyRef.current = false;
    }
  };

  const showCapture = capture === "ready" || capture === "busy";

  return (
    <>
      {/* One-shot achievement toast (fired by the drone's 5th-poke payoff). */}
      <AchievementToast />
      <div role="group" aria-label="Ship controls" className={`ui-seg ${compact ? "ui-seg--sm" : ""}`}>
        <button
          type="button"
          data-cursor
          aria-pressed={on}
          aria-label="Sound — ship audio"
          title={on ? "Sound on" : "Sound off"}
          onClick={() => {
            track("sound_toggled", { on: !on });
            toggle();
          }}
          className="ui-hit"
        >
          <SoundIcon on={on} />
          <span className="hidden min-[1180px]:inline">Sound</span>
        </button>

        {/* GFX tier (finding 46) — manual escape hatch for the auto
            escalation; the choice persists and pins the tier. */}
        <button
          type="button"
          data-cursor
          aria-label={lite ? "Lite graphics — switch to cinematic" : "Cinematic graphics — switch to lite"}
          title={lite ? "Graphics: lite" : "Graphics: cinematic"}
          onClick={() => setQuality(lite ? "high" : "lite")}
          className="ui-hit"
        >
          <GfxIcon lite={lite} />
          <span className="hidden min-[1180px]:inline">{lite ? "Lite" : "Cinematic"}</span>
        </button>

        {/* CAPTURE (finding 47) — absent until the scene can deliver a frame. */}
        {showCapture && (
          <button
            type="button"
            data-cursor
            aria-label="Capture — save a framed still of the current view"
            aria-busy={capture === "busy"}
            title="Capture a still"
            onClick={shoot}
            className="ui-hit"
          >
            <span className={capture === "busy" ? "ui-breathe" : undefined}>
              <CaptureIcon />
            </span>
            <span className="hidden min-[1180px]:inline">{capture === "busy" ? "Saving" : "Capture"}</span>
          </button>
        )}
      </div>
    </>
  );
}
