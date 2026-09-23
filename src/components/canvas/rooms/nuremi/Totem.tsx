"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLOW, INK, MATERIALS, NEUTRAL, tintNeutral } from "../../theme";
import { getPuckTex } from "../shared";
import { FACE, atlasUV, mapPlaneUV } from "./pins";

/* ── the wayfinding totem (right lane) ──────────────────────────────────────
 * A slim city wayfinding post — "the world around you", the half of Nuremi
 * that is about place. A satin-paint monolith on a light plinth, a smoked
 * glass face carrying the Nuremi pin mark, the name set along the strip and
 * a "you → 1" route legend (the same picks as the table), crowned by a
 * physical map pin standing on a polished collet. It balances the table
 * across the bay and ties the room's two sides into one story.
 *
 * Placement: the right lane (x ∈ [3.3, 3.6], z ∈ [0.8, 2.3]), square to the
 * dwell camera; x-extent ≈ 3.29…3.61 (clear of the side wall at 3.70), right
 * of the info panel's edge. Static — nothing moves. */

const AT = { x: 3.45, z: 1.86 };
const RY = Math.atan2(-AT.x, 6.15 - AT.z); // face the corridor camera
const BODY = { w: 0.25, d: 0.075, y0: 0.06, h: 1.14 };
const FACE_W = 0.2;
const FACE_H = (FACE_W * FACE.h) / FACE.w;

/** Teardrop map-pin solid (lathe), tip at the origin, height ≈ yc + rh. */
function usePinGeometry(rh: number, yc: number) {
  const g = useMemo(() => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
    const a0 = Math.acos(rh / yc); // tangent from the tip onto the head
    for (let i = 0; i <= 24; i++) {
      const a = a0 + ((Math.PI - a0) * i) / 24;
      pts.push(new THREE.Vector2(Math.max(1e-4, rh * Math.sin(a)), yc - rh * Math.cos(a)));
    }
    pts[pts.length - 1].x = 0;
    return new THREE.LatheGeometry(pts, 40);
  }, [rh, yc]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

export default function Totem({ accent, atlas }: { accent: string; atlas: THREE.Texture }) {
  const mats = useMemo(
    () => ({
      plinth: MATERIALS.paintLight({ color: new THREE.Color(NEUTRAL.hullLight).lerp(new THREE.Color(NEUTRAL.steel), 0.45) }),
      // light satin paint: the right lane sits outside the bay's light pool,
      // so the body is a pale neutral to keep its form (no black silhouette)
      body: new THREE.MeshStandardMaterial({
        color: new THREE.Color(NEUTRAL.steel).lerp(new THREE.Color(NEUTRAL.steelLight), 0.35).lerp(new THREE.Color(accent), 0.06),
        roughness: 0.5,
        metalness: 0.12,
      }),
      frame: MATERIALS.paint({ color: tintNeutral(NEUTRAL.hull, accent, 0.1) }),
      polished: MATERIALS.polished(),
      trim: MATERIALS.emit(accent, GLOW.trim),
      pin: new THREE.MeshStandardMaterial({
        color: new THREE.Color(accent).lerp(new THREE.Color(INK), 0.12),
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.22,
        roughness: 0.3,
        metalness: 0.1,
      }),
      eye: MATERIALS.emit(INK, 0.9),
    }),
    [accent],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const face = useMemo(() => {
    const g = new THREE.PlaneGeometry(FACE_W, FACE_H);
    mapPlaneUV(g, atlasUV(FACE.x, FACE.y, FACE.w, FACE.h));
    return g;
  }, []);
  useEffect(() => () => face.dispose(), [face]);

  const pinRh = 0.062;
  const pinYc = 0.14;
  const pinGeo = usePinGeometry(pinRh, pinYc);
  const top = BODY.y0 + BODY.h;
  const faceY = BODY.y0 + BODY.h - 0.06 - FACE_H / 2;

  return (
    <group position={[AT.x, 0, AT.z]} rotation-y={RY}>
      {/* floor: soft exhibit glow + plinth */}
      <mesh position={[0, 0.011, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshBasicMaterial map={getPuckTex()} color={accent} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* accent keylines up both front edges (the post's silhouette) */}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * (BODY.w / 2 - 0.004), BODY.y0 + BODY.h / 2, BODY.d / 2 + 0.001]} material={mats.trim}>
          <boxGeometry args={[0.006, BODY.h - 0.02, 0.004]} />
        </mesh>
      ))}
      <mesh position={[0, 0.03, 0]} material={mats.plinth}>
        <boxGeometry args={[0.31, 0.06, 0.13]} />
      </mesh>
      <mesh position={[0, 0.061, 0.066]} material={mats.trim}>
        <boxGeometry args={[0.27, 0.006, 0.004]} />
      </mesh>

      {/* monolith + face frame + glass face */}
      <mesh position={[0, BODY.y0 + BODY.h / 2, 0]} material={mats.body}>
        <boxGeometry args={[BODY.w, BODY.h, BODY.d]} />
      </mesh>
      <mesh position={[0, faceY, BODY.d / 2 + 0.002]} material={mats.frame}>
        <boxGeometry args={[FACE_W + 0.018, FACE_H + 0.018, 0.004]} />
      </mesh>
      <mesh geometry={face} position={[0, faceY, BODY.d / 2 + 0.0045]}>
        <meshBasicMaterial map={atlas} transparent toneMapped={false} />
      </mesh>
      {/* polished cap */}
      <mesh position={[0, top + 0.01, 0]} material={mats.polished}>
        <boxGeometry args={[BODY.w + 0.014, 0.02, BODY.d + 0.014]} />
      </mesh>

      {/* the pin: a polished collet on the cap holds it tip-down */}
      <mesh position={[0, top + 0.035, 0]} material={mats.polished}>
        <cylinderGeometry args={[0.012, 0.024, 0.03, 20]} />
      </mesh>
      <group position={[0, top + 0.044, 0]}>
        <mesh geometry={pinGeo} material={mats.pin} />
        <mesh position={[0, pinYc, pinRh + 0.001]} material={mats.eye}>
          <circleGeometry args={[0.024, 28]} />
        </mesh>
      </group>
    </group>
  );
}
