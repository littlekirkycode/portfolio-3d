"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { PerspectiveCamera } from "three";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";
import { damp } from "@/lib/math";
import { TRAVEL, EYE_Y, HALF_W, cameraXAt, focusAt, featureFocusAt, FEATURE_X } from "./hallConfig";

export { TRAVEL };

type RigProps = { frozen?: boolean; zScale?: number };

/**
 * Camera dolly down the corridor. X follows a waypoint path (see hallConfig)
 * that EASES + DWELLS at each room (so you slow down and linger). When focused
 * on a room it looks at the room's CENTRE (room.x, side wall) — so the room is
 * squarely framed, not off to one side — turning nearly fully sideways.
 * Mouse only adds a tiny positional parallax.
 */
export default function Rig({ frozen = false, zScale = 1 }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const lookX = useRef(0);
  const lookZ = useRef(0);
  const focusedId = useRef<string | null>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);

    if (frozen) {
      camera.position.set(cameraXAt(0.05), EYE_Y, 0);
      camera.rotation.z = 0;
      camera.lookAt(camera.position.x + 6, EYE_Y, 0);
      return;
    }

    const p = scrollRefs.progress;

    // Slow, eased motion (low damping) keeps turns lazy + smooth — much less
    // disorienting than snappy transitions. No velocity FOV kick (nausea trigger).
    // Camera is driven purely by scroll — the mouse never moves it.
    camera.position.x = damp(camera.position.x, cameraXAt(p), 4.0, dt);
    camera.position.z = damp(camera.position.z, 0, 3, dt);
    camera.position.y = damp(camera.position.y, EYE_Y, 3, dt);

    const f = focusAt(p);
    // Publish the focused bay (coarse — only on change) so the DOM can show a
    // "Visit project" link for it.
    const fid = f.room && f.ease > 0.85 ? f.room.id : null;
    if (fid !== focusedId.current) {
      focusedId.current = fid;
      useScrollStore.getState().setFocusedRoom(fid);
    }
    let tx = camera.position.x + 6;
    let tz = 0;
    if (f.room) {
      // Blend the look target from "straight ahead" to the room's exact centre.
      // zScale matches the mobile Z-squash so the turn aims at the moved wall.
      tx = camera.position.x + 6 + f.ease * (f.room.x - (camera.position.x + 6));
      tz = f.ease * f.room.side * (HALF_W + 1.3) * zScale;
    }
    // Entrance showreel: turn to face the feature screen (on the +Z wall) during
    // its lobby band (no overlap with room bands).
    const ff = featureFocusAt(p);
    if (ff > 0) {
      // Flat wall screen (not recessed like a room) — aim the look target EXACTLY
      // at the screen plane (z ≈ HALF_W), turning fully sideways, so it frames
      // head-on. Overshooting (like rooms do) would slide a flat panel off-frame.
      tx = camera.position.x + 6 + ff * (FEATURE_X - (camera.position.x + 6));
      tz = ff * (HALF_W - 0.06) * zScale;
    }
    lookX.current = damp(lookX.current, tx, 4.0, dt);
    lookZ.current = damp(lookZ.current, tz, 4.0, dt);
    camera.lookAt(lookX.current, EYE_Y, camera.position.z + lookZ.current);
  });

  return null;
}
