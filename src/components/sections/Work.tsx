"use client";

/**
 * Transparent spacer panel. In the pure-3D walkthrough the projects live in the
 * WebGL corridor (see components/canvas/Displays) — you read them on the screens
 * and posters as you travel. This wide, see-through panel just provides the
 * horizontal scroll length to walk the hall, with a faint caption.
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
    </section>
  );
}
