"use client";

import CompactCore from "./selfaware/CompactCore";
import MemoryCore, { ORB_R, ORB_Y } from "./selfaware/MemoryCore";
import RecallDisplay, { RECALL_H } from "./selfaware/RecallDisplay";
import TokenStream from "./selfaware/TokenStream";

/* ── SelfAware: an agentic AI life OS with retrieval-augmented memory ────────
 * One story, told in the free left column (query → recall → act → stream):
 *  1. the MEMORY CORE (hero, front-left) — installed projector hardware on its
 *     own service plinth, a gimbal holding a glass orb with a faceted crystal
 *     mind; the three memories retrieval returned are lit glass tiles on the
 *     right of its orbit, wired to the core; dormant ones rest on the left;
 *  2. the RECALL DISPLAY (secondary, ceiling-hung above the core) — the query,
 *     the three memories with similarity, the agent's answer typed on, the
 *     tool call it made, and the Supabase → OpenAI → streamed pipeline;
 *  3. the TOKEN STREAM carries the answer from the orb into the hero screen,
 *     landing in a steel receiver clamp on its left bezel.
 * Screen budget at the 1440×900 dwell (camera at room-local (0, 1.62, 6.15)):
 * the display spans ≈ x 150–445 px, y 115–330 px (clear of the top HUD, the
 * room label at x ≥ 540 and the screen bezel at x ≈ 480); the orb centre sits
 * at ≈ (280, 444). The plinth stays ~0.2 m clear of the lifeos mat rim.
 * Portrait: the left column is off-frame, so a compact floor emitter sits at
 * the mat's front edge under the info card instead. */

const CORE: [number, number, number] = [-2.88, 0, 1.25];
/** Dwell camera in room-local space (measured) — the core's orbit "front". */
const CAM: [number, number] = [0, 6.15];
const FRONT_YAW = Math.atan2(CAM[0] - CORE[0], CAM[1] - CORE[2]);
/** Side-wall inner face (room-local x). */
const WALL_X = -3.7;
const DISPLAY_TOP = 3.66;
const DISPLAY = {
  pos: [-2.6, DISPLAY_TOP - RECALL_H / 2, 1.6] as [number, number, number],
  rotY: 0.15,
};
/** Receiver clamp on the hero screen's left bezel (room-local). */
const DOCK: [number, number, number] = [-2.36, 2.0, -1.2];
const COMPACT: [number, number, number] = [0, 0, 1.2];

export default function SelfAwareRoom({
  accent,
  animate,
  mobile,
}: {
  accent: string;
  animate: boolean;
  mobile: boolean;
}) {
  if (mobile) {
    return (
      <group name="sa-root">
        <group position={COMPACT}>
          <CompactCore accent={accent} animate={animate} />
        </group>
      </group>
    );
  }
  return (
    <group name="sa-root">
      <group position={CORE}>
        <MemoryCore accent={accent} animate={animate} wallX={WALL_X - CORE[0]} frontYaw={FRONT_YAW} />
      </group>
      <TokenStream
        accent={accent}
        animate={animate}
        points={[
          [CORE[0] + ORB_R * 0.12, ORB_Y + ORB_R * 0.97, CORE[2] - 0.06],
          [CORE[0] + 0.14, ORB_Y + 0.62, CORE[2] - 0.3],
          [-2.5, ORB_Y + 0.72, 0.35],
          [-2.3, DOCK[1] + 0.2, -0.45],
          [DOCK[0] - 0.08, DOCK[1], DOCK[2] - 0.01],
          [DOCK[0] - 0.012, DOCK[1], DOCK[2] - 0.01],
        ]}
      />
      <group position={DISPLAY.pos} rotation-y={DISPLAY.rotY}>
        <RecallDisplay accent={accent} animate={animate} drop={4 - DISPLAY.pos[1]} />
      </group>
    </group>
  );
}
