"use client";

import { type BayProps } from "./shared";
import ExperienceRoom, { LAMP_AT } from "./ExperienceRoom";
import NowLamp from "./experience/NowLamp";
import Vitrine from "./experience/Vitrine";
import Pokeable from "./Pokeable";

/** Experience bay — the complete room composition.
 *  Hero: "The Ascent", a cantilevered walnut stair climbing the left wall —
 *  one tread per role (EXPERIENCE, start order) with its year and
 *  organisation inlaid in the nose — to a landing where the NOW lamp stands,
 *  the room's single brightest point.
 *  Secondary: the pass case — a slope-top vitrine on the centre floor under
 *  the poster holding the six access passes, one per role.
 *  The right lane stays clear beside the timeline panel. */
export default function ExperienceBay({ accent, animate, mobile }: BayProps) {
  return (
    <group name="experience-root">
      {/* portrait steps the camera in (room-local z 4.35, vfov 86°): the left
          column is off-frame and the stacked panel covers the centre floor
          down to the HUD, so the case would only show as a cropped sliver at
          the frame edge (measured at p=0.67, 390×844) — desktop-only */}
      {!mobile && <ExperienceRoom accent={accent} animate={animate} />}
      {!mobile && <NowLamp accent={accent} position={LAMP_AT} />}
      {!mobile && (
        <Pokeable spin={false} hop={0.08}>
          <Vitrine accent={accent} position={[-0.95, 0, 0.72]} />
        </Pokeable>
      )}
    </group>
  );
}
