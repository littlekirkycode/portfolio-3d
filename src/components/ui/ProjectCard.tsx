"use client";

import { useRef, type PointerEvent } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useInView,
} from "motion/react";
import type { Project } from "@/lib/constants";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useIsMobile } from "@/lib/useIsMobile";

type ProjectCardProps = {
  project: Project;
};

/**
 * A single cinematic project tile.
 *
 * Cover is a gradient built purely from `project.accent` (no images) layered
 * with a film-grain overlay. Hover lifts the card with a subtle pointer-driven
 * 3D tilt + accent glow and slides up the description. Entering view runs a
 * clip-path reveal. Reduced motion / mobile drop the tilt and reveal statically.
 */
export default function ProjectCard({ project }: ProjectCardProps) {
  const reduced = useReducedMotion();
  const isMobile = useIsMobile();
  const ref = useRef<HTMLAnchorElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  // Pointer-relative tilt (normalized -0.5..0.5 across the card).
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [8, -8]), {
    stiffness: 150,
    damping: 18,
  });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), {
    stiffness: 150,
    damping: 18,
  });

  const tiltEnabled = !reduced && !isMobile;

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (!tiltEnabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };

  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  const cover = `linear-gradient(155deg, ${project.accent}, ${project.accent}22 58%, transparent 100%)`;

  return (
    <motion.a
      ref={ref}
      href={project.href}
      data-cursor
      aria-label={`${project.title} — ${project.category}, ${project.year}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      initial={
        reduced
          ? { opacity: 0 }
          : { opacity: 0, clipPath: "inset(0 0 100% 0)" }
      }
      animate={
        inView
          ? reduced
            ? { opacity: 1 }
            : { opacity: 1, clipPath: "inset(0 0 0% 0)" }
          : undefined
      }
      transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={tiltEnabled ? { y: -10 } : undefined}
      style={
        tiltEnabled
          ? {
              rotateX: rx,
              rotateY: ry,
              transformPerspective: 1100,
              transformStyle: "preserve-3d",
            }
          : undefined
      }
      className="group relative flex h-[64vh] w-[78vw] shrink-0 flex-col justify-end overflow-hidden rounded-[1.25rem] border border-line bg-bg-elev/40 p-7 backdrop-blur-[2px] md:h-[68vh] md:w-[34vw] md:p-9"
    >
      {/* Accent gradient cover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-700 group-hover:opacity-95"
        style={{ background: cover }}
      />
      {/* Radial glow that intensifies on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-700 group-hover:opacity-100"
        style={{
          background: `radial-gradient(120% 90% at 30% 12%, ${project.accent}55, transparent 60%)`,
        }}
      />
      {/* Vignette scrim for text legibility */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent"
      />
      {/* Film grain */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light opacity-[0.35]"
        style={{ backgroundImage: GRAIN_DATA_URI, backgroundSize: "180px 180px" }}
      />

      {/* Content */}
      <div
        className="relative flex items-start justify-between"
        style={tiltEnabled ? { transform: "translateZ(40px)" } : undefined}
      >
        <span className="font-mono text-xs tracking-[0.3em] text-ink-dim">
          {project.index}
        </span>
        <span className="font-mono text-xs tracking-[0.3em] text-ink-dim">
          {project.year}
        </span>
      </div>

      <div
        className="relative mt-auto"
        style={tiltEnabled ? { transform: "translateZ(60px)" } : undefined}
      >
        <h3 className="font-display text-5xl leading-[0.95] text-ink md:text-6xl">
          {project.title}
        </h3>
        <p
          className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.3em]"
          style={{ color: project.accent }}
        >
          {project.category}
        </p>

        {/* Description: slides up + fades in on hover (static on touch/reduced). */}
        <div
          className={
            tiltEnabled
              ? "opacity-60 transition-opacity duration-500 ease-out group-hover:opacity-100"
              : "opacity-100"
          }
        >
          <p className="overflow-hidden text-sm leading-relaxed text-ink-dim">
            <span className="mt-4 block max-w-sm">{project.description}</span>
          </p>
        </div>

        <span className="mt-5 inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.3em] text-ink">
          View case
          <span aria-hidden className="transition-transform duration-500 group-hover:translate-x-1">
            &rarr;
          </span>
        </span>
      </div>
    </motion.a>
  );
}

/** Tiny inline SVG fractal-noise grain — no external asset needed. */
const GRAIN_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";
