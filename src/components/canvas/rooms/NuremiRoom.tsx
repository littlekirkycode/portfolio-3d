"use client";

import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { useTextTexture } from "../canvas2d";
import HoloTable from "./nuremi/HoloTable";
import ConciergePanel from "./nuremi/ConciergePanel";
import Totem from "./nuremi/Totem";
import { ATLAS, makeAtlasPainter } from "./nuremi/pins";

/* ── Nuremi: an AI concierge anchored to a live map ──────────────────────────
 * Hero (left column, brought forward): a raked map table whose plate shows
 * the product's core view — a white-card city model, the concierge's search
 * circle round "you" (a cleared, lit plan district), three numbered picks and
 * the route to pick 1 — with the answer that pinned it projected above, tied
 * to the pin by a leader line.
 * Secondary (right lane): a city wayfinding totem crowned by a physical map
 * pin — the "world around you" half of the story — balancing the bay.
 * The floor's map mat (bayFloors) and the poster/info panel carry the rest.
 *
 * Textures: plate (1024²), the concierge card, and one shared sign atlas
 * (pins + totem face) = 3 canvas textures.
 *
 * Phones: the left column and the right lane are off-frame, so the table
 * stands scaled-down at centre-front instead; the card and totem are omitted
 * (the DOM info card already owns that height). */

export default function NuremiRoom({ accent, animate, mobile = false }: { accent: string; animate: boolean; mobile?: boolean }) {
  const hero = useRef<THREE.Object3D>(null);
  const atlas = useTextTexture(ATLAS.w, ATLAS.h, useMemo(() => makeAtlasPainter(accent), [accent]));
  return (
    <group>
      <HoloTable accent={accent} animate={animate} heroAnchor={hero} atlas={atlas} mobile={mobile} />
      {!mobile && <ConciergePanel accent={accent} heroAnchor={hero} />}
      {!mobile && <Totem accent={accent} atlas={atlas} />}
    </group>
  );
}
