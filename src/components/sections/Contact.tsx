"use client";

import { useRef, type PointerEvent } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { SITE } from "@/lib/constants";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";
import SplitText from "@/components/ui/SplitText";

// Evaluated once at module load — matches the build-time prerender and avoids any
// per-render/hydration divergence at a year boundary.
const YEAR = new Date().getFullYear();

/**
 * Closing panel. A giant display "Let's talk." sits above a magnetic email
 * button that drifts toward the cursor; socials and a footer line (location +
 * copyright) close the journey. Magnetic pull is disabled on touch / reduced
 * motion.
 */
export default function Contact() {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const magnetic = !reduced && !isMobile;

  const btnRef = useRef<HTMLAnchorElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(my, { stiffness: 220, damping: 18, mass: 0.4 });

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (!magnetic) return;
    const r = e.currentTarget.getBoundingClientRect();
    // Pull toward cursor, capped to ~28% of the button extent.
    mx.set(((e.clientX - r.left) / r.width - 0.5) * r.width * 0.28);
    my.set(((e.clientY - r.top) / r.height - 0.5) * r.height * 0.5);
  };

  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <section
      data-section
      data-label="Contact"
      id="contact"
      className="relative flex min-h-screen w-full shrink-0 flex-col justify-center gap-12 px-[8vw] py-24 md:h-screen md:w-screen md:py-0"
    >
      <div className="flex items-center gap-5 font-mono text-[0.7rem] uppercase tracking-[0.35em] text-ink-dim">
        <span className="text-accent">(04)</span>
        <span className="h-px w-12 bg-line" aria-hidden />
        <span>Contact</span>
      </div>

      {/* Giant statement */}
      <h2 className="font-display leading-[0.82] tracking-[-0.02em] text-ink">
        <span className="block overflow-hidden">
          <SplitText
            as="span"
            type="chars"
            text="Let's"
            stagger={0.04}
            riseEm={0.9}
            className="block text-[18vw] md:text-[12vw]"
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
            className="block pl-[0.04em] text-[18vw] italic text-accent md:text-[12vw]"
          />
        </span>
      </h2>

      {/* Magnetic email button + supporting copy */}
      <div className="flex w-full flex-col gap-12 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-8">
          <p className="relative max-w-md text-base leading-relaxed text-ink-dim">
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-x-5 -inset-y-3 -z-10 rounded-lg bg-gradient-to-r from-bg/70 via-bg/30 to-transparent"
            />
            Have a project in mind, or just want to trade ideas? My inbox is
            open.
          </p>

          <motion.a
            ref={btnRef}
            href={`mailto:${SITE.email}`}
            data-cursor
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            style={magnetic ? { x, y } : undefined}
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
          </motion.a>
        </div>

        {/* Socials */}
        <nav aria-label="Social links" className="flex flex-col gap-px md:items-end">
          {SITE.socials.map((s, i) => (
            <motion.a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor
              initial={{ opacity: 0, y: reduced ? 0 : 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.08 }}
              className="group flex items-center gap-3 border-t border-line py-3 font-mono text-sm uppercase tracking-[0.2em] text-ink-dim transition-colors duration-300 hover:text-ink md:w-56 md:justify-end"
            >
              {s.label}
              <span
                aria-hidden
                className="text-accent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              >
                &nearr;
              </span>
            </motion.a>
          ))}
        </nav>
      </div>

      {/* Footer line */}
      <footer className="absolute bottom-[6vh] left-[8vw] right-[8vw] flex items-center justify-between border-t border-line pt-5 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-ink-dim">
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-[8vw] -bottom-[6vh] top-[-3vh] -z-10 bg-gradient-to-t from-bg/85 via-bg/40 to-transparent"
        />
        <span>{SITE.location}</span>
        <span>
          &copy; {YEAR} {SITE.name}
        </span>
      </footer>
    </section>
  );
}
