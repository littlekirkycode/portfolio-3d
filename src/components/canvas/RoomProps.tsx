"use client";

import { Component, type ReactNode } from "react";
import type { RoomTheme } from "@/lib/constants";
import { FloorStory } from "./bayFloors";
import SelfQuestBay from "./rooms/SelfQuestBay";
import CapabilitiesBay from "./rooms/CapabilitiesBay";
import SelfAwareBay from "./rooms/SelfAwareBay";
import ExperienceBay from "./rooms/ExperienceBay";
import NuremiBay from "./rooms/NuremiBay";
import MilestonesBay from "./rooms/MilestonesBay";
import AlliedBay from "./rooms/AlliedBay";
import SelfGrowBay from "./rooms/SelfGrowBay";
import XuabelleBay from "./rooms/XuabelleBay";
import type { BayProps } from "./rooms/shared";

/**
 * Each bay is composed around a bespoke INSTALLATION that visualises its project
 * (./rooms/* — quest board, AI core + memory graph, streak wall, city hologram,
 * boutique vitrines, skill racks, career staircase, inspection cell, hall of
 * fame), supported by low-poly props, with deliberate art direction:
 *  - large objects (treadmill, desk, tower) are ANCHORED to the back/sides,
 *    angled so their profile faces the opening — never floating mid-floor;
 *  - small "showcase" objects (globe, ring, gem, trophy, drone) sit ELEVATED on a
 *    display plinth; a room uses ONE display language (e.g. jewellery = every piece
 *    on its own plinth, never some on the floor);
 *  - flat floating objects BOB (they'd vanish edge-on if spun);
 *  - everything rests cleanly on the now-flush accent mat.
 * Local origin = niche floor 1.55 in front of the back wall; +Z = toward the
 * opening/camera; back wall at z ≈ -1.55.
 * OCCLUSION BAND: the floating info panel (x=1.55, local z≈+0.95, 3.2×2.62) covers
 * x∈[0, 3.15] from the head-on camera — props taller than ~0.5 there hide behind it
 * (z < +0.9) or block its text (z > +0.9). Tall props live at x<0 or x>3.3, small
 * floor items (≤~0.5) may sit under its bottom edge. The hero screen spans
 * x∈[-3.1, 0] on the back wall — nothing taller than ~1.0 directly in front of it.
 */


/* The per-theme FLOOR_ART deck markings + FloorStory/GymDeck renderers live in
 * ./bayFloors with the rest of the painted-floor system (finding 34). */

export default function RoomProps({
  theme,
  accent,
  animate,
  mobile = false,
}: {
  theme: RoomTheme;
  accent: string;
  animate: boolean;
  mobile?: boolean;
}) {
  return (
    <group>
      <FloorStory theme={theme} accent={accent} />
      <BayBoundary theme={theme}>
        <ThemeProps theme={theme} p={{ accent, animate, mobile }} />
      </BayBoundary>
    </group>
  );
}

/** One file per bay (./rooms/<Name>Bay.tsx) owns that room's whole composition. */
function ThemeProps({ theme, p }: { theme: RoomTheme; p: BayProps }) {
  switch (theme) {
    case "gym":
      return <SelfQuestBay {...p} />;
    case "skills":
      return <CapabilitiesBay {...p} />;
    case "lifeos":
      return <SelfAwareBay {...p} />;
    case "experience":
      return <ExperienceBay {...p} />;
    case "map":
      return <NuremiBay {...p} />;
    case "trophy":
      return <MilestonesBay {...p} />;
    case "defence":
      return <AlliedBay {...p} />;
    case "habit":
      return <SelfGrowBay {...p} />;
    case "jewellery":
      return <XuabelleBay {...p} />;
    default:
      return null;
  }
}

/** Per-bay crash containment: a runtime error in one room's composition drops
 *  just that room's contents instead of tearing down the whole 3D layer
 *  (SceneErrorBoundary). Logs a greppable "[bay-crash]" line. */
class BayBoundary extends Component<{ theme: RoomTheme; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error(`[bay-crash] ${this.props.theme}:`, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
