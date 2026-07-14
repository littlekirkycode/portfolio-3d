"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { gsap } from "@/lib/gsap";
import { SITE } from "@/lib/constants";
import { fxRefs } from "@/lib/scrollStore";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";
import SplitText from "@/components/ui/SplitText";

// Evaluated once at module load — matches the build-time prerender and avoids any
// per-render/hydration divergence at a year boundary.
const YEAR = new Date().getFullYear();

type LenisLike = {
  scrollTo: (target: number, opts?: { immediate?: boolean; duration?: number }) => void;
};

/** Send keyboard focus back to the top panel after departure. */
function focusAirlock() {
  const hero = document.getElementById("hero");
  if (hero) (hero as HTMLElement).focus({ preventScroll: true });
}

/**
 * Closing panel (the BRIDGE). A giant display "Let's talk." sits above a
 * magnetic email button; below it, the diegetic DEPART control ramps
 * fxRefs.warp 0→1 (the bridge window's hyperspace streak), flashes a
 * white-blue overlay and — hidden inside the flash — snaps the scroll back to
 * the airlock. Reduced motion skips warp/flash for a plain scroll home.
 */
export default function Contact() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const magnetic = !reduced && !isMobile;

  // Magnetic email button: gsap.quickTo follow tweens (was a motion spring,
  // stiffness 220 / damping 18 ≈ near-critically damped ~0.4s settle).
  const btnRef = useRef<HTMLAnchorElement>(null);
  const quick = useRef<{ x: (v: number) => void; y: (v: number) => void } | null>(null);
  useEffect(() => {
    if (!magnetic) return;
    const el = btnRef.current;
    if (!el) return;
    quick.current = {
      x: gsap.quickTo(el, "x", { duration: 0.4, ease: "power3" }),
      y: gsap.quickTo(el, "y", { duration: 0.4, ease: "power3" }),
    };
    return () => {
      quick.current = null;
      gsap.killTweensOf(el);
      gsap.set(el, { x: 0, y: 0 });
    };
  }, [magnetic]);

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (!magnetic || !quick.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    // Pull toward cursor, capped to ~28% of the button extent.
    quick.current.x(((e.clientX - r.left) / r.width - 0.5) * r.width * 0.28);
    quick.current.y(((e.clientY - r.top) / r.height - 0.5) * r.height * 0.5);
  };

  const onLeave = () => {
    quick.current?.x(0);
    quick.current?.y(0);
  };

  /* ── DEPART sequence ─────────────────────────────────────────────────── */
  const flashRef = useRef<HTMLDivElement>(null);
  const departing = useRef(false);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  // The flash must be portaled to <body>: this section sits inside the GSAP
  // translated track, and a transformed ancestor demotes position:fixed to
  // ancestor-relative — the overlay would mis-centre and jump with the snap.
  // Hydration gate via useSyncExternalStore (server snapshot false, client
  // true) — the canonical "is hydrated" idiom, no setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Safety: never leave the warp channel hot if we unmount mid-sequence.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(timerRef.current);
      fxRefs.warp = 0;
    },
    [],
  );

  const onDepart = useCallback(() => {
    if (departing.current) return;
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;

    if (reduced) {
      // plain scroll home — no warp, no flash
      lenis?.scrollTo(0, { immediate: true });
      fxRefs.warp = 0;
      focusAirlock();
      return;
    }

    departing.current = true;
    const start = performance.now();
    const DUR = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      fxRefs.warp = t * t * (3 - 2 * t); // smooth spring-ish ramp, rAF only
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      // warp is at full — flash, and hide the scroll snap inside it
      const el = flashRef.current;
      if (el) {
        el.style.transition = "opacity 90ms ease-in";
        el.style.opacity = "1";
      }
      timerRef.current = window.setTimeout(() => {
        lenis?.scrollTo(0, { immediate: true });
        fxRefs.warp = 0;
        focusAirlock();
        const el2 = flashRef.current;
        if (el2) {
          el2.style.transition = "opacity 300ms ease-out";
          el2.style.opacity = "0";
        }
        departing.current = false;
      }, 140);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [reduced]);

  return (
    /* md sizing is vh-aware: short landscape windows (~900px) used to pile the
       depart button, fine print, socials and footer on top of each other. pt
       clears the fixed nav, pb clears the absolute footer rail, and the
       heading/gaps scale with vh so the flow column always fits between them. */
    <section
      data-section
      data-label="Contact"
      id="contact"
      className="relative flex min-h-screen w-full shrink-0 flex-col justify-center gap-12 px-[8vw] py-24 desktop:h-screen desktop:w-screen desktop:gap-[3.5vh] desktop:py-0 desktop:pb-[14vh] desktop:pt-[10vh]"
    >
      {/* No kicker row — nav, progress rail and HUD readout already all say
          BRIDGE; the finale keeps one statement and two controls, nothing else. */}
      {/* Giant statement */}
      <h2 className="font-display leading-[0.82] tracking-[-0.02em] text-ink">
        <span className="block overflow-hidden">
          <SplitText
            as="span"
            type="chars"
            text="Let's"
            stagger={0.04}
            riseEm={0.9}
            className="block text-[18vw] md:text-[min(12vw,16vh)]"
          />
        </span>
        <span className="block overflow-hidden">
          <SplitText
            as="span"
            type="chars"
            text="talk."
            delay={0.18}
            stagger={0.04}
            riseEm={0.9}
            className="block pl-[0.04em] text-[18vw] italic text-accent md:text-[min(12vw,16vh)]"
          />
        </span>
      </h2>

      {/* Magnetic email button + supporting copy */}
      <div className="flex w-full flex-col gap-12 desktop:flex-row desktop:items-end desktop:justify-between desktop:gap-8">
        {/* No copy card here — it sat straight over the bridge kiosks and the
            console row (QA: "the box blocks github linkedin and console").
            The comms flavour lives IN the world now: the HAIL console centre-
            bridge fires the same mailto as the button below. */}
        <div className="flex flex-col gap-8 desktop:gap-[2.5vh]">
          <a
            ref={btnRef}
            href={`mailto:${SITE.email}`}
            data-cursor
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            className="group relative inline-flex w-fit items-center gap-4 rounded-full border border-line bg-bg-elev/50 px-7 py-4 backdrop-blur-sm transition-colors duration-500 hover:border-accent"
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(120% 140% at 50% 50%, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent 70%)",
              }}
            />
            <span className="relative h-2 w-2 rounded-full bg-accent transition-transform duration-500 group-hover:scale-150" />
            <span className="relative font-mono text-sm uppercase tracking-[0.2em] text-ink md:text-base">
              {SITE.email}
            </span>
            <span
              aria-hidden
              className="relative text-accent transition-transform duration-500 group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </a>

          {/* DEPART — spins up the warp streak, flashes, returns to the airlock.
              No fine print: the button + the flash explain themselves. */}
          <button
            type="button"
            data-cursor
            onClick={onDepart}
            className="group flex w-fit items-center gap-3 border border-line bg-bg-elev/40 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-ink-dim backdrop-blur-sm transition-colors duration-300 hover:border-accent-2 hover:text-ink"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-accent-2 transition-transform duration-300 group-hover:scale-150"
            />
            INITIATE DEPARTURE
            <span
              aria-hidden
              className="text-accent-2 transition-transform duration-500 group-hover:translate-x-1"
            >
              ↗
            </span>
          </button>
        </div>

        {/* Socials live IN THE WORLD — the two comms kiosks flanking the
            bridge console (Corridor's SocialTerminal). Assistive tech and
            crawlers get this hidden equivalent, not an on-screen duplicate.
            Keyboard focus, however, must be VISIBLE (WCAG 2.4.7): while a link
            is focus-visible it un-clips into a HUD-style chip pinned above the
            footer. sr-only keeps position:absolute, so we only undo the 1px
            clip + set coordinates — no cascade fight with `not-sr-only`. */}
        <nav aria-label="Social links">
          {SITE.socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="sr-only focus-visible:bottom-[14vh] focus-visible:right-[8vw] focus-visible:z-50 focus-visible:m-0 focus-visible:h-auto focus-visible:w-auto focus-visible:overflow-visible focus-visible:[clip-path:none] focus-visible:border focus-visible:border-accent focus-visible:bg-bg-elev/90 focus-visible:px-4 focus-visible:py-2 focus-visible:font-mono focus-visible:text-[11px] focus-visible:uppercase focus-visible:tracking-[0.22em] focus-visible:text-ink focus-visible:backdrop-blur-md"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      {/* Footer — one quiet line: © + the astronaut credit (its CC-BY licence
          requires attribution; everything else aboard is CC0 Kenney /
          Quaternius). Location line + hull joke cut, and no gradient scrim:
          two short mono runs read fine over the dark deck. */}
      <footer className="absolute bottom-[6vh] left-[8vw] right-[8vw] flex items-center justify-between border-t border-line pt-5 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-ink-dim">
        <span>
          &copy; {YEAR} {SITE.name}
        </span>
        <span className="hidden md:inline">ASTRONAUT: PW WU (CC-BY)</span>
      </footer>

      {/* white-blue departure flash (opacity driven imperatively) */}
      {mounted &&
        createPortal(
          <div ref={flashRef} aria-hidden className="depart-flash" />,
          document.body,
        )}
    </section>
  );
}
