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

/** Double-height atrium over the entrance lobby: the ~5 tile columns ending at
 *  FEATURE_X + 4 lose their ceiling and gain a third (clerestory) wall row
 *  (KitShell). Ceiling-mounted dressing (corridorFx) skips this run too. */
export const ATRIUM_C = FEATURE_X - TILE; // centre column of the 5-column run
export const inAtrium = (x: number) => Math.abs(x - ATRIUM_C) < TILE * 2.5;

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

/* ── camera choreography (Rig reads all of this at its smoothed playhead) ───
 *
 * Every slot is laid out in fractions of SLOT, relative to its start s:
 *
 *   0 ── gaze turns in ──┐0.33┌──── camera parked ────┐0.67┌── gaze turns out ── 1
 *                        full   0.35 ··········· 0.65    full
 *
 * - The camera PARKS on the exhibit over [HOLD_LO, HOLD_HI] and travels on a
 *   quintic (smootherstep) curve between parks — zero velocity AND zero
 *   acceleration at both ends, so arriving/leaving never "clicks".
 * - The head is fully turned slightly WIDER than the park ([GAZE_FULL_LO,
 *   GAZE_FULL_HI]): it faces the exhibit just before the camera settles and
 *   only lets go once the camera has begun to move — never a sideways strafe.
 * - Turns fill the REST of the slot, so two neighbouring turns meet exactly at
 *   the slot boundary. When the neighbours sit on OPPOSITE walls (almost every
 *   pair) the two ramps are quarter-sine halves with matched slopes: together
 *   they form ONE continuous cosine sweep from one wall, across the corridor
 *   axis, to the other — no stop-and-go "look ahead" beat, and about half the
 *   peak angular velocity of the old back-to-back smoothstep turns. Same-wall
 *   neighbours (gallery → Nuremi) settle to straight-ahead in between instead.
 * - HOLD_* are mirrored in dwellSettleTarget (the magnetic settle), which
 *   parks the scroll back inside these holds when a gesture ends mid-corridor.
 * Dwell CENTRES (s + 0.5*SLOT) and STOP_PROGRESSES are unchanged. */
const HOLD_LO = 0.35;
const HOLD_HI = 0.65;
const GAZE_FULL_LO = 0.33;
const GAZE_FULL_HI = 0.67;
/** Lobby showreel hold (progress) — its centre is STOP_PROGRESSES[1] (0.135).
 *  Was 0.10–0.17: ~11 wheel notches with no camera motion at all read as a
 *  dead scroll wheel; 0.12–0.15 (~4.5 notches) matches the room parks. */
const FEATURE_HOLD_LO = 0.12;
const FEATURE_HOLD_HI = 0.15;
/** Showreel turn-in window start (airlock → lobby; settles from straight ahead). */
const FEATURE_TURN_IN = 0.06;
/** Junction between the showreel's turn-out and room 0's turn-in: centred
 *  between the two "fully turned" points so both ramps are the same width and
 *  the +z → −z pan is one continuous sweep (see above). */
const FEATURE_JUNCTION = (FEATURE_HOLD_HI + ROOM_LO + GAZE_FULL_LO * SLOT) / 2;

/** The camera holds at the airlock over [0, AIRLOCK_HOLD] so the entry doors
 *  have real scroll to open in (Airlock's TIMING finishes inside it) before
 *  the glide into the lobby starts. */
export const AIRLOCK_HOLD = 0.042;

/* ── deck-gate beats ───────────────────────────────────────────────────────
 * Each bulkhead gate gets its own forward-facing beat: the head settles off
 * the room before the gate to straight down the hall (no cross-corridor
 * sweep), the camera parks GATE_VIEW in front of the gate plane, the doors
 * open as a pure function of scroll through the beat (gateOpenAt), and only
 * then does the camera glide through into the next room. The two slots either
 * side of a gate are retimed inside their own [s, s+SLOT] bands (slot a exits
 * earlier, slot b turns in later); dwell CENTRES are unchanged. */
const slotX = (i: number): number => (i === GALLERY_SLOT ? GALLERY_X : ROOMS[i < GALLERY_SLOT ? i : i - 1].x);
/** For each gate, the last dwell slot in front of it. */
const GATE_A: number[] = GATES.map((g) => {
  let a = 0;
  for (let i = 0; i < N_SLOTS; i++) if (slotX(i) < g.x) a = i;
  return a;
});
const isGateA = (i: number) => GATE_A.includes(i);
const isGateB = (i: number) => GATE_A.includes(i - 1);
// slot a (before the gate): leaves its park + releases the gaze earlier
const GA_HOLD_HI = 0.6;
const GA_GAZE_HI = 0.62;
const GA_OUT = 0.8;
// slot b (after the gate): turns in later, from straight ahead
const GB_IN = 0.15;
const GB_GAZE_LO = 0.38;
const GB_HOLD_LO = 0.4;
/** Where the camera parks for the beat: this far in front of the gate plane. */
const GATE_VIEW = 4.2;
/** Progress window of each gate's beat (camera parked, facing the doors). */
export const GATE_BEATS: { x: number; lo: number; hi: number }[] = GATES.map((g, k) => {
  const s = slotStart(GATE_A[k]);
  return { x: g.x, lo: s + SLOT * GA_OUT, hi: s + SLOT * (1 + GB_IN) };
});

/** Door state for gate k at camera progress p: seals release over the first
 *  ~22% of the beat, the leaves part over the next ~70% (finishing a touch
 *  before the camera moves, so the open doorway is seen), both eased and both
 *  scrubbing backwards when the visitor scrolls back. */
export function gateOpenAt(k: number, p: number): { unlock: number; part: number } {
  const b = GATE_BEATS[k];
  const len = b.hi - b.lo;
  const unlock = clamp01((p - b.lo) / (0.22 * len));
  return {
    unlock: unlock * unlock * (3 - 2 * unlock),
    part: smoother(clamp01((p - b.lo - 0.18 * len) / (0.7 * len))),
  };
}

// keyframes of (progress → cameraX); a flat "dwell" band sits at each slot.
type KF = { p: number; x: number };
const KEYS: KF[] = [{ p: 0, x: START_X }, { p: AIRLOCK_HOLD, x: START_X }];
// Showreel dwell: glide in, hold facing the feature screen, then move on.
KEYS.push({ p: FEATURE_HOLD_LO, x: FEATURE_CAM_X });
KEYS.push({ p: FEATURE_HOLD_HI, x: FEATURE_CAM_X });
for (let i = 0; i < N_SLOTS; i++) {
  const s = slotStart(i);
  const x = slotX(i);
  KEYS.push({ p: s + SLOT * (isGateB(i) ? GB_HOLD_LO : HOLD_LO), x }); // arrive (park on the slot)
  KEYS.push({ p: s + SLOT * (isGateA(i) ? GA_HOLD_HI : HOLD_HI), x }); // leave — corridor travel to the next slot
  if (isGateA(i)) {
    const b = GATE_BEATS[GATE_A.indexOf(i)];
    KEYS.push({ p: b.lo, x: b.x - GATE_VIEW }); // gate beat: parked facing the doors
    KEYS.push({ p: b.hi, x: b.x - GATE_VIEW });
  }
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
 *  band; the showreel value is the centre of its KEYS hold (0.12–0.15). */
export const STOP_PROGRESSES: number[] = [
  0,
  0.135,
  ...Array.from({ length: N_SLOTS }, (_, i) => slotStart(i) + SLOT / 2),
  1,
];

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Quintic smootherstep: zero 1st AND 2nd derivative at both ends. */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** Cosine ease-in-out (0→1, zero slope at both ends). */
const settleIn = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
/** Quarter-sine 0→1 that LEAVES its start with slope π/2 (one half of a
 *  cross-corridor sweep) and arrives with zero slope. */
const sweepIn = (u: number) => Math.sin((Math.PI / 2) * u);

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
      return a.x + (b.x - a.x) * smoother(t);
    }
  }
  return KEYS[KEYS.length - 1].x;
}

/* Glide path: the same stops WITHOUT the parks — a monotone C1 cubic
 * (Fritsch–Carlson) through (0, START_X), the showreel centre, every ROOM
 * dwell centre and (1, END_X). Rig blends toward it while a wheel/touch
 * visitor RUSHES (flick): racing the dwell path makes the camera stop-go at
 * every exhibit several times a second; the glide just travels. Both paths
 * agree exactly at every room dwell centre. The gallery is NOT a knot: it
 * sits only 3 units past Xuabelle (other neighbours are 10–12 apart), and
 * forcing the spline through it made a flick brake to a crawl there and
 * surge again after. (Programmatic glides don't use this path at all — Rig
 * choreographs those directly in x.) */
const GLIDE: KF[] = [
  { p: 0, x: START_X },
  { p: (FEATURE_HOLD_LO + FEATURE_HOLD_HI) / 2, x: FEATURE_CAM_X },
  ...Array.from({ length: N_SLOTS }, (_, i): KF | null =>
    i === GALLERY_SLOT
      ? null
      : { p: slotStart(i) + SLOT / 2, x: ROOMS[i < GALLERY_SLOT ? i : i - 1].x },
  ).filter((k): k is KF => k !== null),
  { p: 1, x: END_X },
];
const GLIDE_M: number[] = (() => {
  const n = GLIDE.length;
  const d = GLIDE.slice(1).map((b, i) => (b.x - GLIDE[i].x) / (b.p - GLIDE[i].p));
  const m = GLIDE.map((_, i) =>
    i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2,
  );
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
})();

/** Camera X on the park-free glide path (see GLIDE). */
export function cameraGlideXAt(p: number): number {
  if (p <= 0) return GLIDE[0].x;
  if (p >= 1) return GLIDE[GLIDE.length - 1].x;
  let i = 0;
  while (i < GLIDE.length - 2 && p > GLIDE[i + 1].p) i++;
  const a = GLIDE[i];
  const b = GLIDE[i + 1];
  const h = b.p - a.p;
  const t = (p - a.p) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a.x +
    (t3 - 2 * t2 + t) * h * GLIDE_M[i] +
    (-2 * t3 + 3 * t2) * b.x +
    (t3 - t2) * h * GLIDE_M[i + 1]
  );
}

/** Wall (±z) that dwell slot i faces. */
const slotSide = (i: number): number =>
  i === GALLERY_SLOT ? GALLERY_SIDE : ROOMS[i < GALLERY_SLOT ? i : i - 1].side;
/** The lobby showreel lives on the +z wall. */
const FEATURE_SIDE = 1;

/** One focus ramp 0 → 1 → 0 over [inLo, fullLo] / [fullHi, outHi]. `sweepLo`
 *  / `sweepHi` pick the quarter-sine shape at an end whose neighbour sits on
 *  the opposite wall (continuous cross-corridor sweep); otherwise the end
 *  settles with zero slope (a straight-ahead beat). */
function ramp(
  p: number,
  inLo: number,
  fullLo: number,
  fullHi: number,
  outHi: number,
  sweepLo: boolean,
  sweepHi: boolean,
): number {
  if (p <= inLo || p >= outHi) return 0;
  if (p < fullLo) {
    const u = clamp01((p - inLo) / (fullLo - inLo));
    return sweepLo ? sweepIn(u) : settleIn(u);
  }
  if (p > fullHi) {
    const u = clamp01((outHi - p) / (outHi - fullHi));
    return sweepHi ? sweepIn(u) : settleIn(u);
  }
  return 1;
}

/** Dwell-band turn ramp for slot i: 0 → 1 → 0 (see the layout comment above
 *  KEYS). The band stays inside [s, s+SLOT] (slot 0 starts at the showreel
 *  junction), so slot windows tile without overlapping. */
function slotEase(p: number, slot: number): number {
  const s = slotStart(slot);
  const a = isGateA(slot);
  const b = isGateB(slot);
  const inLo = slot === 0 ? FEATURE_JUNCTION : b ? s + SLOT * GB_IN : s;
  const outHi = a ? s + SLOT * GA_OUT : s + SLOT;
  const side = slotSide(slot);
  const prevSide = slot === 0 ? FEATURE_SIDE : slotSide(slot - 1);
  // a gate between two slots breaks the cross-corridor sweep: both settle
  // to straight ahead so the head faces the doors for the whole beat
  const sweepLo = !b && prevSide !== side;
  const sweepHi = !a && slot < N_SLOTS - 1 && slotSide(slot + 1) !== side;
  const fullLo = s + SLOT * (b ? GB_GAZE_LO : GAZE_FULL_LO);
  const fullHi = s + SLOT * (a ? GA_GAZE_HI : GAZE_FULL_HI);
  return ramp(p, inLo, fullLo, fullHi, outHi, sweepLo, sweepHi);
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
 *  Settles in from straight ahead (airlock → lobby), holds over the showreel
 *  park, then sweeps across the corridor into room 0's turn (its own band,
 *  ending exactly where room 0's begins). */
export function featureFocusAt(p: number): number {
  return ramp(
    p,
    FEATURE_TURN_IN,
    FEATURE_HOLD_LO,
    FEATURE_HOLD_HI,
    FEATURE_JUNCTION,
    false,
    slotSide(0) !== FEATURE_SIDE,
  );
}

/* ── parks + magnetic dwell settle ────────────────────────────────────────── */

/** Every park, in order: airlock hold, showreel, the ten slot holds with the
 *  two deck-gate beats between their neighbours. */
const PARKS: [number, number][] = [
  [0, AIRLOCK_HOLD],
  [FEATURE_HOLD_LO, FEATURE_HOLD_HI],
  ...Array.from({ length: N_SLOTS }, (_, i): [number, number][] => {
    const hold: [number, number] = [
      slotStart(i) + SLOT * (isGateB(i) ? GB_HOLD_LO : HOLD_LO),
      slotStart(i) + SLOT * (isGateA(i) ? GA_HOLD_HI : HOLD_HI),
    ];
    if (!isGateA(i)) return [hold];
    const b = GATE_BEATS[GATE_A.indexOf(i)];
    return [hold, [b.lo, b.hi]];
  }).flat(),
];

/** Index into the park list of the park containing p (camera X is flat
 *  there), or -1 while the camera is travelling between parks. Rig uses it to
 *  ignore scroll motion that stays inside one park (no head nod). */
export function parkIndexAt(p: number): number {
  for (let i = 0; i < PARKS.length; i++) {
    const [lo, hi] = PARKS[i];
    if (p < lo - 1e-4) return -1;
    if (p <= hi + 1e-4) return i;
  }
  return -1;
}

/** How far INSIDE a park the settle lands (never on the knife-edge where the
 *  camera starts to travel). */
const SETTLE_INSET = SLOT * 0.06;
/** Fraction of a corridor gap the visitor must already have travelled (in
 *  their direction of travel) before the settle carries them ON into the next
 *  park. Below it the scroll is left exactly where they put it. */
const SETTLE_COMMIT = 0.18;
/** A gesture that CARRIED the scroll at least this far (progress, a little
 *  over one room gap, i.e. a flick that flew past at least one exhibit) and
 *  died just past a park is eased BACK into that park when it stopped within
 *  SETTLE_BACK of the gap: the flick ran out of momentum a hair past a room,
 *  so the room is where it "landed". Small, careful gestures never qualify,
 *  so a notch-by-notch walker is never pulled back. */
export const SETTLE_FLICK_CARRY = SLOT * 1.1;
const SETTLE_BACK = 0.3;

/** Length (progress) of the corridor gap containing p (the travel between
 *  two parks), or 0 while parked. Used to scale settle glide durations. */
export function parkGapAt(p: number): number {
  for (let i = 0; i < PARKS.length - 1; i++) {
    const hi = PARKS[i][1];
    const lo = PARKS[i + 1][0];
    if (p > hi && p < lo) return lo - hi;
  }
  const last = PARKS[PARKS.length - 1][1];
  return p > last ? BRIDGE_ENTER_P - last : 0;
}

/**
 * Where to gently carry the scroll when a gesture ends at progress p after
 * moving in direction dir, or null to leave it alone. `carried` is how far
 * (|progress|) the whole gesture moved the page.
 *
 * The settle normally only continues the visitor's OWN motion: it lands just
 * inside the next park in the direction they were scrolling, and only once
 * they are committed (at least SETTLE_COMMIT of the way across the gap). It
 * never pulls a careful walker back toward the park they left: repeated
 * small gestures simply add up until the commit point, then the last stretch
 * is completed for them. The one exception is a long flick (carried at least
 * SETTLE_FLICK_CARRY) that died just past a park: that eases back a few
 * notches' worth into the park it overshot (see SETTLE_FLICK_CARRY).
 * Null when already parked, on the hero/airlock doors, or out on the bridge
 * run (forward travel past the last exhibit belongs to the contact panel).
 */
export function dwellSettleTarget(p: number, dir: 1 | -1, carried = 0): number | null {
  if (p < 0.03) return null; // hero / airlock doors: leave the visitor be
  const flick = carried >= SETTLE_FLICK_CARRY;
  for (let i = 0; i < PARKS.length; i++) {
    const [lo, hi] = PARKS[i];
    if (p >= lo - 1e-4 && p <= hi + 1e-4) return null; // already parked
    const next = PARKS[i + 1];
    const backInto = Math.max(hi - SETTLE_INSET, (lo + hi) / 2);
    if (!next) {
      // Past the last exhibit: walking BACK from the bridge run is completed
      // into the last park once committed; forward is left alone.
      if (dir > 0) return null;
      const f = (p - hi) / (BRIDGE_ENTER_P - hi);
      return f > 0 && f < 1 - SETTLE_COMMIT ? backInto : null;
    }
    if (p > hi && p < next[0]) {
      const f = (p - hi) / (next[0] - hi);
      const aheadInto = Math.min(next[0] + SETTLE_INSET, (next[0] + next[1]) / 2);
      if (dir > 0) {
        if (flick && f < SETTLE_BACK && i > 0) return backInto;
        return f >= SETTLE_COMMIT ? aheadInto : null;
      }
      if (flick && 1 - f < SETTLE_BACK) return aheadInto;
      return 1 - f >= SETTLE_COMMIT ? backInto : null;
    }
  }
  return null;
}

/** Nearest park landing in direction dir from p, ignoring commitment. Used to
 *  land nav jumps on a composed view. Null when p is already parked. */
export function nearestParkAhead(p: number, dir: 1 | -1): number | null {
  for (let i = 0; i < PARKS.length; i++) {
    const [lo, hi] = PARKS[i];
    if (p >= lo - 1e-4 && p <= hi + 1e-4) return null;
    const next = PARKS[i + 1];
    if (!next) return dir < 0 ? Math.max(hi - SETTLE_INSET, (lo + hi) / 2) : null;
    if (p > hi && p < next[0]) {
      return dir > 0
        ? Math.min(next[0] + SETTLE_INSET, (next[0] + next[1]) / 2)
        : Math.max(hi - SETTLE_INSET, (lo + hi) / 2);
    }
  }
  return null;
}

/** Continuous "stop coordinate" of progress p: 0 at the airlock, 1 at the
 *  showreel, 2..11 at the dwell-slot centres, 12 at the bridge, linear in
 *  between. Distances in it count exhibits, not raw progress: the lobby hops
 *  (0 to 0.135 to 0.25) are one stop each just like a room-to-room hop, so
 *  Rig can tell a one-stop hop from a long trip anywhere on the walk. */
export function stopCoord(p: number): number {
  const s = STOP_PROGRESSES;
  if (p <= s[0]) return 0;
  for (let i = 1; i < s.length; i++) {
    if (p <= s[i]) return i - 1 + (p - s[i - 1]) / (s[i] - s[i - 1]);
  }
  return s.length - 1;
}

/** Exhibits between two progress values (see stopCoord). */
export const stopsBetween = (a: number, b: number) => Math.abs(stopCoord(a) - stopCoord(b));

/** Progress spacing of the stops around p (for speed-in-stops estimates). */
export function stopSpacingAt(p: number): number {
  const s = STOP_PROGRESSES;
  for (let i = 1; i < s.length; i++) if (p <= s[i]) return s[i] - s[i - 1];
  return s[s.length - 1] - s[s.length - 2];
}

/**
 * Inverse of cameraXAt restricted to the progress range between `from` and
 * `to` (either order): the progress at which the camera, travelling from
 * `from` toward `to`, reaches world x. Where the path is flat (a park) it
 * returns the park edge the camera LEAVES from, or the destination itself, so
 * a glide that starts parked leaves at once and one that ends parked ends
 * exactly on `to`. cameraXAt is monotone non-decreasing, so bisection is exact.
 */
export function progressAtCameraX(x: number, from: number, to: number): number {
  const fwd = to >= from;
  let lo = fwd ? from : to;
  let hi = fwd ? to : from;
  if (fwd) {
    // sup { q in [from, to] : X(q) <= x }
    if (cameraXAt(hi) <= x) return hi;
    if (cameraXAt(lo) > x) return lo;
    for (let k = 0; k < 32; k++) {
      const m = (lo + hi) / 2;
      if (cameraXAt(m) <= x) lo = m;
      else hi = m;
    }
    return lo;
  }
  // inf { q in [to, from] : X(q) >= x }
  if (cameraXAt(lo) >= x) return lo;
  if (cameraXAt(hi) < x) return hi;
  for (let k = 0; k < 32; k++) {
    const m = (lo + hi) / 2;
    if (cameraXAt(m) >= x) hi = m;
    else lo = m;
  }
  return hi;
}
