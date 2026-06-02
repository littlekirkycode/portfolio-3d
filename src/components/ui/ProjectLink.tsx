"use client";

import { AnimatePresence, motion } from "motion/react";
import { useScrollStore } from "@/lib/scrollStore";
import { ROOMS } from "@/components/canvas/hallConfig";

/**
 * A floating "visit" button that appears when the camera is focused on a bay
 * whose project has a real live URL — the clickable link to the actual product.
 * Lives in the DOM (the WebGL canvas is pointer-events:none), driven by the
 * store's coarse `focusedRoom`.
 */
export default function ProjectLink() {
  const id = useScrollStore((s) => s.focusedRoom);
  const room = id ? ROOMS.find((r) => r.id === id) : null;
  const project = room?.project;
  const href = project?.href && project.href !== "#" ? project.href : null;

  return (
    <AnimatePresence mode="wait">
      {project && href && room && (
        <motion.a
          key={room.id}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-cursor
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto fixed bottom-[6vh] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-bg-elev/80 px-6 py-3 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-ink backdrop-blur-md transition-colors hover:border-ink/60"
          style={{ boxShadow: `0 0 26px -10px ${room.accent}` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: room.accent }} aria-hidden />
          Visit {project.title}
          <span aria-hidden>↗</span>
        </motion.a>
      )}
    </AnimatePresence>
  );
}
