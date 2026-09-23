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
import { playWarpRiser } from "@/lib/useShipAudio";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";
import SplitText from "@/components/ui/SplitText";
import { track } from "@/lib/analytics";

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
 * fxRefs.warp 0→1 (the bridge window's hyperspace streak), fades to the
 * hull's darkness and — hidden inside that cut — snaps the scroll back to
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
    track("depart_pressed");
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;

    if (reduced) {
      // plain scroll home — no warp, no flash
      lenis?.scrollTo(0, { immediate: true });
      fxRefs.warp = 0;
      focusAirlock();
      return;
    }

    departing.current = true;
    // Score the beat (finding 44): the synth riser tracks fxRefs.warp as it
    // ramps below and booms at the flash. Silent no-op unless sound is on.
    playWarpRiser();
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
        // a soft cut into darkness (no white flash) that hides the snap
        el.style.transition = "opacity 260ms cubic-bezier(0.65,0,0.35,1)";
        el.style.opacity = "1";
      }
      timerRef.current = window.setTimeout(() => {
        lenis?.scrollTo(0, { immediate: true });
        fxRefs.warp = 0;
        focusAirlock();
        const el2 = flashRef.current;
        if (el2) {
          el2.style.transition = "opacity 900ms cubic-bezier(0.22,1,0.36,1)";
          el2.style.opacity = "0";
        }
        departing.current = false;
      }, 320);
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
      /* Phones: the statement sits high and the controls sit LOW, just above
         the dock — the bridge's GITHUB / HAIL / LINKEDIN consoles frame the
         middle of a portrait screen and must stay visible between them. */
      className="relative isolate flex min-h-screen w-full shrink-0 flex-col justify-between gap-10 px-[var(--ui-gutter)] pb-40 pt-[20vh] desktop:h-screen desktop:w-screen desktop:justify-center desktop:gap-[4vh] desktop:py-0 desktop:pb-[max(17vh,140px)] desktop:pt-[10vh]"
    >
      {/* Soft left-side shade behind the type column: separates the statement
          and controls from the lit bridge (and the drone docked behind them)
          without a visible card edge. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full desktop:w-[62%]"
        style={{
          background:
            "radial-gradient(120% 70% at 0% 55%, rgb(7 7 10 / 0.62) 0%, rgb(7 7 10 / 0.35) 45%, transparent 75%)",
        }}
      />
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
      <div className="flex w-full flex-col desktop:flex-row desktop:items-end desktop:justify-between desktop:gap-8">
        {/* No copy card here — it sat straight over the bridge kiosks and the
            console row (QA: "the box blocks github linkedin and console").
            The comms flavour lives IN the world now: the HAIL console centre-
            bridge fires the same mailto as the button below. */}
        <div className="flex flex-col gap-3 desktop:gap-[2.5vh]">
          <a
            ref={btnRef}
            href={`mailto:${SITE.email}`}
            data-cursor
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            aria-label={`Email ${SITE.email}`}
            // Desktop width is capped by type size (~330px at 1440): the pill
            // must clear the GITHUB console's x-range beside it.
            className="ui-btn ui-btn--lg ui-btn--primary group w-full max-w-full !justify-between !gap-3 !px-5 !text-label !tracking-[0.08em] !normal-case desktop:w-fit desktop:!justify-center desktop:!gap-4 desktop:!px-6 desktop:!text-body-s desktop:!tracking-[0.06em]"
          >
            <span className="ui-dot transition-transform duration-500 group-hover:scale-150" aria-hidden />
            <span className="min-w-0 truncate font-mono text-[color:var(--ui-ink)]">{SITE.email}</span>
            <span
              aria-hidden
              className="text-[color:var(--ui-ink-2)] transition-transform duration-500 group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </a>

          {/* Socials. The two comms kiosks flanking the bridge console are
              the designed way in on desktop, so there the links are visually
              hidden until keyboard focus reveals each one in place (.ui-social,
              WCAG 2.4.7). On phones the kiosks are too small to be the only
              way to GitHub / LinkedIn, so they are real, visible chips. */}
          <nav aria-label="Social links" className="flex gap-2 desktop:relative desktop:order-last desktop:h-0">
            {SITE.socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor
                aria-label={`${s.label} (opens in a new tab)`}
                className="ui-btn ui-social flex-1 desktop:flex-none"
              >
                {s.label}
                <span aria-hidden className="text-[color:var(--ui-ink-3)]">
                  ↗
                </span>
              </a>
            ))}
          </nav>

          {/* DEPART — spins up the warp streak, fades to the hull's dark,
              returns to the airlock. */}
          <button
            type="button"
            data-cursor
            onClick={onDepart}
            className="ui-btn group w-full desktop:w-fit"
          >
            <span aria-hidden className="ui-dot ui-dot--off transition-colors duration-300 group-hover:bg-[color:var(--hud-accent)]" />
            Initiate departure
            <svg
              aria-hidden
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              className="opacity-70 transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            >
              <path d="M2.5 9.5l7-7M4 2.5h5.5V8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Footer semantics only — the visible © + astronaut CC-BY credit now
          sits in the bottom dock's context slot while the bridge is framed
          (the old absolute footer line collided with the fixed HUD). */}
      <footer className="sr-only">
        <p>
          &copy; {YEAR} {SITE.name}
        </p>
        <p>Astronaut model: PW Wu (CC-BY). Other models: Kenney and Quaternius (CC0).</p>
      </footer>

      {/* departure cut — a soft fade into the hull's dark, never a white
          flash (opacity driven imperatively) */}
      {mounted &&
        createPortal(
          <div ref={flashRef} aria-hidden className="depart-flash" />,
          document.body,
        )}
    </section>
  );
}
