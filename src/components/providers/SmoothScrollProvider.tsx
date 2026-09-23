"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, registerGsap } from "@/lib/gsap";
import { scrollRefs, pointerRefs, useScrollStore } from "@/lib/scrollStore";
import { DESKTOP_MEDIA_QUERY, MOBILE_MEDIA_QUERY } from "@/lib/useIsMobile";
import {
  BRIDGE_ENTER_P,
  SETTLE_FLICK_CARRY,
  STOP_PROGRESSES,
  dwellSettleTarget,
  nearestParkAhead,
  parkGapAt,
} from "@/components/canvas/hallConfig";

/** Sine ease-in-out: leaves and arrives at rest, and peaks at only ~1.57x its
 *  average speed (cubic in-out peaked at 3x, Lenis's stock expo-OUT launches
 *  at ~7x). Every programmatic page glide uses it; the 3D camera is
 *  choreographed separately over the same duration (Rig, scrollRefs.glide). */
const easeInOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
/** Glide time for a programmatic trip of `frac` of the corridor: ~1.5 s for a
 *  one-stop hop (a 180 deg cross-corridor head turn needs about that to stay
 *  under ~200 deg/s) up to 2.4 s for the whole walk. The scrollTo wrapper
 *  raises any external caller's shorter duration to this. */
const tripDuration = (frac: number) => 1.45 + Math.min(0.95, Math.abs(frac) * 1.4);

/**
 * Fully-horizontal scroll engine.
 *
 * Strategy (see plan): Lenis in default VERTICAL mode smooths the native page
 * scroll; a single GSAP ScrollTrigger PINS the viewport and maps scroll progress
 * to translateX of the horizontal track. This keeps the native scrollbar,
 * keyboard paging and focus-scroll, and collapses cleanly to a vertical stack
 * on mobile (gsap.matchMedia auto-reverts the desktop setup).
 *
 * Per-frame data (progress / velocity / direction / pointer) is written to the
 * plain refs in scrollStore — never React state — so nothing re-renders at 60fps.
 */
export default function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Swallow the benign "ResizeObserver loop" browser error that window
  // resizing fires (R3F + Lenis both observe). Left alone, the Next dev
  // overlay intercepts it and tries to serialise the component tree — which
  // chokes on the THREE scene graph's circular refs and surfaces as a
  // "Converting circular structure to JSON" TypeError on every resize.
  // Dev-only symptom, but noisy enough to guard here.
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      if (typeof e.message === "string" && e.message.includes("ResizeObserver loop")) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("error", onErr, true);
    return () => window.removeEventListener("error", onErr, true);
  }, []);

  useEffect(() => {
    registerGsap();

    const { setReady, setSectionIndex, setScrollToSection, setAtBridge } =
      useScrollStore.getState();

    // Single writer for corridor progress (finding 33): every site that used
    // to assign scrollRefs.progress goes through here, so the coarse atBridge
    // flag is derived exactly where progress is produced — the store setter
    // fires only on threshold crossings, never per frame (frame-data contract).
    let atBridge = false;
    const publishProgress = (p: number) => {
      scrollRefs.progress = p;
      const now = p > BRIDGE_ENTER_P;
      if (now !== atBridge) {
        atBridge = now;
        setAtBridge(now);
      }
    };
    // gestureOrientation "both" lets Lenis natively fold horizontal trackpad
    // (deltaX) gestures into its single scroll, which we map to the X translate.
    //
    // NO `easing`/`duration` here: in Lenis 1.3 either one makes EVERY wheel
    // event restart a fixed-length tween from rest (a single notch moved 0 px
    // in the first 100 ms and trackpad streams piled up into a late lurch).
    // Wheel/trackpad keep the frame-rate independent lerp; programmatic
    // glides get cubic in-out via the scrollTo wrapper below.
    //
    // Reduced motion: no wheel inertia either — the page (and the camera,
    // which Rig maps 1:1 under reduced motion) moves exactly as far as the
    // wheel says, and stops when it stops.
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: !prefersReduced,
      wheelMultiplier: 1,
      gestureOrientation: "both",
    });

    // Scroll px → corridor progress (desktop: the pin trigger's range; mobile:
    // the measured limit). Set by each matchMedia branch below.
    let pxToProgress = (px: number) => (lenis.limit > 0 ? px / lenis.limit : 0);
    let progressToPx = (p: number): number | null => (lenis.limit > 0 ? p * lenis.limit : null);

    // ── scrollTo wrapper (instance-level, so Lenis's own internal calls and
    //    every external caller — MobileStops, deep links, harnesses — pass
    //    through it) ──
    //  - a glide given a `duration` but no `easing` gets sine in-out instead
    //    of Lenis's expo-out lurch, and at least tripDuration();
    //  - the END of a programmatic glide is remembered, so Rig can tell a
    //    one-stop hop from a long trip (scrollRefs.destination). Lenis itself
    //    overwrites targetScroll with the animated value during such glides.
    //  - under REDUCED MOTION every programmatic glide becomes a cut
    //    (immediate): Rig maps the camera 1:1 to scroll there, so an animated
    //    nav jump / hop was a whip pan down the whole corridor;
    //  - every cut bumps scrollRefs.cutSeq, so Rig cuts too instead of
    //    guessing from speed (a frame hitch could make a teleport look slow);
    //  - a glide with a fixed duration is published (scrollRefs.glide) so Rig
    //    can choreograph the camera across exactly the same time.
    type ScrollToOpts = NonNullable<Parameters<Lenis["scrollTo"]>[1]>;
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let glideDest: number | null = null;
    /** Set while the provider itself issues a glide with an exact duration
     *  (the dwell settle), so the minimum trip duration isn't imposed. */
    let exactDuration = false;
    const lenisScrollTo = lenis.scrollTo.bind(lenis);
    lenis.scrollTo = (target: Parameters<Lenis["scrollTo"]>[0], opts: ScrollToOpts = {}) => {
      const o: ScrollToOpts = { ...opts };
      const blocked = (lenis.isStopped || lenis.isLocked) && !o.force;
      if (o.programmatic !== false && !o.immediate && reducedMq.matches) {
        o.immediate = true;
        delete o.duration;
        delete o.easing;
        delete o.lerp;
      }
      const dest =
        typeof target === "number"
          ? Math.min(Math.max(target + (o.offset ?? 0), 0), lenis.limit)
          : null;
      if (o.immediate) {
        glideDest = null;
        scrollRefs.gliding = false;
        if (!blocked && (dest === null || Math.abs(dest - lenis.animatedScroll) > 1)) {
          scrollRefs.cutSeq++;
        }
      } else if (o.programmatic !== false && dest !== null) {
        if (typeof o.duration === "number") {
          const from = pxToProgress(lenis.animatedScroll);
          const to = pxToProgress(dest);
          if (!exactDuration) o.duration = Math.max(o.duration, tripDuration(to - from));
          if (typeof o.easing !== "function") o.easing = easeInOutSine;
          // Re-targeted mid-glide (a second hop / paging press): start the
          // new glide at the page's CURRENT speed instead of from rest, so
          // the page doesn't stop dead and re-accelerate. A cubic Hermite
          // term with slope k at t=0 that vanishes (value and slope) at t=1.
          const dist = dest - lenis.animatedScroll;
          if (glideDest !== null && lenis.isScrolling === "smooth" && Math.abs(dist) > 1) {
            const k = Math.min(2, Math.max(0, (pageV * o.duration) / dist));
            if (k > 0.01) {
              const base = o.easing;
              o.easing = (t: number) => base(t) + k * t * (1 - t) * (1 - t);
            }
          }
          if (!blocked && Math.abs(dest - lenis.animatedScroll) > 0.5) {
            const g = scrollRefs.glide;
            g.seq++;
            g.from = from;
            g.to = Math.min(1, Math.max(0, to));
            g.t0 = performance.now();
            g.dur = o.duration;
          }
        }
        if (!blocked) {
          glideDest = dest;
          scrollRefs.gliding = true;
        }
        const done = o.onComplete;
        o.onComplete = (l: Lenis) => {
          if (glideDest === dest) glideDest = null;
          done?.(l);
        };
      } else {
        glideDest = null;
        scrollRefs.gliding = false;
      }
      lenisScrollTo(target, o);
    };
    // Expose for debugging / programmatic scroll (e.g. screenshot tooling).
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    // ── Pointer (always on): normalize to -1..1 around viewport center ──
    const onPointer = (e: PointerEvent) => {
      pointerRefs.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRefs.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // On mobile there's no pin/translate trigger, so we derive corridor progress
    // straight from Lenis (scroll / limit) here instead of via ScrollTrigger.
    let mobileMode = false;
    // Vertical [data-section] offsets (mobile only) — drives the section label
    // in the progress footer, which ScrollTrigger's onUpdate handles on desktop.
    let mobileSectionTops: number[] = [];
    // Stable progress denominator (mobile only). The live lenis.limit shrinks/
    // grows ~60-100px when the browser address bar auto-hides mid-gesture,
    // which used to jerk the 3D camera. Measured once at setup and re-measured
    // only on real viewport changes (rotation / width change / height-only
    // changes past the address-bar band + fonts settling — see the R8 policy
    // at the mobile onResize handler) — never per event.
    let mobileLimit = 0;

    // ── Lenis → velocity ref + drives ScrollTrigger (desktop) / progress (mobile) ──
    lenis.on("scroll", (e: { velocity?: number; scroll?: number; limit?: number; direction?: number }) => {
      scrollRefs.velocity = e.velocity ?? 0;
      if (mobileMode) {
        const scroll = e.scroll ?? lenis.scroll ?? 0;
        publishProgress(
          mobileLimit > 0 ? Math.min(1, Math.max(0, scroll / mobileLimit)) : 0,
        );
        if (e.direction === 1 || e.direction === -1) scrollRefs.direction = e.direction;
        // Section = last panel whose top has crossed the viewport centre.
        const center = scroll + window.innerHeight / 2;
        let idx = 0;
        for (let i = 0; i < mobileSectionTops.length; i++) {
          if (center >= mobileSectionTops[i]) idx = i;
        }
        if (idx !== lastIndex) {
          lastIndex = idx;
          setSectionIndex(idx);
        }
      } else {
        ScrollTrigger.update();
      }
    });

    // Page speed (px/s), for velocity-matched re-targeted glides.
    let pageV = 0;
    let lastTickT = 0;
    let lastTickScroll = 0;
    const tick = (time: number) => {
      lenis.raf(time * 1000);
      const tNow = performance.now();
      const tdt = (tNow - lastTickT) / 1000;
      if (lastTickT > 0 && tdt > 0 && tdt < 0.25) {
        pageV = (lenis.animatedScroll - lastTickScroll) / tdt;
      }
      lastTickT = tNow;
      lastTickScroll = lenis.animatedScroll;
      // Where the scroll is headed (frame-data ref, read by Rig).
      if (glideDest !== null && lenis.isScrolling !== "smooth") glideDest = null;
      const d = pxToProgress(glideDest ?? lenis.targetScroll);
      scrollRefs.destination = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : scrollRefs.progress;
      scrollRefs.gliding = glideDest !== null;
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // ── Magnetic dwell settle ──
    // When a wheel/trackpad or touch gesture ends MID-CORRIDOR, having
    // travelled at least SETTLE_COMMIT of the way toward the next exhibit,
    // glide the rest of the way into that exhibit's park (hallConfig
    // dwellSettleTarget). Rules that keep it from ever fighting the visitor:
    //  - it only ever CONTINUES the gesture: onward in the direction the
    //    gesture actually moved the page (net, from where it started), never
    //    back toward the park just left — short of the commit point the page
    //    is left exactly where the visitor put it, so repeated small gestures
    //    simply add up;
    //  - armed only by a real wheel/touch gesture — never by keyboard, the
    //    scrollbar, nav jumps, deep links or its own motion;
    //  - fires only once the gesture is over: no input for SETTLE_IDLE_MS
    //    (longer than a careful visitor's gap between notches), no finger
    //    down, and Lenis's wheel easing / touch momentum finished;
    //  - ANY new input cancels it instantly (Lenis is reset so the visitor's
    //    own scroll continues from wherever the glide had reached);
    //  - off under reduced motion, while Lenis is stopped (dossier overlay)
    //    or the menu is open, on the hero and forward along the bridge run.
    const SETTLE_IDLE_MS = 600;
    const SETTLE_QUIET_MS = 160;
    const SETTLE_HANDOFF_PX = 12;
    /** A gesture must move the page at least this far (progress) to count. */
    const SETTLE_MIN_MOVE = 0.003;
    let lastScrollEvent = 0;
    lenis.on("scroll", () => {
      lastScrollEvent = performance.now();
    });
    let settleArmed = false;
    let settling = false;
    let touching = false;
    let lastInput = 0;
    /** Progress where the current gesture began (null = no gesture open). */
    let gestureStartP: number | null = null;
    let settleRaf = 0;
    const cancelSettle = () => {
      if (settling) {
        settling = false;
        glideDest = null;
        // Lenis.reset() (typed private, public at runtime — it is what Lenis
        // itself calls on middle-click / stop()) halts the glide and re-bases
        // target = actual scroll, without the stop()/start() class churn.
        (lenis as unknown as { reset: () => void }).reset();
      }
    };
    const trySettle = () => {
      settleRaf = 0;
      if (!settleArmed) return;
      const now = performance.now();
      // "At rest" = no input for SETTLE_IDLE_MS, no finger down, no Lenis
      // wheel easing in flight, and no scroll event (touch momentum) for
      // SETTLE_QUIET_MS. Lenis's own isScrolling can stay "native" forever
      // after a zero-velocity native event, so it is not trusted for that.
      const easing = lenis.isScrolling === "smooth";
      const easingBusy =
        easing && Math.abs(lenis.targetScroll - lenis.animatedScroll) > SETTLE_HANDOFF_PX;
      const momentumBusy = !easing && now - lastScrollEvent < SETTLE_QUIET_MS;
      if (touching || now - lastInput < SETTLE_IDLE_MS || easingBusy || momentumBusy) {
        settleRaf = requestAnimationFrame(trySettle);
        return;
      }
      settleArmed = false;
      const start = gestureStartP;
      gestureStartP = null;
      if (reducedMq.matches || lenis.isStopped || useScrollStore.getState().menuOpen) return;
      if (start === null) return;
      const p = scrollRefs.progress;
      const moved = p - start;
      if (Math.abs(moved) < SETTLE_MIN_MOVE) return;
      const carried = Math.abs(moved);
      const target = dwellSettleTarget(p, moved > 0 ? 1 : -1, carried);
      if (target === null) return;
      // Belt and braces: never move against a careful gesture (only a long
      // flick that died just past a park may ease back into it).
      if (Math.sign(target - p) !== Math.sign(moved) && carried < SETTLE_FLICK_CARRY) return;
      const px = progressToPx(target);
      if (px === null) return;
      const dist = Math.abs(target - p);
      const gap = Math.max(parkGapAt(p), 1e-3);
      settling = true;
      exactDuration = true;
      lenis.scrollTo(px, {
        // Scaled by how much of the gap (and so of the head turn) is left:
        // ~0.6 s for the last notch, up to ~1.5 s for most of a gap.
        duration: 0.55 + 1.0 * Math.min(1, dist / gap),
        easing: easeInOutSine,
        onComplete: () => {
          settling = false;
        },
      });
      exactDuration = false;
    };
    /** Input seen. `open` (wheel, finger down) starts a new gesture after
     *  SETTLE_IDLE_MS of quiet; a finger LIFT only closes the one it began. */
    const arm = (open: boolean) => {
      const now = performance.now();
      if (open && (gestureStartP === null || now - lastInput > SETTLE_IDLE_MS)) {
        gestureStartP = scrollRefs.progress;
      }
      lastInput = now;
      settleArmed = true;
      if (!settleRaf) settleRaf = requestAnimationFrame(trySettle);
    };
    // Capture phase on window: runs BEFORE Lenis's own wheel listener, so a
    // cancelled glide hands Lenis a fresh target to add the delta to.
    const onWheelInput = (e: WheelEvent) => {
      cancelSettle();
      if (e.ctrlKey) return; // pinch-zoom
      const el = e.target as Element | null;
      if (el?.closest?.("[data-lenis-prevent],[data-lenis-prevent-wheel]")) return;
      arm(true);
    };
    const onTouchStart = () => {
      touching = true;
      cancelSettle();
      arm(true);
    };
    const onTouchEnd = () => {
      touching = false;
      arm(false);
    };
    const onOtherInput = () => {
      cancelSettle();
      settleArmed = false;
      gestureStartP = null;
    };
    window.addEventListener("wheel", onWheelInput, { capture: true, passive: true });
    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("keydown", onOtherInput, { capture: true });
    window.addEventListener("pointerdown", onOtherInput, { capture: true, passive: true });

    // ── Keyboard scrolling through Lenis (desktop) ──
    // Native PageDown/Space/arrows jump the page ~900 px in ONE frame, which
    // the camera can only answer with a snap. Route them through Lenis: the
    // arrows/paging keys ease with the same lerp as the wheel (repeated
    // presses accumulate smoothly); Home/End glide like a nav jump. Keys that
    // belong to a focused control (text fields, sliders, buttons for Space)
    // or an overlay that stopped Lenis are left to the browser.
    const KEY_SKIP =
      'input,textarea,select,[contenteditable],[role="slider"],[role="listbox"],' +
      '[role="menu"],[role="tablist"],[role="dialog"],[data-lenis-prevent],video,audio';
    const onKeyScroll = (e: KeyboardEvent) => {
      // Reduced motion keeps the browser's instant native paging (Rig maps
      // the camera 1:1 to scroll there anyway).
      if (mobileMode || reducedMq.matches) return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (lenis.isStopped || useScrollStore.getState().menuOpen || !(lenis.limit > 0)) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (el && (el.isContentEditable || el.closest(KEY_SKIP))) return;
      const page = window.innerHeight * 0.85;
      let delta = 0;
      let step: 1 | -1 | 0 = 0;
      let to: number | null = null;
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
          delta = 90;
          break;
        case "ArrowUp":
        case "ArrowLeft":
          delta = -90;
          break;
        case "PageDown":
          step = 1;
          break;
        case "PageUp":
          step = -1;
          break;
        case " ":
        case "Spacebar":
          if (el?.closest('button,a[href],summary,label,[role="button"]')) return;
          step = e.shiftKey ? -1 : 1;
          break;
        case "Home":
          to = 0;
          break;
        case "End":
          to = lenis.limit;
          break;
        default:
          return;
      }
      if (step !== 0) {
        // Paging keys = one exhibit per press: a choreographed glide to the
        // next / previous dwell stop (a page-sized lerp used to strand the
        // camera just short of a park with the head still 30 deg off).
        // Counted from where a glide already in flight is HEADED, so
        // repeated presses queue stop after stop.
        const base = scrollRefs.gliding ? scrollRefs.destination : scrollRefs.progress;
        const stop =
          step > 0
            ? STOP_PROGRESSES.find((q) => q > base + 0.004)
            : [...STOP_PROGRESSES].reverse().find((q) => q < base - 0.004);
        const px = stop === undefined ? null : progressToPx(stop);
        if (px === null) {
          delta = step * page;
        } else {
          to = px;
        }
      }
      e.preventDefault();
      if (to !== null) {
        lenis.scrollTo(to, { duration: tripDuration((to - lenis.scroll) / lenis.limit) });
      } else {
        // programmatic:false = a user gesture: Lenis keeps targetScroll as the
        // real destination, so held/repeated keys add up like wheel notches.
        lenis.scrollTo(lenis.targetScroll + delta, { programmatic: false, lerp: 0.1 });
      }
    };
    window.addEventListener("keydown", onKeyScroll);

    let sectionOffsets: number[] = [];
    let lastIndex = -1;

    const mm = gsap.matchMedia();

    // ── DESKTOP: pin + horizontal translate ──
    // Condition string is shared with useIsMobile + the `desktop:` CSS variant
    // so JS behavior and structural CSS can never disagree (see useIsMobile.ts).
    mm.add(DESKTOP_MEDIA_QUERY, () => {
      const track = trackRef.current!;
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: pinRef.current!,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          // Lenis already smooths the scroll; a long scrub tail (was 1 s)
          // left the hero/contact panels creeping on after the camera had
          // parked. 0.5 s keeps them in step with the camera's spring.
          scrub: 0.5,
          invalidateOnRefresh: true,
          onRefresh: () => {
            const panels = gsap.utils.toArray<HTMLElement>("[data-section]", track);
            sectionOffsets = panels.map((p) => p.offsetLeft);
          },
          onUpdate: (self) => {
            publishProgress(self.progress);
            scrollRefs.direction = self.direction as 1 | -1;
            const center = self.progress * distance() + window.innerWidth / 2;
            let idx = 0;
            for (let i = 0; i < sectionOffsets.length; i++) {
              if (center >= sectionOffsets[i]) idx = i;
            }
            if (idx !== lastIndex) {
              lastIndex = idx;
              setSectionIndex(idx);
            }
          },
        },
      });

      // Corridor progress <-> page scroll under the pin (the trigger's range).
      const st = tween.scrollTrigger!;
      pxToProgress = (px) => {
        const span = st.end - st.start;
        return span > 0 ? (px - st.start) / span : 0;
      };
      progressToPx = (p) => {
        const span = st.end - st.start;
        return span > 0 ? st.start + p * span : null;
      };

      // Expose click-to-section scrolling (maps 1:1 to vertical scroll under the pin).
      const goToSection = (index: number) => {
        let target = sectionOffsets[index] ?? 0;
        // A section's left edge can land mid-corridor (The Work starts at
        // p≈0.094, just short of the showreel park): land on the park
        // instead, so a nav jump always ends on a composed view.
        const p = pxToProgress(target);
        // Always the first park AT OR AFTER the section's start, whichever way
        // the trip runs (travelling back, dir -1 landed The Work on the
        // airlock / hero).
        const park = nearestParkAhead(p, 1);
        const parkPx = park === null ? null : progressToPx(park);
        if (parkPx !== null) target = parkPx;
        // Longer trips get a little more time (~1.5 s to 2.4 s across the
        // whole walk); Rig choreographs the camera over the same duration and
        // looks down the corridor on long trips.
        const frac = lenis.limit > 0 ? (target - lenis.scroll) / lenis.limit : 0;
        lenis.scrollTo(target, { duration: tripDuration(frac), easing: easeInOutSine });
      };
      setScrollToSection(goToSection);

      // Keyboard-focus sync. The pin wrapper is overflow-x:clip (not hidden),
      // so a Tab press can no longer silently scroll it out from under the
      // translate. Instead, when focus lands in an off-screen panel we drive
      // the REAL scroll pipeline to that panel's section, keeping the DOM,
      // the 3D camera and the progress HUD in agreement (this also carries
      // Work's sr-only project links, which sit at the panel's start).
      const onFocusIn = (e: FocusEvent) => {
        const el = e.target as HTMLElement | null;
        const panel = el?.closest<HTMLElement>("[data-section]");
        if (!el || !panel) return;
        // Undo any focus-scroll the browser managed on other ancestors (the
        // viewport can still be nudged horizontally via body overflow-x).
        const doc = document.scrollingElement;
        if (doc && doc.scrollLeft !== 0) doc.scrollLeft = 0;
        if (pinRef.current && pinRef.current.scrollLeft !== 0) {
          pinRef.current.scrollLeft = 0;
        }
        // Fully on screen already (e.g. clicking a control in the active
        // panel) — nothing to sync.
        const r = el.getBoundingClientRect();
        if (
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= window.innerWidth &&
          r.bottom <= window.innerHeight
        ) {
          return;
        }
        const panels = gsap.utils.toArray<HTMLElement>("[data-section]", track);
        const index = panels.indexOf(panel);
        if (index >= 0) goToSection(index);
      };
      track.addEventListener("focusin", onFocusIn);

      setReady(true);
      return () => {
        pxToProgress = (px) => (lenis.limit > 0 ? px / lenis.limit : 0);
        progressToPx = (p) => (lenis.limit > 0 ? p * lenis.limit : null);
        track.removeEventListener("focusin", onFocusIn);
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });

    // ── MOBILE / coarse: vertical stack, no pin. Progress comes from Lenis
    //    directly (see the scroll handler above) — walking the corridor by
    //    scrolling down the tall page. ──
    mm.add(MOBILE_MEDIA_QUERY, () => {
      mobileMode = true;
      let disposed = false;
      const measureLimit = () => {
        mobileLimit = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
      };
      measureLimit();
      pxToProgress = (px) => (mobileLimit > 0 ? px / mobileLimit : 0);
      progressToPx = (p) => (mobileLimit > 0 ? p * mobileLimit : null);
      // seed once in case the user hasn't scrolled yet
      publishProgress(mobileLimit > 0 ? Math.min(1, lenis.scroll / mobileLimit) : 0);
      const measure = () => {
        mobileSectionTops = gsap.utils
          .toArray<HTMLElement>("[data-section]")
          .map((el) => el.getBoundingClientRect().top + lenis.scroll);
      };
      measure();
      // Section tops re-measure on every resize. The progress denominator is
      // stickier (R8 policy):
      //  - width change / rotation → re-measure immediately (unchanged);
      //  - height-ONLY change ≤ HEIGHT_JITTER_PX → ignore. That band covers
      //    every mobile address-bar collapse/expand (~56-114px across Chrome
      //    Android / iOS Safari / Samsung Internet), which fires resize with
      //    the SAME width mid-gesture — re-deriving the limit there is
      //    exactly the camera hitch this guard exists for. A stale
      //    denominator of ≤140px on a multi-thousand-px page is ≤ ~2%
      //    progress error;
      //  - height-only change > HEIGHT_JITTER_PX (Android split-screen
      //    roughly HALVES the height; desktop-window height drags on
      //    coarse-pointer setups run to hundreds of px) → re-measure once
      //    the burst settles (HEIGHT_SETTLE_MS), so a live drag re-measures
      //    once at the final layout instead of jerking per event. Without
      //    this, published progress could cap near 0.5 (bridge unreachable)
      //    or peg to 1.0 halfway down, permanently.
      const HEIGHT_JITTER_PX = 140;
      const HEIGHT_SETTLE_MS = 250;
      let lastWidth = window.innerWidth;
      let lastHeight = window.innerHeight;
      let settleTimer = 0;
      const remeasure = () => {
        lastWidth = window.innerWidth;
        lastHeight = window.innerHeight;
        measureLimit();
        measure();
        // Re-publish so the camera/HUD correct even before the next scroll event.
        publishProgress(
          mobileLimit > 0 ? Math.min(1, Math.max(0, lenis.scroll / mobileLimit)) : 0,
        );
      };
      const onResize = () => {
        if (window.innerWidth !== lastWidth) {
          window.clearTimeout(settleTimer);
          remeasure();
        } else if (Math.abs(window.innerHeight - lastHeight) > HEIGHT_JITTER_PX) {
          window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(remeasure, HEIGHT_SETTLE_MS);
        }
        measure();
      };
      const onOrientation = () => {
        window.clearTimeout(settleTimer);
        remeasure();
      };
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onOrientation);
      // Post-boot layout growth fires NO resize event (webfonts settling can
      // change the flowing stack's scrollHeight): re-derive the denominator
      // once fonts land — desktop gets this via the global fonts.ready →
      // ScrollTrigger.refresh() below, mobile needs its own hook. Happens at
      // boot (progress ≈ 0), so the one-off correction is invisible.
      if (typeof document !== "undefined" && "fonts" in document) {
        document.fonts.ready
          .then(() => {
            if (!disposed) remeasure();
          })
          .catch(() => {});
      }
      setScrollToSection((index: number) => {
        const sections = gsap.utils.toArray<HTMLElement>("[data-section]");
        const el = sections[index];
        if (!el) return;
        const top = Math.min(
          Math.max(0, el.getBoundingClientRect().top + lenis.scroll),
          lenis.limit,
        );
        const frac = mobileLimit > 0 ? (top - lenis.scroll) / mobileLimit : 0;
        lenis.scrollTo(top, { duration: tripDuration(frac), easing: easeInOutSine });
      });
      setReady(true);
      return () => {
        mobileMode = false;
        pxToProgress = (px) => (lenis.limit > 0 ? px / lenis.limit : 0);
        progressToPx = (p) => (lenis.limit > 0 ? p * lenis.limit : null);
        disposed = true;
        window.clearTimeout(settleTimer);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onOrientation);
        mobileSectionTops = [];
      };
    });

    // Re-measure once fonts/images settle (layout shifts change scrollWidth).
    const refresh = () => ScrollTrigger.refresh();
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(refresh).catch(() => {});
    }
    window.addEventListener("load", refresh);

    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("load", refresh);
      window.removeEventListener("wheel", onWheelInput, { capture: true });
      window.removeEventListener("touchstart", onTouchStart, { capture: true });
      window.removeEventListener("touchend", onTouchEnd, { capture: true });
      window.removeEventListener("touchcancel", onTouchEnd, { capture: true });
      window.removeEventListener("keydown", onOtherInput, { capture: true });
      window.removeEventListener("pointerdown", onOtherInput, { capture: true });
      window.removeEventListener("keydown", onKeyScroll);
      cancelAnimationFrame(settleRaf);
      gsap.ticker.remove(tick);
      mm.revert();
      lenis.destroy();
    };
  }, []);

  return (
    /* overflow CLIP, not hidden: a hidden box is still programmatically
       scrollable, so the browser's bring-into-view on Tab used to jump
       scrollLeft ~16k px and desync the track from ScrollTrigger. clip is not
       scrollable at all. Both axes must be clip — per the CSS overflow spec,
       pairing clip with hidden computes the clip axis back to hidden. */
    <div
      ref={pinRef}
      className="relative z-10 w-full overflow-x-clip overflow-y-clip desktop:h-screen"
    >
      <div
        ref={trackRef}
        className="flex w-full flex-col desktop:h-screen desktop:w-max desktop:flex-row desktop:flex-nowrap"
      >
        {children}
      </div>
    </div>
  );
}
