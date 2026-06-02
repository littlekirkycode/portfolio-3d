/** Forward-travel corridor with recessed, themed lounge alcoves in the walls. */

import {
  PROJECTS,
  CAPABILITIES_ROOM,
  EXPERIENCE_ROOM,
  ALLIED_ROOM,
  ACHIEVEMENTS_ROOM,
  type Project,
  type RoomTheme,
} from "@/lib/constants";

/* ── Kenney Space Station Kit module sizing (see ModelLoader PACK_SCALE) ──────
 * Kit pieces are authored on a 1-unit grid (wall = 1×1×0.3, origin bottom-centre).
 * We scale the whole kit by PACK_SCALE so one module footprint = TILE world units,
 * and tile the corridor/niches on that grid. */
export const PACK_SCALE = 2.0; // kit unit (1) → world units
export const TILE = 2.0; // wall / floor module footprint in world units
const WALL_DEPTH = 0.3 * PACK_SCALE; // scaled slab thickness (0.6)

export const HALF_W = 3.7; // INNER half-width (camera + content live to this) — unchanged
export const WALL_Z = HALF_W + WALL_DEPTH / 2; // 4.0 — wall-tile centre line
export const FLOOR_Y = -WALL_DEPTH; // floor slab origin so its top sits at y=0
export const WALL_H = 4.0; // 2 rows × TILE — corridor / opening height
export const CEIL_Y = WALL_H + WALL_DEPTH; // flipped floor-tile origin → underside at WALL_H
export const EYE_Y = 1.62;

export const ALCOVE_TOP = WALL_H; // full-height bays
export const ALCOVE_OPEN_W = 8.0; // 4 tiles wide
export const ALCOVE_DEPTH = 4.0; // 2 tiles deep (from the inner face)

/** On portrait mobile the corridor reads too wide (empty floor by the walls), so
 *  the whole scene is squashed on Z by this factor — bringing the side walls in
 *  toward the props without moving anything in X (length) or Y (height). The Rig
 *  scales its sideways look-target to match. Desktop = 1 (untouched). */
export const MOBILE_Z = 0.74;

/** Target HORIZONTAL fov (deg) FovFit aims for. Mobile uses a tighter value so
 *  the rooms + text read BIGGER (zoomed in); the narrower MOBILE_Z corridor means
 *  the side bays still fit the frame at this tighter angle. */
export const HFOV_DESKTOP = 62;
export const HFOV_MOBILE = 58;

export const TRAVEL = 190;

export type Room = {
  id: string;
  kind: "project" | "skills" | "experience" | "defence" | "trophy";
  project?: Project;
  theme: RoomTheme;
  accent: string;
  index: string;
  title: string;
  category: string;
  x: number;
  side: -1 | 1;
  /** Layout variant (0–2) — drives per-bay dressing/console/light/pad so rooms
   *  don't look identical. Hand-tuned so no same-side room within 2 slots shares
   *  both side AND variant. */
  variant: 0 | 1 | 2;
};

const base: Omit<Room, "x" | "side" | "variant">[] = [
  ...PROJECTS.map((p) => ({
    id: p.id,
    kind: "project" as const,
    project: p,
    theme: p.theme,
    accent: p.accent,
    index: p.index,
    title: p.title,
    category: p.category,
  })),
  { id: "capabilities", kind: "skills", theme: CAPABILITIES_ROOM.theme, accent: CAPABILITIES_ROOM.accent, index: CAPABILITIES_ROOM.index, title: CAPABILITIES_ROOM.title, category: CAPABILITIES_ROOM.category },
  { id: "experience", kind: "experience", theme: EXPERIENCE_ROOM.theme, accent: EXPERIENCE_ROOM.accent, index: EXPERIENCE_ROOM.index, title: EXPERIENCE_ROOM.title, category: EXPERIENCE_ROOM.category },
  { id: "allied", kind: "defence", theme: ALLIED_ROOM.theme, accent: ALLIED_ROOM.accent, index: ALLIED_ROOM.index, title: ALLIED_ROOM.title, category: ALLIED_ROOM.category },
  { id: "achievements", kind: "trophy", theme: ACHIEVEMENTS_ROOM.theme, accent: ACHIEVEMENTS_ROOM.accent, index: ACHIEVEMENTS_ROOM.index, title: ACHIEVEMENTS_ROOM.title, category: ACHIEVEMENTS_ROOM.category },
];

export const ROOMS: Room[] = base.map((r, i) => {
  const rawX = (0.27 + (0.46 * i) / (base.length - 1)) * TRAVEL;
  return {
    ...r,
    // Snap to the TILE grid so each bay opening lands on wall-tile boundaries —
    // otherwise the corridor wall overlaps one opening edge and leaves a gap on
    // the other.
    x: TILE * Math.round(rawX / TILE),
    side: (i % 2 === 0 ? -1 : 1) as -1 | 1,
    // i%3 → left rooms (0,2,4,6) get variants 0,2,1,0 and right rooms (1,3,5,7)
    // get 1,0,2,1 — so every same-side CONSECUTIVE bay differs in layout.
    variant: (i % 3) as 0 | 1 | 2,
  };
});

export const WALL_START = -10;
export const WALL_END = TRAVEL + 18;
export const HALL_LEN = WALL_END - WALL_START;
export const HALL_CENTER_X = (WALL_START + WALL_END) / 2;
export const END_VISUAL_X = ROOMS[ROOMS.length - 1].x + 30; // far-end feature

/* ── camera path: dwell + center on each room ───────────────────────────── */

const ROOM_LO = 0.22; // rooms occupy this progress band (Hero clears ~0.16, Contact ~0.84)
const ROOM_HI = 0.82;
const SLOT = (ROOM_HI - ROOM_LO) / ROOMS.length;
export const START_X = ROOMS[0].x - 20;
const END_X = ROOMS[ROOMS.length - 1].x + 26;

// Showreel feature screen in the entrance lobby, on the +Z (right) wall. The
// camera dwells DIRECTLY OPPOSITE it and turns fully sideways to face it — same
// geometry as a room bay, so it frames head-on (not edge-on).
export const FEATURE_X = START_X + 11;
const FEATURE_CAM_X = FEATURE_X;

// keyframes of (progress → cameraX); a flat "dwell" band sits at each room.
type KF = { p: number; x: number };
const KEYS: KF[] = [{ p: 0, x: START_X }];
// Showreel dwell: glide in, hold facing the feature screen, then move on.
KEYS.push({ p: 0.1, x: FEATURE_CAM_X });
KEYS.push({ p: 0.17, x: FEATURE_CAM_X });
ROOMS.forEach((r, i) => {
  const s = ROOM_LO + i * SLOT;
  // Wide flat hold = the camera STAYS on each room. Keep these in sync with
  // focusAt's dwellLo/dwellHi (0.20 / 0.80). The 0.40*SLOT between a room's
  // leave and the next room's arrive is the visible corridor-travel gap.
  KEYS.push({ p: s + SLOT * 0.3, x: r.x }); // arrive (dwell on room)
  KEYS.push({ p: s + SLOT * 0.7, x: r.x }); // leave — wider corridor travel between rooms
});
KEYS.push({ p: 1, x: END_X });

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Camera X for a scroll progress — eases between rooms, holds flat at each. */
export function cameraXAt(p: number): number {
  if (p <= 0) return KEYS[0].x;
  if (p >= 1) return KEYS[KEYS.length - 1].x;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (p >= a.p && p <= b.p) {
      if (a.x === b.x) return a.x; // dwell
      const t = (p - a.p) / (b.p - a.p);
      return a.x + (b.x - a.x) * smooth(t);
    }
  }
  return KEYS[KEYS.length - 1].x;
}

/** Which room the camera is focusing, and how strongly (0..1), for the glance.
 *  The turn LEADS the arrival: focus reaches 1 a touch (0.05*SLOT) BEFORE the
 *  camera centres, so the head is already facing the room as it slides in
 *  (fixes the "turns too late" feel). Each room's window tiles its slot exactly
 *  ([s, s+SLOT]) so windows never overlap — important because this returns the
 *  FIRST matching room. dwellLo/dwellHi mirror the KEYS hold band (0.20 / 0.80). */
export function focusAt(p: number): { room: Room | null; ease: number } {
  for (let i = 0; i < ROOMS.length; i++) {
    const s = ROOM_LO + i * SLOT;
    const dwellLo = s + SLOT * 0.3;
    const dwellHi = s + SLOT * 0.7;
    // The turn LEADS arrival: full focus is reached `lead` before the camera
    // centres so the bay is already faced as you slide in (fixes "turns late").
    // `ramp` is still short enough to leave ~0.16*SLOT mid-corridor where no room
    // is focused (you face straight down the hall = a real walk between bays).
    const lead = SLOT * 0.06;
    const ramp = SLOT * 0.16;
    const fullLo = dwellLo - lead;
    const fullHi = dwellHi + lead;
    const inLo = fullLo - ramp;
    const outHi = fullHi + ramp;
    if (p >= inLo && p <= outHi) {
      let e: number;
      if (p < fullLo) e = (p - inLo) / ramp;
      else if (p > fullHi) e = (outHi - p) / ramp;
      else e = 1;
      return { room: ROOMS[i], ease: smooth(Math.max(0, Math.min(1, e))) };
    }
  }
  return { room: null, ease: 0 };
}

/** How strongly the camera should turn to face the entrance showreel (0..1).
 *  Mirrors the room-focus ramp but for the lobby feature, in its own progress
 *  band (well before the first room band at ~0.22). */
export function featureFocusAt(p: number): number {
  const inLo = 0.06, fullLo = 0.1, fullHi = 0.16, outHi = 0.2;
  if (p < inLo || p > outHi) return 0;
  let e: number;
  if (p < fullLo) e = (p - inLo) / (fullLo - inLo);
  else if (p > fullHi) e = (outHi - p) / (outHi - fullHi);
  else e = 1;
  return smooth(Math.max(0, Math.min(1, e)));
}
