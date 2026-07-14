/** Diegetic ship-HUD naming for the nav/progress chrome. These visible
 *  in-fiction names are PART of each control's accessible name (WCAG 2.5.3
 *  label-in-name: voice-control users say what they see); the descriptive
 *  SECTIONS labels from constants are appended as an sr-only suffix, e.g.
 *  "MANIFEST — Intro". */
export const SHIP_SECTION_LABELS: Record<string, string> = {
  hero: "MANIFEST",
  work: "EXHIBITS",
  contact: "BRIDGE",
};

export function shipLabel(id: string | undefined, fallback: string): string {
  return (id && SHIP_SECTION_LABELS[id]) || fallback;
}
