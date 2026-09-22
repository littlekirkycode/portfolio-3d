"use client";

import { type BayProps } from "./shared";
import NuremiRoom from "./NuremiRoom";

/** Nuremi bay — the complete room composition (installation + props).
 *  Nuremi — the product's own view as a hologram: city, picks, route + the chat that asked */
export default function NuremiBay({ accent, animate }: BayProps) {
  return (
      <group>
        <NuremiRoom accent={accent} animate={animate} />
      </group>
  );
}
