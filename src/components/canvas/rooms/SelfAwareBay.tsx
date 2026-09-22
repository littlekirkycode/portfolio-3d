"use client";

import { Model } from "../ModelLoader";
import { d2r, type BayProps } from "./shared";
import SelfAwareRoom from "./SelfAwareRoom";

/** SelfAware bay — the complete room composition (installation + props).
 *  SelfAware — the assistant itself: AI core + memory graph streaming into the phone */
export default function SelfAwareBay({ accent, animate }: BayProps) {
  return (
      <group>
        <SelfAwareRoom accent={accent} animate={animate} />
        {/* small floor plant between the phone and the info panel */}
        <Model name="plant" height={0.4} position={[-0.25, 0, 1.05]} rotation={[0, d2r(70), 0]} />
      </group>
  );
}
