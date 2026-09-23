"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { SECTIONS, SITE } from "@/lib/constants";
import { useScrollStore, useShipSection } from "@/lib/scrollStore";
import { useIsMobile } from "@/lib/useIsMobile";
import { shipLabel } from "./hud";

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Fixed top chrome: a glass monogram (left) and a glass section capsule
 * (right) over a soft top scrim, so it reads over any scene. The wrapper is
 * pointer-events-none; only the interactive bits opt back in so the 3D scene
 * stays draggable in the gaps. Active section = the store's display section
 * (coarse state). Navigation is delegated to scrollToSection.
 */
export default function Nav() {
  const isMobile = useIsMobile();
  // Display section (not the raw store index): the BRIDGE item lights up when
  // the camera reaches the bridge, not when the wide DOM panel finally crosses.
  const sectionIndex = useShipSection();
  const menuOpen = useScrollStore((s) => s.menuOpen);
  const showMenu = isMobile && menuOpen;

  const go = (index: number) => {
    useScrollStore.getState().scrollToSection(index);
    useScrollStore.getState().setMenuOpen(false);
  };

  /* Active-item pill (was motion's layoutId shared-layout spring — finding
     49): ONE absolutely-positioned glass pill inside the capsule, gsap-tweened
     to the measured box of the active item on section change. First placement
     (and resizes) snap instantly; changes glide (0.55 s, eased in-out). */
  const navRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);
  const glowPlaced = useRef(false);
  useEffect(() => {
    const place = (animate: boolean) => {
      const nav = navRef.current;
      const glow = glowRef.current;
      const anchor = nav?.querySelector<HTMLElement>(`[data-nav-item="${sectionIndex}"]`);
      if (!nav || !glow || !anchor) return;
      const x = anchor.offsetLeft;
      const y = anchor.offsetTop;
      const width = anchor.offsetWidth;
      const height = anchor.offsetHeight;
      if (animate) {
        gsap.to(glow, { x, y, width, height, duration: 0.55, ease: "power3.inOut", overwrite: "auto" });
      } else {
        // autoAlpha reveals the pill only once it has real coordinates — it
        // starts `invisible` so SSR/first paint never shows it un-placed.
        // overwrite "auto" (R13): a resize mid-glide must KILL the in-flight
        // tween, or it keeps re-interpolating toward a stale target.
        gsap.set(glow, { x, y, width, height, autoAlpha: 1, overwrite: "auto" });
      }
    };
    place(glowPlaced.current);
    glowPlaced.current = true;
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    // Web fonts change item widths after first paint — re-measure once.
    document.fonts?.ready.then(() => place(false)).catch(() => {});
    return () => window.removeEventListener("resize", onResize);
  }, [sectionIndex]);

  return (
    <>
      <header
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between py-5 desktop:py-6"
        style={{ paddingLeft: "var(--ui-gutter)", paddingRight: "var(--ui-gutter)" }}
      >
        {/* Top scrim — mirrors the dock's bottom scrim (same falloff), so
            the chrome reads over a bright ceiling light bar in any bay. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32"
          style={{
            background:
              "linear-gradient(to bottom, rgb(var(--ui-scrim) / 0.86) 0%, rgb(var(--ui-scrim) / 0.6) 40%, rgb(var(--ui-scrim) / 0.2) 72%, transparent 100%)",
          }}
        />

        {/* Monogram → back to intro. Accessible name contains the visible
            "JK" (WCAG 2.5.3). */}
        {/* Desktop: ONE glass capsule (monogram + wordmark) that mirrors the
            section capsule on the right — the wordmark no longer sits bare
            on whatever ceiling light is behind it. Phones: the round
            monogram alone. */}
        <button
          type="button"
          data-cursor
          aria-label={`JK — ${SITE.name}, back to intro`}
          onClick={() => go(0)}
          className="ui-brand group pointer-events-auto flex items-center rounded-full"
        >
          <span className="ui-glass flex h-10 w-10 items-center justify-center !rounded-full font-display text-[16px] leading-none text-[color:var(--ui-ink)] transition-colors duration-300 group-hover:!border-[color:var(--ui-line-strong)] desktop:h-8 desktop:w-8 desktop:text-[14px] desktop:!shadow-none">
            JK<span style={{ color: "var(--hud-accent)" }}>.</span>
          </span>
          <span
            aria-hidden
            className="ui-kicker ml-3 hidden text-[color:var(--ui-ink-2)] transition-colors duration-300 group-hover:text-[color:var(--ui-ink)] desktop:inline-flex"
          >
            Kirkham·01
          </span>
        </button>

        {/* Desktop section capsule (CSS-gated so there's no first-paint flash).
            The visible ship name IS the accessible name (label-in-name), with
            an sr-only descriptive suffix: "MANIFEST — Intro". */}
        <nav
          ref={navRef}
          aria-label="Sections"
          className="ui-glass pointer-events-auto relative hidden h-10 items-center gap-0.5 !rounded-full p-1 desktop:flex"
        >
          {/* sliding active pill — gsap owns x/y/width/height */}
          <span
            ref={glowRef}
            aria-hidden
            className="invisible absolute left-0 top-0 rounded-full border border-[color:var(--ui-line-strong)] bg-[rgb(255_255_255/0.07)]"
          />
          {SECTIONS.map((section, i) => {
            const active = i === sectionIndex;
            return (
              <button
                key={section.id}
                type="button"
                data-cursor
                data-nav-item={i}
                aria-current={active ? "true" : undefined}
                onClick={() => go(i)}
                className="group relative flex h-8 items-center gap-2 rounded-full px-4 font-mono text-micro uppercase tracking-[0.2em] focus-visible:!outline-offset-1"
              >
                <span
                  aria-hidden
                  className={`ui-dot transition-[opacity,scale] duration-500 ${
                    active ? "scale-100 opacity-100" : "scale-50 opacity-0"
                  }`}
                />
                <span
                  className={`transition-colors duration-300 ${
                    active
                      ? "text-[color:var(--ui-ink)]"
                      : "text-[color:var(--ui-ink-3)] group-hover:text-[color:var(--ui-ink)]"
                  }`}
                >
                  {shipLabel(section.id, section.label)}
                </span>
                <span className="sr-only"> — {section.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mobile menu toggle (CSS-gated) — a 44px round glass button. */}
        <button
          type="button"
          data-cursor
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => useScrollStore.getState().toggleMenu()}
          className="ui-glass pointer-events-auto flex h-11 w-11 flex-col items-center justify-center gap-[5px] !rounded-full desktop:hidden"
        >
          <span
            className={`block h-px w-[18px] bg-[color:var(--ui-ink)] transition-transform duration-300 ${
              menuOpen ? "translate-y-[3px] rotate-45" : ""
            }`}
          />
          <span
            className={`block h-px bg-[color:var(--ui-ink)] transition-all duration-300 ${
              menuOpen ? "w-[18px] -translate-y-[3px] -rotate-45" : "w-3 translate-x-[3px]"
            }`}
          />
        </button>
      </header>

      {/* Mobile full-screen overlay menu. Always mounted, CSS-driven:
          visibility transitions discretely at the END of the fade-out, so the
          exit plays and then the hidden overlay drops out of the a11y tree
          and tab order. Item rise uses per-item delay on ENTER only. */}
      <div
        aria-hidden={!showMenu}
        className={`fixed inset-0 z-[45] flex flex-col justify-center bg-[rgb(7_7_10/0.88)] backdrop-blur-xl transition-[opacity,visibility] duration-500 ease-out ${
          showMenu ? "visible opacity-100" : "invisible opacity-0"
        }`}
        style={{ paddingLeft: "var(--ui-gutter)", paddingRight: "var(--ui-gutter)" }}
      >
        <p
          className={`ui-kicker ui-kicker--dash mb-4 transition-opacity duration-500 ${
            showMenu ? "opacity-100" : "opacity-0"
          }`}
        >
          Ship directory
        </p>
        <nav aria-label="Sections" className="flex flex-col">
          {SECTIONS.map((section, i) => {
            const active = i === sectionIndex;
            return (
              <button
                key={section.id}
                type="button"
                data-cursor
                aria-current={active ? "true" : undefined}
                onClick={() => go(i)}
                tabIndex={showMenu ? 0 : -1}
                style={{
                  transitionDelay: showMenu ? `${0.08 + i * 0.07}s` : "0s",
                  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                }}
                // R10: transition `translate`, not `transform` — Tailwind v4's
                // translate-y-* utilities set the independent CSS `translate`.
                className={`flex items-baseline gap-4 border-b border-[color:var(--ui-line)] py-4 text-left transition-[opacity,translate] duration-500 ${
                  showMenu ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
                }`}
              >
                <span className="ui-label w-7 tabular-nums text-[color:var(--ui-ink-3)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {/* Title case in the display serif (the "SelfQuest." /
                    "Let's talk." voice) — all-caps serif read heavy. The
                    accessible name keeps the visible ship name first. */}
                <span
                  className={`font-display text-h1 transition-colors ${
                    active ? "text-[color:var(--ui-ink)]" : "text-[color:var(--ui-ink-2)]"
                  }`}
                >
                  {titleCase(shipLabel(section.id, section.label))}
                  <span
                    aria-hidden
                    className="transition-opacity duration-500"
                    style={{ color: "var(--hud-accent)", opacity: active ? 1 : 0 }}
                  >
                    .
                  </span>
                </span>
                <span aria-hidden className="ui-label ml-auto self-center text-[color:var(--ui-ink-3)]">
                  {section.label}
                </span>
                <span className="sr-only"> — {section.label}</span>
              </button>
            );
          })}
        </nav>

        <div
          style={{ transitionDelay: showMenu ? "0.4s" : "0s" }}
          className={`mt-10 flex flex-col items-start gap-4 transition-opacity duration-500 ${
            showMenu ? "opacity-100" : "opacity-0"
          }`}
        >
          <a
            data-cursor
            href={`mailto:${SITE.email}`}
            tabIndex={showMenu ? 0 : -1}
            className="ui-btn ui-btn--primary max-w-full !normal-case !tracking-[0.06em]"
          >
            <span aria-hidden className="ui-dot" />
            <span className="truncate">{SITE.email}</span>
          </a>
          {/* GitHub / LinkedIn — the phone's only other visible route to
              them besides the bridge chips. */}
          <div className="flex gap-2">
            {SITE.socials.map((s) => (
              <a
                key={s.label}
                data-cursor
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={showMenu ? 0 : -1}
                aria-label={`${s.label} (opens in a new tab)`}
                className="ui-btn"
              >
                {s.label}
                <span aria-hidden className="text-[color:var(--ui-ink-3)]">
                  ↗
                </span>
              </a>
            ))}
          </div>
          <span className="ui-kicker mt-2">{SITE.location}</span>
        </div>
      </div>
    </>
  );
}
