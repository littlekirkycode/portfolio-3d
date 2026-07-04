/** Diegetic ship-HUD naming for the nav/progress chrome. The descriptive
 *  SECTIONS labels in constants stay the source of truth for aria text —
 *  these are the in-fiction display names layered on top. */
export const SHIP_SECTION_LABELS: Record<string, string> = {
  hero: "MANIFEST",
  work: "EXHIBITS",
  contact: "BRIDGE",
};

export function shipLabel(id: string | undefined, fallback: string): string {
  return (id && SHIP_SECTION_LABELS[id]) || fallback;
}
