"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { useGLTF, useAnimations } from "@react-three/drei";
import { withBase } from "@/lib/asset";

/**
 * Real low-poly CC0 human figures (Quaternius "Worker") standing along the
 * corridor — they give the hall human scale + life (like the gapsy reference's
 * people). The model ships rigged in a T-pose, so we PLAY its "Idle_Neutral"
 * clip (offset per figure so they aren't synced) for a natural standing stance.
 * Kept to the side walls, sparse, facing inward.
 */
const URL = withBase("/models/person-b.glb");
useGLTF.preload(URL);

function Figure({ x, z, ry, height, seed }: { x: number; z: number; ry: number; height: number; seed: number }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(URL);
  // SkeletonUtils.clone preserves the skin→bone bindings so the animation
  // actually deforms each independent clone (plain .clone does not).
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, names } = useAnimations(animations, cloned);

  useEffect(() => {
    const name = names.find((n) => /Idle_Neutral/i.test(n)) ?? names.find((n) => /Idle/i.test(n)) ?? names[0];
    const a = name ? actions[name] : null;
    if (a) {
      a.reset().play();
      a.time = seed * (a.getClip().duration || 1); // desync
      a.setEffectiveTimeScale(0.85 + seed * 0.3);
    }
    return () => {
      if (a) a.stop();
    };
  }, [actions, names, seed]);

  // fit height + feet on floor (measured once on the source pose; idle stays close)
  const scale = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    return height / (size.y || 1);
  }, [scene, height]);

  return (
    <group ref={group} position={[x, 0, z]} rotation-y={ry} scale={scale}>
      <primitive object={cloned} />
    </group>
  );
}

export default function Figures() {
  // hard-coded positions along the hall (ROOMS x ≈ first room 52 … last ≈ 140);
  // people stand in corridor gaps near a wall, three-quarter facing the centre.
  const HALF = 3.7;
  // X values chosen to sit in the open corridor BETWEEN bays (not inside a niche),
  // near a side wall, so you pass them as you walk the hall.
  const figs = useMemo(
    () => [
      { x: 40, z: -(HALF - 0.55), ry: 0.8, height: 1.78, seed: 0.13 },
      { x: 63, z: HALF - 0.55, ry: Math.PI - 0.9, height: 1.74, seed: 0.42 },
      { x: 88, z: -(HALF - 0.55), ry: 0.6, height: 1.8, seed: 0.67 },
      { x: 112, z: HALF - 0.55, ry: Math.PI - 0.7, height: 1.76, seed: 0.88 },
      { x: 132, z: -(HALF - 0.55), ry: 0.7, height: 1.77, seed: 0.31 },
    ],
    [],
  );
  return (
    <group>
      {figs.map((f, i) => (
        <Figure key={i} {...f} />
      ))}
    </group>
  );
}
