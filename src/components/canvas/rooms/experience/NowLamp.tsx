"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLOW, INK, MATERIALS, NEUTRAL } from "../../theme";

/* ── the NOW lamp ────────────────────────────────────────────────────────────
 * The head of the Ascent: a slim post lamp standing on the landing. A heavy
 * disc foot, a brushed post and a lantern head with broad machined caps
 * around a frosted opal drum lit from within — a clear lamp silhouette at
 * dwell distance, and the single brightest point in the bay. Entirely static
 * (no pulse). */

export default function NowLamp({
  accent,
  position,
  height = 0.44,
}: {
  accent: string;
  position: [number, number, number];
  /** height of the lantern head's centre above the surface it stands on */
  height?: number;
}) {
  const mats = useMemo(() => {
    const c = new THREE.Color(accent);
    return {
      foot: MATERIALS.paintLight(),
      steel: MATERIALS.polished(),
      post: MATERIALS.steel(),
      cap: MATERIALS.paintLight({ color: NEUTRAL.steelLight }),
      // frosted opal: lit from within, reads as a soft glowing volume
      opal: new THREE.MeshStandardMaterial({
        color: new THREE.Color(NEUTRAL.steelLight).lerp(c, 0.3),
        emissive: c.clone().lerp(new THREE.Color(INK), 0.35),
        emissiveIntensity: 1.35,
        roughness: 0.35,
        metalness: 0,
      }),
      trim: MATERIALS.emit(accent, GLOW.trim),
    };
  }, [accent]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const hy = height;
  const HR = 0.074; // opal drum radius
  const HH = 0.18; // opal drum height
  return (
    <group position={position} name="experience-now-lamp">
      {/* heavy disc foot + polished top disc */}
      <mesh position={[0, 0.02, 0]} material={mats.foot}>
        <cylinderGeometry args={[0.105, 0.115, 0.04, 36]} />
      </mesh>
      <mesh position={[0, 0.045, 0]} material={mats.steel}>
        <cylinderGeometry args={[0.07, 0.09, 0.012, 36]} />
      </mesh>
      {/* post */}
      <mesh position={[0, (hy - HH / 2 + 0.05) / 2, 0]} material={mats.post}>
        <cylinderGeometry args={[0.011, 0.014, hy - HH / 2 - 0.02, 14]} />
      </mesh>
      {/* lantern: broad lower cap + trim ring, opal drum, broad crown */}
      <mesh position={[0, hy - HH / 2 - 0.014, 0]} material={mats.cap}>
        <cylinderGeometry args={[HR + 0.018, HR * 0.55, 0.03, 32]} />
      </mesh>
      <mesh position={[0, hy - HH / 2 + 0.002, 0]} material={mats.trim}>
        <cylinderGeometry args={[HR + 0.02, HR + 0.02, 0.004, 32]} />
      </mesh>
      <mesh position={[0, hy, 0]} material={mats.opal}>
        <cylinderGeometry args={[HR, HR, HH, 32]} />
      </mesh>
      <mesh position={[0, hy + HH / 2 + 0.012, 0]} material={mats.cap}>
        <cylinderGeometry args={[HR * 0.6, HR + 0.02, 0.026, 32]} />
      </mesh>
      <mesh position={[0, hy + HH / 2 + 0.03, 0]} material={mats.steel}>
        <cylinderGeometry args={[0.012, 0.03, 0.014, 16]} />
      </mesh>
    </group>
  );
}
