"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { PerspectiveCamera } from "three";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";
import { damp } from "@/lib/math";
import {
  EYE_Y,
  cameraXAt,
  focusAt,
  featureFocusAt,
  galleryFocusAt,
  FEATURE_X,
  GALLERY_X,
  GALLERY_SIDE,
  HALF_W,
  GLASS_Z,
  FEATURE_GLASS_Z,
} from "./hallConfig";

type RigProps = { frozen?: boolean; mobile?: boolean };

/** Portrait step distances: how far the camera walks TOWARD (+) or AWAY from
 *  (−) the focused exhibit (world z) at full dwell. Desktop stays on the
 *  corridor centreline. Bays: portrait reads side-glanced alcoves too small,
 *  so the camera closes ~half the gap and frames them head-on. Showreel: the
 *  panel is WIDE — portrait must back off or it crops both edges (QA mobile
 *  shot1). Gallery: no step — the drifting pilot sits off-centre in the
 *  glazing run and any step-in pushes him out of the narrow frame. */
const STEP_BAY = 1.8;
const STEP_FEATURE = -0.6;
const STEP_GALLERY = 0;

// stable debug payload for window.__rig — see the bottom of Rig's useFrame
const rigDebug = {
  p: 0,
  camX: 0,
  targetX: 0,
  lookX: 0,
  lookZ: 0,
  focusRoom: null as string | null,
  focusEase: 0,
  galleryEase: 0,
};

/**
 * Camera dolly down the corridor. X follows a waypoint path (see hallConfig)
 * that EASES + DWELLS at each room (so you slow down and linger). When focused
 * on a room it looks at the room's CENTRE (room.x, side wall) — so the room is
 * squarely framed, not off to one side — turning nearly fully sideways.
 * Mouse only adds a tiny positional parallax.
 */
export default function Rig({ frozen = false, mobile = false }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const lookX = useRef(0);
  const lookZ = useRef(0);
  const focusedId = useRef<string | null>(null);
  const snapped = useRef(false);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);

    const p = scrollRefs.progress;

    // First frame: SNAP to the scroll-derived position. The Canvas camera
    // boots at x=0, and damping from there produced a ~1.5s fly-in through
    // the backstage lobby (its SEALED sign + a second KIRKHAM stencil) on
    // every load/refresh (QA: "goes to a secondary kirkham / airlock sealed").
    if (!snapped.current) {
      camera.position.set(cameraXAt(p), EYE_Y, 0);
      lookX.current = camera.position.x + 6;
      lookZ.current = 0;
      snapped.current = true;
    }

    const f = focusAt(p);
    const gf = galleryFocusAt(p);
    const ff = featureFocusAt(p);

    // Portrait step-in: walk toward the focused exhibit instead of glancing at
    // it from the centreline. Focus bands never overlap, so the terms sum.
    let zPos = 0;
    if (mobile) {
      zPos =
        (f.room ? f.ease * f.room.side * STEP_BAY : 0) +
        gf * GALLERY_SIDE * STEP_GALLERY +
        ff * STEP_FEATURE;
    }

    if (frozen) {
      // Reduced motion (finding 22): the camera stays fully SCROLL-MAPPED —
      // freezing it locked those users out of every exhibit. Scroll is
      // user-initiated, so position/look are set DIRECTLY from progress with
      // zero time-based easing (no damping, no drift); only the residual
      // motion sources (Effects, prop animation, velocity kicks) stay off.
      camera.position.set(cameraXAt(p), EYE_Y, zPos);
    } else {
      // Slow, eased motion (low damping) keeps turns lazy + smooth — much less
      // disorienting than snappy transitions. No velocity FOV kick (nausea trigger).
      // Camera is driven purely by scroll — the mouse never moves it.
      camera.position.x = damp(camera.position.x, cameraXAt(p), 4.0, dt);
      camera.position.z = damp(camera.position.z, zPos, 3, dt);
      camera.position.y = damp(camera.position.y, EYE_Y, 3, dt);
    }
    // Publish the focused bay (coarse — only on change) so the DOM can show a
    // "Visit project" link for it.
    const fid = f.room && f.ease > 0.85 ? f.room.id : null;
    if (fid !== focusedId.current) {
      focusedId.current = fid;
      useScrollStore.getState().setFocusedRoom(fid);
    }
    // Look-target z values are ABSOLUTE world z (not camera-relative): with the
    // portrait step-in the camera leaves the centreline, and a relative offset
    // would overshoot recessed bays and break the flat-panel rule below.
    // "Straight ahead" = the camera's own z (parallel to the hall).
    let tx = camera.position.x + 6;
    let tz = camera.position.z;
    if (f.room) {
      // Blend the look target from "straight ahead" to the room's exact centre.
      tx = camera.position.x + 6 + f.ease * (f.room.x - (camera.position.x + 6));
      tz = camera.position.z + f.ease * (f.room.side * (HALF_W + 1.3) - camera.position.z);
    }
    // Observation gallery (slot 5): turn to the +Z glazing run. FLAT-PANEL RULE:
    // the glazing is FLAT on the wall line, so aim the look target EXACTLY at
    // the glass plane z (inner wall face) — overshooting like the recessed bays
    // do would slide the flat panel off-frame. No overlap with room bands (the
    // gallery owns its own slot).
    if (gf > 0) {
      tx = camera.position.x + 6 + gf * (GALLERY_X - (camera.position.x + 6));
      tz = camera.position.z + gf * (GALLERY_SIDE * GLASS_Z - camera.position.z);
    }
    // Entrance showreel: turn to face the feature screen (on the +Z wall) during
    // its lobby band (no overlap with room bands).
    if (ff > 0) {
      // Flat panel — same rule: aim EXACTLY at the glass plane. The showreel is
      // recessed OUTWARD (FEATURE_GLASS_Z is shared with FeatureScreen's plane,
      // so the coupling can't drift — finding 32).
      tx = camera.position.x + 6 + ff * (FEATURE_X - (camera.position.x + 6));
      tz = camera.position.z + ff * (FEATURE_GLASS_Z - camera.position.z);
    }
    if (frozen) {
      // un-damped look: the head-turn is a pure function of scroll position
      lookX.current = tx;
      lookZ.current = tz;
    } else {
      lookX.current = damp(lookX.current, tx, 4.0, dt);
      lookZ.current = damp(lookZ.current, tz, 4.0, dt);
    }
    camera.lookAt(lookX.current, EYE_Y, lookZ.current);

    // Debug/verify hook (read by the screenshot harness). One stable object
    // mutated in place (no per-frame allocation), exposed non-enumerably so
    // window-walking dev tooling never tries to serialise it.
    rigDebug.p = p;
    rigDebug.camX = camera.position.x;
    rigDebug.targetX = cameraXAt(p);
    rigDebug.lookX = lookX.current;
    rigDebug.lookZ = lookZ.current;
    rigDebug.focusRoom = f.room?.id ?? null;
    rigDebug.focusEase = f.ease;
    rigDebug.galleryEase = gf;
    if (!(window as { __rig?: object }).__rig) {
      Object.defineProperty(window, "__rig", { value: rigDebug, configurable: true });
    }
  });

  return null;
}
