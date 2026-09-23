"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { gsap } from "@/lib/gsap";
import { SITE } from "@/lib/constants";
import { fxRefs, scrollRefs } from "@/lib/scrollStore";
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

/** Copy-the-address button beside the email pill (mailto does nothing for
 *  visitors without a mail client). Announces the result politely. */
function CopyEmail({ className = "", size = "lg" }: { className?: string; size?: "md" | "lg" }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(SITE.email);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${SITE.email}`;
    }
  };
  return (
    <button
      type="button"
      data-cursor
      onClick={onCopy}
      aria-label={copied ? "Email address copied" : "Copy email address"}
      className={`ui-btn ${size === "lg" ? "ui-btn--lg !px-4" : ""} ${className}`}
    >
      <span aria-live="polite" className="min-w-[4.5ch] text-center">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

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

  /* ── arrival fade (desktop) ──────────────────────────────────────────
   * On desktop this panel rides the horizontal track in from the right,
   * which dragged the copy across the bridge consoles on the way. The copy
   * is now pinned at its final spot (counter-translated against the track),
   * stays invisible until the camera has all but arrived, then fades up in
   * place — driven by scroll progress (not time), so it scrubs both ways. */
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-bridge-fade]"));
    const mq = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    let raf = 0;
    let last = -1;
    let lastDx = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = scrollRefs.progress;
      const desk = mq.matches;
      const t = desk ? Math.min(1, Math.max(0, (p - 0.955) / 0.035)) : 1;
      const o = t * t * (3 - 2 * t);
      // pin the copy at its final spot while the track is still sliding the
      // section in (desktop): cancel the section's own x offset
      const dx = desk ? Math.max(0, root.getBoundingClientRect().left) : 0;
      if (Math.abs(o - last) < 0.002 && Math.abs(dx - lastDx) < 0.5) return;
      last = o;
      lastDx = dx;
      for (const el of els) {
        el.style.opacity = String(o);
        el.style.transform = `translate(${-dx}px, ${(1 - o) * 14}px)`;
        el.style.pointerEvents = o < 0.5 ? "none" : "";
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

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
      ref={sectionRef}
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
        data-bridge-fade
        className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full desktop:w-[62%]"
        style={{
          background:
            "radial-gradient(120% 70% at 0% 55%, rgb(7 7 10 / 0.62) 0%, rgb(7 7 10 / 0.35) 45%, transparent 75%)",
        }}
      />
      {/* Comms panel: kicker → statement → pitch → controls. One
          left column, clear of the bridge consoles (the desktop camera slides
          the bridge into the right two-thirds — see Rig bridgeShift). */}
      <div data-bridge-fade className="flex flex-col gap-5 desktop:gap-[3vh]">
        <span className="ui-kicker ui-kicker--dash text-[color:var(--ui-ink-2)]">Comms · open channel</span>

        <h2 className="font-display leading-[0.82] tracking-[-0.02em] text-ink">
          <span className="block overflow-hidden">
            <SplitText
              as="span"
              type="chars"
              text="Let's"
              stagger={0.04}
              riseEm={0.9}
              className="block text-[18vw] md:text-[min(11vw,14.5vh)]"
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
              className="block pl-[0.04em] text-[18vw] italic text-accent md:text-[min(11vw,14.5vh)]"
            />
          </span>
        </h2>

        <p className="max-w-[30ch] text-balance text-lead text-[color:var(--ui-ink-2)] desktop:max-w-[31ch]">
          {/* non-breaking hyphens: never split "solo-built" across lines */}
          {SITE.tagline.replace(/-/g, "‑")}
        </p>

      </div>

      <div data-bridge-fade className="flex w-full flex-col gap-3 desktop:w-fit desktop:gap-[1.6vh]">
        {/* primary: magnetic email pill + copy */}
        <div className="flex w-full gap-2">
          <a
            ref={btnRef}
            href={`mailto:${SITE.email}`}
            data-cursor
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            aria-label={`Email ${SITE.email}`}
            className="ui-btn ui-btn--lg ui-btn--primary group min-w-0 flex-1 !justify-between !gap-3 !px-5 !text-label !tracking-[0.08em] !normal-case desktop:flex-none desktop:!justify-center desktop:!gap-4 desktop:!px-6 desktop:!text-body-s desktop:!tracking-[0.06em]"
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
          <CopyEmail className="hidden desktop:inline-flex" />
        </div>

        {/* secondary: socials + DEPART on one quiet row */}
        <div className="flex flex-wrap gap-2">
          <nav aria-label="Social links" className="contents">
            {SITE.socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor
                aria-label={`${s.label} (opens in a new tab)`}
                className="ui-btn min-w-0 flex-1 desktop:flex-none"
              >
                {s.label}
                <span aria-hidden className="text-[color:var(--ui-ink-3)]">
                  ↗
                </span>
              </a>
            ))}
          </nav>
          {/* phones: Copy joins this row so the email pill keeps full width */}
          <CopyEmail className="min-w-0 flex-1 desktop:hidden" size="md" />
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
