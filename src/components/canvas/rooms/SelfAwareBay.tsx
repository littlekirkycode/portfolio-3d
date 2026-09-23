"use client";

import { type BayProps } from "./shared";
import SelfAwareRoom from "./SelfAwareRoom";

/** SelfAware bay — the complete room composition: the memory core (hero,
 *  projector hardware on its own plinth), the ceiling-hung recall display and
 *  the token stream into the phone's receiver clamp.
 *  (The old floor plant is gone: it read as clutter on desktop and sat over
 *  the info panel in the portrait stack.) */
export default function SelfAwareBay({ accent, animate, mobile }: BayProps) {
  return <SelfAwareRoom accent={accent} animate={animate} mobile={mobile} />;
}
