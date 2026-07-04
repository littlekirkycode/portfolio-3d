"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { PACK_SCALE } from "./hallConfig";
import { withBase } from "@/lib/asset";

/**
 * CC0 low-poly models. The corridor + props use ONE cohesive pack — Kenney's
 * "Space Station Kit" (the `kit-*` pieces). A handful of individual models are
 * kept purely as per-room "signature nods" (a kettlebell for the gym app, a gem
 * for the jewellery brand, etc.).
 */
const MODELS = [
  // reused low-poly CC0 objects
  "plant",
  "monitor",
  "trophy",
  "gem",
  "globe",
  "kettlebell",
  // Kenney Space Station Kit — corridor shell (instanced in KitShell)
  "kit-wall",
  "kit-floor",
  // app-specific low-poly props (one set per room — see RoomProps)
  "treadmill",
  "dumbbell",
  "robot",
  "deskq",
  "wateringcan",
  "compass",
  "pedestal",
  "ring",
  "necklace",
  "laptop",
  "officechair",
  "skyscraper",
  "sportstrophy",
  "drone",
] as const;

export type ModelName = (typeof MODELS)[number];
const urlFor = (n: ModelName) => withBase(`/models/${n}.glb`);
MODELS.forEach((n) => useGLTF.preload(urlFor(n)));

/**
 * Loads a GLB, clones it (so it can be reused across rooms), and places it.
 * Three scaling modes:
 *  - `raw`: uniform PACK_SCALE (use for kit pieces, so the whole pack shares one
 *    world scale and tiles seamlessly).
 *  - `maxDim`: scale so the LARGEST dimension equals maxDim (flat objects).
 *  - default: scale so total height equals `height`.
 */
export function Model({
  name,
  height = 1,
  maxDim,
  raw = false,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  onFloor = true,
  upZ = false,
}: {
  name: ModelName;
  height?: number;
  maxDim?: number;
  /** Native pack scale (PACK_SCALE), no per-object normalisation — for kit pieces. */
  raw?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onFloor?: boolean;
  upZ?: boolean;
}) {
  const { scene } = useGLTF(urlFor(name));
  const obj = useMemo(() => {
    // SkeletonUtils clone, NOT Object3D.clone: several FBX-converted packs
    // (drone, person-*) are SkinnedMesh rigs, and a plain deep clone leaves the
    // skin bound to the ORIGINAL (never-updated) bones — the mesh exists in the
    // graph but never draws (QA: invisible drone with floating nav lights).
    const c = cloneWithSkeleton(scene) as THREE.Group;
    c.traverse((o) => {
      // skinned bounding spheres go stale under our re-scaling — never cull
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    if (upZ) c.rotation.x = -Math.PI / 2;
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = raw
      ? PACK_SCALE
      : maxDim
        ? maxDim / (Math.max(size.x, size.y, size.z) || 1)
        : height / (size.y || 1);
    c.scale.setScalar(s);
    c.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(c);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    c.position.x -= center.x;
    c.position.z -= center.z;
    c.position.y -= onFloor ? box2.min.y : center.y;
    return c;
  }, [scene, height, maxDim, raw, onFloor, upZ]);

  return (
    <group position={position} rotation={rotation}>
      <primitive object={obj} />
    </group>
  );
}

/**
 * Extracts a single merged geometry (baked to native scale) + material from a kit
 * GLB, for use with InstancedMesh. Every kit piece is one mesh sharing the
 * `colormap` atlas, so this is cheap and lets the whole shell render in a couple
 * of draw calls.
 */
export function useKitPiece(name: ModelName): {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
} {
  const { scene } = useGLTF(urlFor(name));
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error(`no mesh in ${name}`);
    const m = mesh as THREE.Mesh;
    const geometry = m.geometry.clone();
    geometry.applyMatrix4(m.matrixWorld); // bake to native (1-unit) scale
    const material = Array.isArray(m.material) ? m.material[0] : m.material;
    return { geometry, material };
  }, [scene, name]);
}

/** Gentle Y spin (for volumetric showcase items: gems/globes/rings); pauses under
 *  reduced motion. Don't use on flat objects — they vanish edge-on. */
export function SpinY({
  speed = 0.5,
  animate = true,
  children,
}: {
  speed?: number;
  animate?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (animate && ref.current) ref.current.rotation.y += Math.min(dt, 1 / 30) * speed;
  });
  return <group ref={ref}>{children}</group>;
}

/** Gentle vertical hover — for FLAT floating objects (stars, map pins) that would
 *  disappear edge-on if spun. Keeps them face-on while feeling alive. */
export function Bob({
  amp = 0.08,
  speed = 1.4,
  animate = true,
  children,
}: {
  amp?: number;
  speed?: number;
  animate?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!animate || !ref.current) return;
    t.current += Math.min(dt, 1 / 30) * speed;
    ref.current.position.y = Math.sin(t.current) * amp;
  });
  return <group ref={ref}>{children}</group>;
}
