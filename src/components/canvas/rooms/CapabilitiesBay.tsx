"use client";

import { useMemo } from "react";
import { useTextTexture } from "../canvas2d";
import { type BayProps } from "./shared";
import CapabilitiesRoom from "./CapabilitiesRoom";
import Workstation from "./capabilities/Workstation";
import { ATLAS, makeAtlasPainter } from "./capabilities/atlas";

/** Capabilities bay — an engineer's rack room.
 *  Hero: the wall code terminal (bayScreens). In front of it, on the mat, the
 *  operator's station (warm lamp — the room's warm, human zone); along the
 *  left wall, the stack racked as four cabinets over a lit cold aisle (the
 *  room's steel-cyan light). Phones get wall-mount enclosures instead.
 *  The whole bay paints from ONE shared canvas atlas. Nothing animates. */
export default function CapabilitiesBay({ accent, mobile }: BayProps) {
  const paint = useMemo(() => makeAtlasPainter(accent), [accent]);
  const atlas = useTextTexture(ATLAS, ATLAS, paint);
  return (
    <group>
      {/* on the mat, turned three-quarters to the camera, pulled forward so a
          clear band of clad wall separates its monitors from the terminal. Phones only ever
          saw it as a warm smudge through the stacked info card: omitted. */}
      {!mobile && <Workstation accent={accent} atlas={atlas} position={[-0.95, 0, 0.9]} ry={0.3} />}
      <CapabilitiesRoom accent={accent} atlas={atlas} mobile={mobile} />
    </group>
  );
}
