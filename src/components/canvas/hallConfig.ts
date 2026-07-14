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

/** Target HORIZONTAL fov (deg) FovFit aims for. Mobile uses a tighter value so
 *  the rooms + text read BIGGER (zoomed in); the Rig's portrait step-in (the
 *  camera walks TOWARD the focused bay — see Rig) does the rest of the mobile
 *  framing. No world squash: the corridor is the same geometry on every device. */
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

/* ── camera path: TEN dwell slots (9 rooms + the observation gallery) ────── */

const ROOM_LO = 0.22; // slots occupy this progress band (Hero clears ~0.16, Contact ~0.84)
const ROOM_HI = 0.82;
/** Ten dwell slots: 0-4 = ROOMS[0..4], 5 = OBSERVATION GALLERY (camera turns to
 *  the +z glazing at GALLERY_X), 6-9 = ROOMS[5..8]. Dwell centre of slot i =
 *  ROOM_LO + (i + 0.5) * SLOT exactly — the screenshot harness and every
 *  focus/window band derive from this. */
const N_SLOTS = ROOMS.length + 1; // 10
const SLOT = (ROOM_HI - ROOM_LO) / N_SLOTS; // 0.06
const GALLERY_SLOT = 5;
/** Progress where dwell slot i's band starts. */
const slotStart = (i: number) => ROOM_LO + i * SLOT;
/** Room index → its dwell slot (rooms skip the gallery's slot 5). */
const roomSlot = (i: number) => (i < GALLERY_SLOT ? i : i + 1);

export const START_X = ROOMS[0].x - 20;
const END_X = ROOMS[ROOMS.length - 1].x + 26;

// Showreel feature screen in the entrance lobby, on the +Z (right) wall. The
// camera dwells DIRECTLY OPPOSITE it and turns fully sideways to face it — same
// geometry as a room bay, so it frames head-on (not edge-on).
export const FEATURE_X = START_X + 11;
const FEATURE_CAM_X = FEATURE_X;

/** How far the showreel wall is recessed OUTWARD (+z) at FEATURE_X. KitShell
 *  cuts the wall there and rebuilds it this far back; FeatureScreen's glass
 *  plane AND Rig's feature look-target BOTH offset by this so the flat panel
 *  still frames head-on (flat-panel rule — see Rig). */
export const FEATURE_RECESS_DEPTH = 1.0;

/** Inset of the flat "glass" display planes off the inner wall face (|z| =
 *  HALF_W). Rig's flat-panel look targets and FeatureScreen's panel MUST agree
 *  on this depth or the head-on framing slides off the panel — shared here so
 *  the coupling is a constant, not a comment (finding 32). */
export const GLASS_INSET = 0.06;
/** Absolute |z| of a flat glass plane on the inner wall face. */
export const GLASS_Z = HALF_W - GLASS_INSET;
/** Absolute z of the showreel's recessed glass plane (+z wall at FEATURE_X). */
export const FEATURE_GLASS_Z = GLASS_Z + FEATURE_RECESS_DEPTH;

/* ── observation gallery (dwell slot 5) ─────────────────────────────────── */

/** Gallery glazing lives on the +z wall — opposite xuabelle's bay (ROOMS[4]). */
export const GALLERY_SIDE = 1;
/** Width of the wall cut in world units (3 wall tiles). */
export const GALLERY_SPAN = TILE * 3;

/** Nearest wall-tile COLUMN centre (columns sit at WALL_START + TILE*(i+0.5)),
 *  so a GALLERY_SPAN cut centred here lands exactly on tile boundaries. */
const snapToColumn = (v: number) =>
  WALL_START + TILE / 2 + TILE * Math.round((v - WALL_START - TILE / 2) / TILE);

/** Centre of the glazed run: the middle of the gap between rooms 4 and 5,
 *  column-snapped, then walked in whole tiles until the cut stays clear of any
 *  +z bay opening it would otherwise bite into (room 5's bay starts at
 *  ROOMS[5].x - ALCOVE_OPEN_W/2, which the raw midpoint's span overlaps). */
export const GALLERY_X = (() => {
  let x = snapToColumn((ROOMS[4].x + ROOMS[5].x) / 2);
  if (ROOMS[5].side === GALLERY_SIDE) {
    const maxX = ROOMS[5].x - ALCOVE_OPEN_W / 2 - GALLERY_SPAN / 2;
    while (x > maxX) x -= TILE;
  }
  if (ROOMS[4].side === GALLERY_SIDE) {
    const minX = ROOMS[4].x + ALCOVE_OPEN_W / 2 + GALLERY_SPAN / 2;
    while (x < minX) x += TILE;
  }
  return x;
})();

/* ── deck architecture: bulkhead gates + porthole viewports ──────────────── */

/** Deck boundaries — deck 1 = rooms 0-2, deck 2 = rooms 3-4 + gallery, deck 3 =
 *  rooms 5-8. A gate marks each boundary; its accent is the NEXT deck's first
 *  room accent (the palette you're walking into). Positions sit midway between
 *  the flanking rooms' x — both walls are solid there (room 5's bay starts
 *  flush at the gallery's far edge, so the first solid cross-section after the
 *  glazing is past bay 5). */
export const GATES: { x: number; accent: string }[] = [
  { x: (ROOMS[2].x + ROOMS[3].x) / 2, accent: ROOMS[3].accent },
  { x: (ROOMS[5].x + ROOMS[6].x) / 2, accent: ROOMS[5].accent },
];

/** Small viewports on otherwise-blank wall runs. Scanned along the room band on
 *  wall-tile column centres, alternating sides, with clear margins from bay
 *  openings, the gallery cut, the showreel recess and both gates. Spread ≥18
 *  world units apart so each porthole reads as its own corridor event. */
export const PORTHOLES: { x: number; side: 1 | -1 }[] = (() => {
  const clear = (x: number, side: 1 | -1) =>
    !ROOMS.some((r) => r.side === side && Math.abs(x - r.x) < ALCOVE_OPEN_W / 2 + 1.2) &&
    !(side === GALLERY_SIDE && Math.abs(x - GALLERY_X) < GALLERY_SPAN / 2 + 1.2) &&
    !(side === 1 && Math.abs(x - FEATURE_X) < 4.5) &&
    !GATES.some((g) => Math.abs(x - g.x) < 2.2);
  const out: { x: number; side: 1 | -1 }[] = [];
  let side: 1 | -1 = -1; // first blank run is past room 0's far edge (-z)
  let lastX = -Infinity;
  const last = ROOMS[ROOMS.length - 1].x + TILE * 2;
  for (let x = snapToColumn(ROOMS[0].x) + TILE * 3; x <= last && out.length < 4; x += TILE) {
    if (x - lastX < 18 || !clear(x, side)) continue;
    out.push({ x, side });
    lastX = x;
    side = side === 1 ? -1 : 1;
  }
  return out;
})();

// keyframes of (progress → cameraX); a flat "dwell" band sits at each slot.
type KF = { p: number; x: number };
const KEYS: KF[] = [{ p: 0, x: START_X }];
// Showreel dwell: glide in, hold facing the feature screen, then move on.
KEYS.push({ p: 0.1, x: FEATURE_CAM_X });
KEYS.push({ p: 0.17, x: FEATURE_CAM_X });
for (let i = 0; i < N_SLOTS; i++) {
  const s = slotStart(i);
  const x = i === GALLERY_SLOT ? GALLERY_X : ROOMS[i < GALLERY_SLOT ? i : i - 1].x;
  // Wide flat hold = the camera STAYS on each slot. Keep these in sync with
  // slotEase's dwellLo/dwellHi (0.30 / 0.70). The 0.40*SLOT between a slot's
  // leave and the next slot's arrive is the visible corridor-travel gap.
  KEYS.push({ p: s + SLOT * 0.3, x }); // arrive (dwell on slot)
  KEYS.push({ p: s + SLOT * 0.7, x }); // leave — corridor travel between slots
}
KEYS.push({ p: 1, x: END_X });

/** Progress past which the 3D bridge fills the frame. The camera parks on the
 *  bridge from here (well past the last dwell slot); the HUD's ship-section,
 *  Corridor's approach-dim band and the Drone's bridge dock all key off this
 *  one threshold (finding 32 — it used to be re-hardcoded per file). */
export const BRIDGE_ENTER_P = 0.86;

/** Progress where the hero overlay starts its fade (and the airlock hiss
 *  fires) — the first beat of scroll, shared by Hero + useShipAudio. */
export const HERO_FADE_START = 0.004;

/** Dwell-stop progress values for the mobile hop chevrons: airlock, lobby
 *  showreel, every dwell slot centre (9 rooms + the gallery), bridge. Derived
 *  from the same slot math as KEYS so the hops land dead-centre in each hold
 *  band; the showreel value mirrors its KEYS hold (0.10–0.17). */
export const STOP_PROGRESSES: number[] = [
  0,
  0.135,
  ...Array.from({ length: N_SLOTS }, (_, i) => slotStart(i) + SLOT / 2),
  1,
];

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

/** Shared dwell-band turn ramp for slot i: 0 → 1 → 0. The turn LEADS arrival —
 *  full focus is reached `lead` before the camera centres, so the head already
 *  faces the exhibit as it slides in (fixes "turns too late"). `ramp` is short
 *  enough to leave ~0.16*SLOT mid-corridor where nothing is focused (you face
 *  straight down the hall = a real walk between slots). The whole band stays
 *  inside [s, s+SLOT], so slot windows tile without overlapping. dwellLo/dwellHi
 *  mirror the KEYS hold band (0.30 / 0.70). */
function slotEase(p: number, slot: number): number {
  const s = slotStart(slot);
  const dwellLo = s + SLOT * 0.3;
  const dwellHi = s + SLOT * 0.7;
  const lead = SLOT * 0.06;
  const ramp = SLOT * 0.16;
  const fullLo = dwellLo - lead;
  const fullHi = dwellHi + lead;
  const inLo = fullLo - ramp;
  const outHi = fullHi + ramp;
  if (p < inLo || p > outHi) return 0;
  let e: number;
  if (p < fullLo) e = (p - inLo) / ramp;
  else if (p > fullHi) e = (outHi - p) / ramp;
  else e = 1;
  return smooth(Math.max(0, Math.min(1, e)));
}

/** Which room the camera is focusing, and how strongly (0..1), for the glance.
 *  Rooms map to slots 0-4 and 6-9 (slot 5 belongs to the observation gallery —
 *  see galleryFocusAt); windows never overlap, so the first hit wins. */
export function focusAt(p: number): { room: Room | null; ease: number } {
  for (let i = 0; i < ROOMS.length; i++) {
    const e = slotEase(p, roomSlot(i));
    if (e > 0) return { room: ROOMS[i], ease: e };
  }
  return { room: null, ease: 0 };
}

/** How strongly the camera should turn to the observation-gallery glazing
 *  (0..1) — slot 5's band, same ramp shape as featureFocusAt / room focus. */
export function galleryFocusAt(p: number): number {
  return slotEase(p, GALLERY_SLOT);
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
