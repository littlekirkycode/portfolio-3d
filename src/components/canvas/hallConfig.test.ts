/**
 * Invariant tests for hallConfig.ts (finding 29): the comment-enforced rules
 * this module relies on — KEYS keyframe ordering, non-overlapping dwell/focus
 * bands, porthole clearance, and gallery tile-snapping — have no other
 * automated check anywhere, so a future edit (e.g. adding a 10th room, or
 * moving ROOM_LO/ROOM_HI) can silently violate them.
 *
 * KEYS itself (the p→x keyframe list) is module-private, so where a test
 * below can't reach it directly it exercises the same invariant through the
 * public functions built on top of it (cameraXAt, focusAt, galleryFocusAt,
 * featureFocusAt, STOP_PROGRESSES) instead of modifying hallConfig.ts to
 * export internals.
 */
import { describe, expect, it } from "vitest";
import {
  ROOMS,
  GATES,
  PORTHOLES,
  GALLERY_X,
  GALLERY_SIDE,
  GALLERY_SPAN,
  FEATURE_X,
  ALCOVE_OPEN_W,
  WALL_START,
  TILE,
  STOP_PROGRESSES,
  cameraXAt,
  focusAt,
  galleryFocusAt,
  featureFocusAt,
  BRIDGE_ENTER_P,
  HERO_FADE_START,
  HALF_W,
  GLASS_INSET,
  GLASS_Z,
  FEATURE_GLASS_Z,
  FEATURE_RECESS_DEPTH,
} from "./hallConfig";

const EPS = 1e-9;

describe("cameraXAt (KEYS keyframe interpolation)", () => {
  // KEYS' "p-values strictly increasing" invariant is only observable from
  // outside the module through cameraXAt's monotonicity: it linearly
  // interpolates (with smoothstep easing) between consecutive KEYS entries
  // and returns the first interval containing p, so a KEYS regression (an
  // out-of-order or duplicate p) would show up here as a non-monotonic or
  // discontinuous camera path.
  it("is monotone non-decreasing across a dense sample of progress in [0, 1]", () => {
    const SAMPLES = 4000;
    let prevX = cameraXAt(0);
    for (let i = 1; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      const x = cameraXAt(p);
      expect(x, `regression at p=${p}`).toBeGreaterThanOrEqual(prevX - EPS);
      prevX = x;
    }
  });

  it("clamps progress outside [0, 1] to the endpoint camera positions", () => {
    expect(cameraXAt(-1)).toBe(cameraXAt(0));
    expect(cameraXAt(-100)).toBe(cameraXAt(0));
    expect(cameraXAt(2)).toBe(cameraXAt(1));
    expect(cameraXAt(50)).toBe(cameraXAt(1));
  });
});

describe("STOP_PROGRESSES (mobile dwell-stop hop targets)", () => {
  it("is strictly increasing", () => {
    for (let i = 1; i < STOP_PROGRESSES.length; i++) {
      expect(STOP_PROGRESSES[i]).toBeGreaterThan(STOP_PROGRESSES[i - 1]);
    }
  });

  it("starts at the airlock (0) and ends at the bridge (1)", () => {
    expect(STOP_PROGRESSES[0]).toBe(0);
    expect(STOP_PROGRESSES[STOP_PROGRESSES.length - 1]).toBe(1);
  });
});

describe("focus bands are mutually non-overlapping", () => {
  // focusAt (any of the 9 rooms), galleryFocusAt (observation gallery, slot
  // 5) and featureFocusAt (lobby showreel) are documented as living in
  // disjoint progress windows ("windows never overlap, so the first hit
  // wins" / "slot windows tile without overlapping"). Sample densely and
  // assert at most one is ever active.
  it("never has more than one of {room, gallery, feature} active at once", () => {
    const SAMPLES = 4000;
    for (let i = 0; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      const roomActive = focusAt(p).room !== null;
      const galleryActive = galleryFocusAt(p) > 0;
      const featureActive = featureFocusAt(p) > 0;
      const activeCount =
        Number(roomActive) + Number(galleryActive) + Number(featureActive);
      expect(
        activeCount,
        `progress=${p} room=${roomActive} gallery=${galleryActive} feature=${featureActive}`
      ).toBeLessThanOrEqual(1);
    }
  });

  it("each dwell-slot centre (STOP_PROGRESSES) focuses exactly the room/gallery it should", () => {
    // Ten dwell slots sit at STOP_PROGRESSES[2 .. 2+N_SLOTS-1] — index 0 is
    // the airlock start (0) and index 1 is the lobby-showreel hold (0.135),
    // the final entry is the bridge (1). Slots 0-4 map to ROOMS[0..4], slot 5
    // is the observation gallery, slots 6-9 map to ROOMS[5..8] — see the
    // "Ten dwell slots" comment above GALLERY_SLOT in hallConfig.ts.
    const N_SLOTS = ROOMS.length + 1;
    const GALLERY_SLOT = 5;
    const slotCentres = STOP_PROGRESSES.slice(2, 2 + N_SLOTS);
    expect(slotCentres).toHaveLength(N_SLOTS);

    slotCentres.forEach((p, slot) => {
      if (slot === GALLERY_SLOT) {
        expect(galleryFocusAt(p), `gallery slot @p=${p}`).toBe(1);
        expect(focusAt(p).room, `gallery slot @p=${p}`).toBeNull();
        expect(featureFocusAt(p), `gallery slot @p=${p}`).toBe(0);
      } else {
        const roomIndex = slot < GALLERY_SLOT ? slot : slot - 1;
        const { room, ease } = focusAt(p);
        expect(room, `slot ${slot} @p=${p}`).toBe(ROOMS[roomIndex]);
        expect(ease, `slot ${slot} @p=${p}`).toBe(1);
        expect(galleryFocusAt(p), `slot ${slot} @p=${p}`).toBe(0);
        expect(featureFocusAt(p), `slot ${slot} @p=${p}`).toBe(0);
      }
    });
  });
});

describe("shared progress/geometry constants (finding 32)", () => {
  it("BRIDGE_ENTER_P sits past every dwell slot and before the end of travel", () => {
    // The last dwell-slot centre is the second-to-last STOP_PROGRESSES entry
    // (the final entry is the bridge itself at 1). The camera must only be
    // "at the bridge" after it has left the last exhibit.
    const lastSlotCentre = STOP_PROGRESSES[STOP_PROGRESSES.length - 2];
    expect(BRIDGE_ENTER_P).toBeGreaterThan(lastSlotCentre);
    expect(BRIDGE_ENTER_P).toBeLessThan(1);
    // No room/gallery/feature focus band may still be active at the threshold.
    expect(focusAt(BRIDGE_ENTER_P).room).toBeNull();
    expect(galleryFocusAt(BRIDGE_ENTER_P)).toBe(0);
    expect(featureFocusAt(BRIDGE_ENTER_P)).toBe(0);
  });

  it("HERO_FADE_START is a first-beat-of-scroll threshold", () => {
    expect(HERO_FADE_START).toBeGreaterThan(0);
    // well before the first hold (the lobby showreel stop)
    expect(HERO_FADE_START).toBeLessThan(STOP_PROGRESSES[1]);
  });

  it("glass planes sit just inside the corridor walls and agree with the recess", () => {
    expect(GLASS_INSET).toBeGreaterThan(0);
    expect(GLASS_Z).toBe(HALF_W - GLASS_INSET);
    expect(GLASS_Z).toBeGreaterThan(0);
    expect(GLASS_Z).toBeLessThan(HALF_W);
    // The showreel glass = wall glass pushed out by exactly the wall recess
    // (Rig's look target and FeatureScreen's plane both import this value).
    expect(FEATURE_GLASS_Z).toBeCloseTo(GLASS_Z + FEATURE_RECESS_DEPTH, 12);
  });
});

describe("GALLERY_X", () => {
  it("is snapped to a wall-tile column centre", () => {
    // Columns sit at WALL_START + TILE/2 + TILE*n (see snapToColumn in
    // hallConfig.ts); GALLERY_X must land exactly on one.
    const offset = (GALLERY_X - WALL_START - TILE / 2) / TILE;
    expect(Math.abs(offset - Math.round(offset))).toBeLessThan(1e-6);
  });
});

describe("PORTHOLES clearance", () => {
  // Mirrors the `clear()` predicate baked into the PORTHOLES IIFE in
  // hallConfig.ts (module-private, so re-applied here against the exported
  // ROOMS/GALLERY_X/GATES/FEATURE_X data) with the same margins used in the
  // source (1.2 bay/gallery, 4.5 feature, 2.2 gate) so a future edit to
  // ROOMS/GALLERY_X/GATES that breaks clearance fails this test even if the
  // generator itself doesn't change.
  const isClear = (x: number, side: 1 | -1) => {
    const bayOverlap = ROOMS.some(
      (r) => r.side === side && Math.abs(x - r.x) < ALCOVE_OPEN_W / 2 + 1.2
    );
    const galleryOverlap =
      side === GALLERY_SIDE && Math.abs(x - GALLERY_X) < GALLERY_SPAN / 2 + 1.2;
    const featureOverlap = side === 1 && Math.abs(x - FEATURE_X) < 4.5;
    const gateOverlap = GATES.some((g) => Math.abs(x - g.x) < 2.2);
    return !bayOverlap && !galleryOverlap && !featureOverlap && !gateOverlap;
  };

  it("generates at least one porthole", () => {
    expect(PORTHOLES.length).toBeGreaterThan(0);
  });

  it("every porthole clears all bay/gallery/gate/feature spans", () => {
    for (const p of PORTHOLES) {
      expect(isClear(p.x, p.side), `porthole at x=${p.x} side=${p.side}`).toBe(
        true
      );
    }
  });

  it("consecutive portholes are spread >= 18 world units apart", () => {
    for (let i = 1; i < PORTHOLES.length; i++) {
      expect(PORTHOLES[i].x - PORTHOLES[i - 1].x).toBeGreaterThanOrEqual(18);
    }
  });
});
