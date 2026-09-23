"use client";

import { StreakBed } from "./selfgrow/StreakBed";
import { GroupCircle } from "./selfgrow/GroupCircle";
import type { NurseryMats } from "./selfgrow/kit";
import Pokeable from "./Pokeable";

/* ── SelfGrow: habit-breaking with social accountability ─────────────────────
 * A calm nursery built from two ideas:
 *  - THE STREAK (hero): a walnut display bed raked in seven week-terraces,
 *    one seedling planted for every clean day — week one lush at the back,
 *    today's seed front-right under the only lit ring on the bed.
 *  - THE GROUP: five glass cloches on one table, one per challenge member,
 *    joined by a single accent ring — 5/5 checked in.
 * Both stand wholly on the planting deck (SelfGrowBay). Placement respects
 * the sightlines (docs/DESIGN_SYSTEM.md §5): the bed stays under ~0.85 in
 * front of the hero screen; the table sits in the front strip under the
 * info panel's bottom edge. On phones only the bed shows — scaled into the
 * strip between the stacked panel and the HUD, without its plaque. */

export const BED_POS: [number, number, number] = [-1.05, 0, 1.24];
export const CIRCLE_POS: [number, number, number] = [1.8, 0, 1.64];
const BED_POS_MOBILE: [number, number, number] = [0, 0, 1.52];

export default function SelfGrowRoom({
  accent,
  animate,
  mobile,
  mats,
}: {
  accent: string;
  animate: boolean;
  mobile: boolean;
  mats: NurseryMats;
}) {
  return (
    <group>
      <group name="sg-bed" position={mobile ? BED_POS_MOBILE : BED_POS} rotation-y={mobile ? -0.15 : 0} scale={mobile ? 0.44 : 1}>
        <Pokeable spin={false} hop={0.06}>
          <StreakBed accent={accent} mats={mats} animate={animate} plaque={!mobile} />
        </Pokeable>
      </group>
      {!mobile && (
        <group position={CIRCLE_POS} rotation-y={-0.2}>
          <GroupCircle accent={accent} mats={mats} animate={animate} />
        </group>
      )}
    </group>
  );
}
