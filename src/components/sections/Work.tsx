"use client";

import {
  PROJECTS,
  SKILLS,
  EXPERIENCE,
  ACHIEVEMENTS,
  CAPABILITIES_ROOM,
  EXPERIENCE_ROOM,
  ALLIED_ROOM,
  ACHIEVEMENTS_ROOM,
} from "@/lib/constants";

/**
 * Transparent spacer panel. In the pure-3D walkthrough the projects live in the
 * WebGL corridor (see components/canvas/Displays) — you read them on the screens
 * and posters as you travel. This wide, see-through panel just provides the
 * horizontal scroll length to walk the hall, with a faint caption.
 *
 * It also carries a visually-hidden DOM mirror of the corridor's content
 * (projects, skills, experience, milestones) so crawlers and screen readers
 * can reach the portfolio substance that otherwise exists only as WebGL
 * canvas textures inside an aria-hidden wrapper. The mirror is sr-only
 * (absolutely positioned, 1px clip) so it adds ZERO visual footprint — the
 * section's h-[900vh] spacer height drives mobile scroll progress and must
 * stay pixel-identical.
 */
export default function Work() {
  return (
    <section
      data-section
      data-label="The Work"
      id="work"
      className="pointer-events-none relative flex h-[900vh] w-full shrink-0 flex-col justify-start px-[8vw] pt-[14vh] desktop:h-screen desktop:w-[960vw] desktop:flex-col desktop:justify-end desktop:pt-0 desktop:py-0 desktop:pb-[10vh]"
    >
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.35em] text-ink-dim">
        (02) Selected Work — keep scrolling
      </p>

      {/* Crawlable / screen-reader mirror of the WebGL corridor content. */}
      <div className="sr-only">
        <h2>Selected Work</h2>
        {PROJECTS.map((project) => (
          <article key={project.id}>
            <h3>{project.title}</h3>
            <p>
              {project.index} · {project.year} · {project.category}
            </p>
            <p>{project.description}</p>
            {project.metrics && project.metrics.length > 0 && (
              <ul>
                {project.metrics.map((m) => (
                  <li key={m.label}>
                    {m.value} {m.label}
                  </li>
                ))}
              </ul>
            )}
            <ul>
              {project.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        ))}

        <article>
          <h3>{CAPABILITIES_ROOM.title}</h3>
          <p>
            {CAPABILITIES_ROOM.index} · {CAPABILITIES_ROOM.category}
          </p>
          {SKILLS.map((group) => (
            <div key={group.group}>
              <h4>{group.group}</h4>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </article>

        <article>
          <h3>{EXPERIENCE_ROOM.title}</h3>
          <p>
            {EXPERIENCE_ROOM.index} · {EXPERIENCE_ROOM.category}
          </p>
          <ul>
            {EXPERIENCE.map((job) => (
              <li key={`${job.role}-${job.org}`}>
                {job.role} — {job.org} ({job.dates})
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h3>{ALLIED_ROOM.title}</h3>
          <p>
            {ALLIED_ROOM.index} · {ALLIED_ROOM.category}
          </p>
          <p>{ALLIED_ROOM.description}</p>
        </article>

        <article>
          <h3>{ACHIEVEMENTS_ROOM.title}</h3>
          <p>
            {ACHIEVEMENTS_ROOM.index} · {ACHIEVEMENTS_ROOM.category}
          </p>
          <ul>
            {ACHIEVEMENTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>

      {/* The two REAL project links are keyboard tab stops, so they cannot
          live inside the clipped mirror above — the container's overflow
          swallowed their :focus-visible outline entirely (WCAG 2.4.7, R11).
          Same per-link treatment as Contact's socials: each link is its own
          sr-only element that un-clips into a HUD chip while focus-visible.
          Positioned near the panel's top-left — on desktop the focusin
          handler has just parked the camera at this panel's start, and on
          mobile the browser scrolls the (now visible) chip into view. */}
      <nav aria-label="Project links">
        {PROJECTS.filter((p) => p.href && p.href !== "#").map((p) => (
          <a
            key={p.id}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="sr-only pointer-events-auto focus-visible:left-[8vw] focus-visible:top-[22vh] focus-visible:z-50 focus-visible:m-0 focus-visible:h-auto focus-visible:w-auto focus-visible:overflow-visible focus-visible:[clip-path:none] focus-visible:border focus-visible:border-accent focus-visible:bg-bg-elev/90 focus-visible:px-4 focus-visible:py-2 focus-visible:font-mono focus-visible:text-[11px] focus-visible:uppercase focus-visible:tracking-[0.22em] focus-visible:text-ink focus-visible:backdrop-blur-md"
          >
            Visit {p.title}
          </a>
        ))}
      </nav>
    </section>
  );
}
