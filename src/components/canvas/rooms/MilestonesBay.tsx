"use client";

import { SpinY } from "../ModelLoader";
import { type BayProps } from "./shared";
import MilestonesRoom from "./MilestonesRoom";
import { Trophy, useFameMats } from "./milestones/kit";
import { Podium, useFameAtlas } from "./milestones/Podium";
import { Vitrine } from "./milestones/Vitrine";
import { Dais, DAIS_H } from "./milestones/Dais";
import { WallPanels } from "./milestones/WallPanels";

/** Milestones bay — a hall of fame.
 *  HERO: the numbers podium (1.3M+ / 100K / 72K in gilt on the risers, a
 *  laurel on the top step) standing on a round honed-stone dais laid over the
 *  bay mat. Supporting, in the left column: the turned-gold cup in a lit
 *  museum vitrine (back) and the Founders Uni medal hung on its stand
 *  (front). Gold only ever appears as real metal or gilt lettering; the
 *  hero is lacquered hull navy + black stone, the supports honed grey stone. The cup's slow turn is the
 *  room's only motion and freezes under reduced motion. */
export default function MilestonesBay({ accent, animate, mobile }: BayProps) {
  const m = useFameMats(accent);
  const atlas = useFameAtlas();
  return (
    <group>
      <Dais m={m} />
      {/* brass picture rail on the left wall above the two exhibits (off-frame on phones) */}
      {!mobile && (
        <group position-x={-3.68} rotation-y={Math.PI / 2}>
          <WallPanels m={m} />
        </group>
      )}

      {/* hero — on the dais; the low-seated laurel stays below the hero
          screen's bottom bezel.
          Mobile: the portrait camera steps in and the panel stacks over the
          centre, so the podium comes forward + down-scaled to sit BELOW it. */}
      <group position={mobile ? [0, DAIS_H, 1.78] : [-0.3, DAIS_H, 0.55]} scale={mobile ? 0.38 : 1}>
        <Podium m={m} tex={atlas} laurel={!mobile} />
      </group>

      {/* the cup, in its vitrine — left column, back */}
      <group position={[-2.62, 0, -0.55]} rotation-y={0.3} scale={1.34}>
        <Vitrine m={m} tex={atlas}>
          <SpinY speed={0.16} animate={animate}>
            <Trophy m={m} />
          </SpinY>
        </Vitrine>
      </group>

      {/* the Founders Uni medal on its stand — left column, front, turned to the dwell camera */}
      <group position={[-2.86, 0, 1.44]} rotation-y={0.42} scale={1.12}>
        <MilestonesRoom m={m} tex={atlas} />
      </group>
    </group>
  );
}
