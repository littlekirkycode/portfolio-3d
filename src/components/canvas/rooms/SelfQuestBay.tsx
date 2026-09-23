"use client";

import { type BayProps } from "./shared";
import SelfQuestRoom, { QUEST_H } from "./SelfQuestRoom";
import { CeilingHolo, LevelUpPod, POD_TOP } from "./selfquest/LevelUpPod";
import { DumbbellRack, FloorDumbbell, LiftingPlatform, TrainingFloor } from "./selfquest/Gear";
import { LootChest } from "./selfquest/LootChest";
import Pokeable from "./Pokeable";

/** SelfQuest bay — the gamified training bay.
 *  Story: the workout builds the hero.
 *   - hero: the Level-Up Pod in the left column — projector pad, the app's
 *     armoured knight (an athlete's body) thrusting a greatsword up at the
 *     moment of level-up, inside a steel level arc whose light channel is the
 *     XP bar — turned to face the corridor;
 *   - the quest log hung from the ceiling above it, smaller and quieter;
 *   - the workout, for real: a two-tier dumbbell rack on a steel-framed
 *     lifting platform, one dumbbell racked out on the floor beside it;
 *   - the reward, for real: the app's loot chest, lid thrown back on a mound
 *     of coins with the Diamond on top — behind + right of the rack
 *     (workout, then reward);
 *   - dark matte rubber floor; the accent lives only in light.
 *  Sightlines: nothing taller than ~0.45 in front of the hero screen or under
 *  the info panel; tall pieces live at x < -2 (left column). */

// pod: forward in the left column, yawed to face the dwell camera
const POD: [number, number, number] = [-2.74, 0.06, 1.05];
const POD_YAW = 0.5;

// phone: the ceiling emitter's point, left of the screen in the clear band
// above the card line (measured: the card hides everything below ~1.9 m)
const MOBILE_HOLO: [number, number, number] = [-1.42, 4, -0.45];

export default function SelfQuestBay({ accent, animate, mobile }: BayProps) {
  if (mobile) {
    // portrait: the camera steps in and the screen + card fill the frame; the
    // hero arrives projected down from a ceiling emitter
    return (
      <group>
        <TrainingFloor accent={accent} />
        <group position={MOBILE_HOLO}>
          <CeilingHolo accent={accent} animate={animate} drop={1.85} />
        </group>
      </group>
    );
  }
  const boardBottom = POD[1] + POD_TOP + 0.16;
  return (
    <group>
      <TrainingFloor accent={accent} />

      <group position={POD} rotation-y={POD_YAW}>
        <Pokeable>
          <LevelUpPod accent={accent} animate={animate} />
        </Pokeable>
      </group>

      {/* quest log hung above the pod, a touch further back (secondary) */}
      <SelfQuestRoom
        accent={accent}
        position={[POD[0] + 0.06, boardBottom + QUEST_H / 2, POD[2] - 0.2]}
        yaw={0.3}
      />

      {/* the workout: a lifting platform on the front strip, the rack yawed
          so it recedes into depth, one dumbbell racked out beside it */}
      <group position={[0.98, 0.06, 1.84]} rotation-y={-0.18}>
        <LiftingPlatform w={2.5} d={1.22} />
        <group position-y={0.008}>
          <DumbbellRack length={1.8} />
        </group>
        <group position={[-1.02, 0.008, 0.46]} rotation-y={0.5}>
          <FloorDumbbell r={0.1} />
        </group>
      </group>

      {/* the reward: the loot chest, behind + right of the rack, turned to
          the corridor */}
      <group position={[3.02, 0.06, 1.6]} rotation-y={-0.46}>
        <LootChest accent={accent} />
      </group>
    </group>
  );
}
