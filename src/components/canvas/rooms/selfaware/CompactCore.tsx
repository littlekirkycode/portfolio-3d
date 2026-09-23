"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLOW, MATERIALS, NEUTRAL } from "../../theme";
import { getPuckTex } from "../shared";
import { ORBIT } from "./memories";
import { chipGeometry, lightTint, useChipAtlas } from "./tiles";
import { useDeferredDispose } from "./dispose";
import { useShellMaterial, useShellUniforms } from "./MemoryCore";

/* ── portrait-only: the memory core as a low floor emitter ──────────────────
 * On phones the left column (the full core + recall display) is off-frame,
 * so the bay would read as an empty blue box. This sits at the mat's front
 * edge under the info card, nothing taller than ~0.32 m: a machined emitter
 * puck, a small glass orb with a faceted core, and the three recalled memory
 * tiles standing on a flat orbit ring around it — the same story in a
 * footprint that never covers the card or the phone screen.
 * ──────────────────────────────────────────────────────────────────────── */

const RING_R = 0.42;
const ORB_R = 0.13;
const ORB_Y = 0.24;
const TILE = 0.15;

export default function CompactCore({ accent, animate }: { accent: string; animate: boolean }) {
  const atlas = useChipAtlas(accent);
  const ring = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const clock = useRef(0);
  const shellUniforms = useShellUniforms(accent, ORB_R);
  const shellMat = useShellMaterial(shellUniforms);
  const lit = useMemo(() => ORBIT.map((m, i) => ({ ...m, i })).filter((m) => m.score !== undefined), []);

  const mats = useMemo(
    () => ({
      puck: MATERIALS.paintLight({ color: NEUTRAL.hullLight }),
      steel: MATERIALS.paint({ color: NEUTRAL.hull }),
      lens: MATERIALS.emit(lightTint(accent, 0.35), GLOW.trim),
      gap: MATERIALS.paint({ color: NEUTRAL.hullShadow }),
      trim: MATERIALS.emit(lightTint(accent, 0.35), GLOW.trim),
      track: new THREE.MeshBasicMaterial({ color: lightTint(accent, 0.2).multiplyScalar(GLOW.trim * 0.9), toneMapped: false }),
      crystal: new THREE.MeshStandardMaterial({
        color: lightTint(accent, 0.3),
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.3,
        flatShading: true,
      }),
      chip: new THREE.MeshBasicMaterial({ map: atlas, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }),
      halo: new THREE.MeshBasicMaterial({ map: getPuckTex(), color: accent, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      shadow: new THREE.MeshBasicMaterial({ map: getPuckTex(), color: NEUTRAL.void, transparent: true, opacity: 0.4, depthWrite: false }),
    }),
    [accent, atlas],
  );
  const chipGeos = useMemo(() => lit.map((m) => chipGeometry(m.i, TILE)), [lit]);
  useDeferredDispose(mats);
  useDeferredDispose(chipGeos);

  useFrame((_, dt) => {
    if (!animate) return;
    clock.current += Math.min(dt, 1 / 30);
    if (ring.current) ring.current.rotation.y = 0.12 * Math.sin((clock.current * Math.PI * 2) / 28);
    if (crystal.current) crystal.current.rotation.y += Math.min(dt, 1 / 30) * 0.15;
  });

  return (
    <group>
      <mesh position={[0, 0.003, 0]} rotation-x={-Math.PI / 2} material={mats.shadow}>
        <planeGeometry args={[0.9, 0.9]} />
      </mesh>
      {/* emitter puck: painted body, polished rim, trim line, lens */}
      <mesh position={[0, 0.03, 0]} material={mats.puck}>
        <cylinderGeometry args={[0.17, 0.19, 0.06, 48]} />
      </mesh>
      <mesh position={[0, 0.064, 0]} material={mats.steel}>
        <cylinderGeometry args={[0.16, 0.17, 0.01, 48]} />
      </mesh>
      <mesh position={[0, 0.036, 0]} rotation-x={Math.PI / 2} material={mats.trim}>
        <torusGeometry args={[0.186, 0.004, 6, 48]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation-x={-Math.PI / 2} material={mats.gap}>
        <circleGeometry args={[0.11, 32]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={mats.lens}>
        <sphereGeometry args={[0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* the orb: faceted core inside a faint glass shell */}
      <group position={[0, ORB_Y, 0]}>
        <mesh material={mats.halo}>
          <planeGeometry args={[0.5, 0.5]} />
        </mesh>
        <mesh ref={crystal} material={mats.crystal} rotation={[0.35, 0, 0.2]}>
          <icosahedronGeometry args={[ORB_R * 0.5, 0]} />
        </mesh>
        <mesh material={shellMat}>
          <sphereGeometry args={[ORB_R, 32, 20]} />
        </mesh>
      </group>
      {/* flat orbit ring at puck height with the three recalled tiles */}
      <group ref={ring} position={[0, 0.03, 0]}>
        <mesh rotation-x={Math.PI / 2} material={mats.track}>
          <torusGeometry args={[RING_R, 0.004, 6, 96]} />
        </mesh>
        {lit.map((m, k) => {
          // spread across the front arc so all three face the camera
          const a = -0.95 + k * 0.95;
          return (
            <mesh
              key={m.i}
              geometry={chipGeos[k]}
              material={mats.chip}
              position={[Math.sin(a) * RING_R, TILE / 2 + 0.01, Math.cos(a) * RING_R]}
              rotation-y={a * 0.5}
            />
          );
        })}
      </group>
    </group>
  );
}
