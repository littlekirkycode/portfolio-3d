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
      className="pointer-events-none relative flex h-[900vh] w-full shrink-0 flex-col justify-start px-[8vw] pt-[14vh] md:h-screen md:w-[960vw] md:flex-col md:justify-end md:pt-0 md:py-0 md:pb-[10vh]"
    >
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.35em] text-ink-dim/80">
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
            {project.href && project.href !== "#" && (
              <a href={project.href} className="pointer-events-auto">
                Visit {project.title}
              </a>
            )}
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
    </section>
  );
}
