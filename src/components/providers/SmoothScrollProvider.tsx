"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, registerGsap } from "@/lib/gsap";
import { scrollRefs, pointerRefs, useScrollStore } from "@/lib/scrollStore";
import { DESKTOP_MEDIA_QUERY, MOBILE_MEDIA_QUERY } from "@/lib/useIsMobile";

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

    const { setReady, setSectionIndex, setScrollToSection } =
      useScrollStore.getState();
    // gestureOrientation "both" lets Lenis natively fold horizontal trackpad
    // (deltaX) gestures into its single scroll, which we map to the X translate.
    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      gestureOrientation: "both",
    });
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
    // only on real viewport changes (rotation / width change) — never per event.
    let mobileLimit = 0;

    // ── Lenis → velocity ref + drives ScrollTrigger (desktop) / progress (mobile) ──
    lenis.on("scroll", (e: { velocity?: number; scroll?: number; limit?: number; direction?: number }) => {
      scrollRefs.velocity = e.velocity ?? 0;
      if (mobileMode) {
        const scroll = e.scroll ?? lenis.scroll ?? 0;
        scrollRefs.progress =
          mobileLimit > 0 ? Math.min(1, Math.max(0, scroll / mobileLimit)) : 0;
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

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

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
          scrub: 1,
          invalidateOnRefresh: true,
          onRefresh: () => {
            const panels = gsap.utils.toArray<HTMLElement>("[data-section]", track);
            sectionOffsets = panels.map((p) => p.offsetLeft);
          },
          onUpdate: (self) => {
            scrollRefs.progress = self.progress;
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

      // Expose click-to-section scrolling (maps 1:1 to vertical scroll under the pin).
      const goToSection = (index: number) => {
        const target = sectionOffsets[index] ?? 0;
        lenis.scrollTo(target, { duration: 1.4 });
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
      const measureLimit = () => {
        mobileLimit = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
      };
      measureLimit();
      // seed once in case the user hasn't scrolled yet
      scrollRefs.progress =
        mobileLimit > 0 ? Math.min(1, lenis.scroll / mobileLimit) : 0;
      const measure = () => {
        mobileSectionTops = gsap.utils
          .toArray<HTMLElement>("[data-section]")
          .map((el) => el.getBoundingClientRect().top + lenis.scroll);
      };
      measure();
      // Section tops re-measure on every resize; the progress denominator only
      // on width changes / rotation — an address-bar collapse fires resize with
      // the SAME width, and re-deriving the limit there is exactly the hitch
      // this guards against.
      let lastWidth = window.innerWidth;
      const onResize = () => {
        if (window.innerWidth !== lastWidth) {
          lastWidth = window.innerWidth;
          measureLimit();
        }
        measure();
      };
      const onOrientation = () => {
        lastWidth = window.innerWidth;
        measureLimit();
        measure();
      };
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onOrientation);
      setScrollToSection((index: number) => {
        const sections = gsap.utils.toArray<HTMLElement>("[data-section]");
        const el = sections[index];
        if (el) lenis.scrollTo(el, { duration: 1.2 });
      });
      setReady(true);
      return () => {
        mobileMode = false;
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
