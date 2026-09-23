"use client";

import { type BayProps } from "./shared";
import SelfGrowRoom from "./SelfGrowRoom";
import { useNurseryMats, type FeatureSpec, type LampBar } from "./selfgrow/kit";
import { DECK, FeaturePlants, GrowBar, PlantStand, Planters, PlantingDeck, type PlanterSpec } from "./selfgrow/Greenhouse";

/** SelfGrow bay — a calm greenhouse built around one hero. Everything stands
 *  on one planting deck that covers the bay's stock mat (so no piece ever
 *  straddles a rim line): the streak bed + group table (SelfGrowRoom), a
 *  greenhouse corner in the left column (a tall feature plant raised on a
 *  walnut stand under the warm grow bar, a smaller one in front) and one low
 *  bowl at the front right. The feature plants are the streak's week one
 *  fully grown — same procedural leaf, same glazed ceramic, same walnut — so
 *  the room speaks one language. */

const STAND = { x: -3.0, z: 0.22, w: 0.6, d: 0.6, h: 0.16 };

const PLANTERS: PlanterSpec[] = [
  { x: STAND.x, y: STAND.h, z: STAND.z, r: 0.25, h: 0.36 }, // tall feature, on the stand
  { x: -2.9, z: 1.74, r: 0.2, h: 0.27 }, // front-left companion
  { x: 3.02, z: 1.96, r: 0.2, h: 0.19 }, // low bowl, front right
];

const soil = (p: PlanterSpec) => (p.y ?? 0) + p.h - 0.04;

const PLANTS: FeatureSpec[] = [
  { x: PLANTERS[0].x, y: soil(PLANTERS[0]), z: PLANTERS[0].z, height: 1.18, leaves: 26, seed: 11 },
  { x: PLANTERS[1].x, y: soil(PLANTERS[1]), z: PLANTERS[1].z, height: 0.74, leaves: 18, seed: 37, hue: 1 },
  { x: PLANTERS[2].x, y: soil(PLANTERS[2]), z: PLANTERS[2].z, height: 0.48, leaves: 16, seed: 58, hue: -1, spread: 1.35 },
];

/** The grow bar over the left column (room-local, above the deck). */
const BAR: LampBar = { x: -2.98, y: 2.3, z0: -0.3, z1: 1.8, strength: 1 };

export default function SelfGrowBay({ accent, animate, mobile }: BayProps) {
  const mats = useNurseryMats(accent);
  return (
    <group>
      <PlantingDeck mats={mats} />
      <group position-y={DECK.h}>
        <PlantStand {...STAND} mats={mats} />
        <Planters specs={PLANTERS} mats={mats} />
        <FeaturePlants specs={PLANTS} mats={mats} animate={animate} lamp={BAR} />
        <GrowBar bar={BAR} mats={mats} />
        <SelfGrowRoom accent={accent} animate={animate} mobile={mobile} mats={mats} />
      </group>
    </group>
  );
}
