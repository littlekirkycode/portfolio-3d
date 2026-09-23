"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WARM } from "../../theme";
import { PlantInstances, growFeature, hash, useDeferredDispose, type FeatureSpec, type LampBar, type NurseryMats } from "./kit";

/* ── the greenhouse around the hero ──────────────────────────────────────────
 * The planting deck every piece stands on; the feature plants (week one of
 * the streak bed, fully grown) in dark-glazed ceramic planters, the tall one
 * raised on a walnut stand in the bed's own language; and the horticultural
 * grow bar hung over the left column, whose warmth reaches the leaves under
 * it and pools softly on the deck (shader + decal — no scene light).
 * ──────────────────────────────────────────────────────────────────────── */

/** Deck extents (room-local). Covers the bay's stock round mat and its
 *  glowing rim entirely, so nothing in the room ever straddles a rim line;
 *  the only accent on the floor is the deck's own front LED shadow gap. */
export const DECK = { x0: -3.56, x1: 3.56, z0: -1.9, z1: 2.36, h: 0.06, r: 0.28 } as const;

function deckShape(inset: number): THREE.Shape {
  const x0 = DECK.x0 + inset;
  const x1 = DECK.x1 - inset;
  // shape Y = −world z (the shape is laid flat with rotateX(−π/2))
  const y0 = -(DECK.z1 - inset);
  const y1 = -(DECK.z0 + inset);
  const r = Math.max(0.02, DECK.r - inset);
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** Deck top with inlaid panel seams (8 bays across, one lateral seam) so it
 *  reads as a built stage rather than a floor recolour. */
function useDeckTopMat(mats: NurseryMats) {
  const m = useMemo(() => {
    const d = mats.deck.clone();
    d.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSgP;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSgP = transformed;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSgP;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          {
            float px = (vSgP.x - (${DECK.x0.toFixed(3)})) / 0.89;
            float sx = abs(fract(px) - 0.5);
            float sz = abs(vSgP.z - 0.35);
            float seam = max(smoothstep(0.4935, 0.4985, sx), 1.0 - smoothstep(0.003, 0.006, sz));
            float top = step(${(DECK.h - 0.006).toFixed(3)}, vSgP.y);
            diffuseColor.rgb *= 1.0 - 0.45 * seam * top;
          }`,
        );
    };
    d.customProgramCacheKey = () => "selfgrow-deck-v1";
    return d;
  }, [mats.deck]);
  useDeferredDispose(m);
  return m;
}

export function PlantingDeck({ mats }: { mats: NurseryMats }) {
  const geos = useMemo(() => {
    const top = new THREE.ExtrudeGeometry(deckShape(0.012), {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 10,
    });
    top.rotateX(-Math.PI / 2);
    top.translate(0, DECK.h - 0.038, 0);
    const base = new THREE.ExtrudeGeometry(deckShape(0.07), { depth: DECK.h - 0.038, bevelEnabled: false, curveSegments: 10 });
    base.rotateX(-Math.PI / 2);
    return { top, base };
  }, []);
  useDeferredDispose(geos);
  const topMat = useDeckTopMat(mats);
  const w = DECK.x1 - DECK.x0 - 2 * DECK.r;
  return (
    <group>
      <mesh geometry={geos.base} material={mats.plinth} />
      <mesh geometry={geos.top} material={topMat} />
      {/* the floor's one accent: an LED line in the front shadow gap */}
      <mesh position={[0, 0.011, DECK.z1 - 0.075]} material={mats.ledTrim}>
        <boxGeometry args={[w, 0.008, 0.006]} />
      </mesh>
      {/* machined steel nosing along the deck's front edge */}
      <mesh position={[0, DECK.h + 0.001, DECK.z1 - 0.03]} material={mats.lip}>
        <boxGeometry args={[w, 0.004, 0.022]} />
      </mesh>
    </group>
  );
}

/* ── planters ────────────────────────────────────────────────────────────── */

/** `y` = the surface the planter stands on; r = belly radius; h = height. */
export type PlanterSpec = { x: number; y?: number; z: number; r: number; h: number };

/** Unit planter profile (belly radius 1, height 1): an unglazed foot ring, a
 *  full belly easing into a soft shoulder, a rolled lip, then the inner wall
 *  down to the soil line — lathed, so the rim has real thickness. */
const PLANTER_PROFILE = [
  [0, 0.0],
  [0.8, 0.0],
  [0.83, 0.012],
  [0.84, 0.055],
  [0.88, 0.075],
  [0.95, 0.16],
  [0.995, 0.34],
  [1.0, 0.52],
  [0.985, 0.7],
  [0.955, 0.84],
  [0.93, 0.93],
  [0.935, 0.975],
  [0.915, 1.0],
  [0.885, 0.992],
  [0.87, 0.96],
  [0.865, 0.85],
].map(([r, y]) => new THREE.Vector2(r, y));
const SOIL_DROP = 0.04; // soil sits this far under the lip (world units)

/** Glazed-ceramic body: unglazed warm clay at the foot, a dark charcoal glaze
 *  above, the glaze breaking warmer and thinner right at the lip. */
function usePlanterMat(mats: NurseryMats) {
  const m = useMemo(() => {
    const c = mats.ceramic.clone();
    c.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vSgY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSgY = position.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vSgY;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float sgFoot = 1.0 - smoothstep(0.06, 0.075, vSgY);
          float sgBreak = smoothstep(0.9, 0.99, vSgY);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.16, 0.13), sgFoot);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.6, 1.45, 1.25), sgBreak * 0.7);
          diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.1, 0.6, vSgY);`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.9, sgFoot);`,
        )
        .replace(
          "#include <lights_physical_fragment>",
          `#include <lights_physical_fragment>
          material.clearcoat *= 1.0 - sgFoot;`,
        );
    };
    c.customProgramCacheKey = () => "selfgrow-planter-v1";
    return c;
  }, [mats.ceramic]);
  useDeferredDispose(m);
  return m;
}

const PEBBLES_PER = 22;

/** Every planter in the room, instanced (4 draw calls total): the glazed
 *  lathed body, a recessed shadow foot, dark soil sunk under the lip, and a
 *  top-dressing of small warm-grey pebbles so the top reads as filled. */
export function Planters({ specs, mats }: { specs: PlanterSpec[]; mats: NurseryMats }) {
  const footRef = useRef<THREE.InstancedMesh>(null);
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const soilRef = useRef<THREE.InstancedMesh>(null);
  const pebRef = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(
    () => ({
      foot: new THREE.CylinderGeometry(0.78, 0.78, 1, 40),
      body: new THREE.LatheGeometry(PLANTER_PROFILE, 56),
      soil: new THREE.CircleGeometry(1, 40),
      pebble: new THREE.IcosahedronGeometry(1, 1),
    }),
    [],
  );
  useDeferredDispose(geos);
  const bodyMat = usePlanterMat(mats);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const stones = ["#4f4a45", "#625c56", "#3f3b37", "#716a62"];
    specs.forEach((p, i) => {
      const y0 = p.y ?? 0;
      o.rotation.set(0, 0, 0);
      o.position.set(p.x, y0 + 0.006, p.z);
      o.scale.set(p.r, 0.012, p.r);
      o.updateMatrix();
      footRef.current?.setMatrixAt(i, o.matrix);
      o.position.set(p.x, y0 + 0.008, p.z);
      o.rotation.set(0, hash(i * 5.1) * 6.28, 0);
      o.scale.set(p.r, p.h - 0.008, p.r);
      o.updateMatrix();
      bodyRef.current?.setMatrixAt(i, o.matrix);
      const soilY = y0 + p.h - SOIL_DROP;
      o.position.set(p.x, soilY, p.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(p.r * 0.87, p.r * 0.87, 1);
      o.updateMatrix();
      soilRef.current?.setMatrixAt(i, o.matrix);
      for (let k = 0; k < PEBBLES_PER; k++) {
        const s = i * 100 + k;
        const a = k * 2.39996 + hash(s) * 0.6;
        const rr = p.r * 0.8 * Math.sqrt((k + 0.5 + hash(s + 1) * 0.5) / PEBBLES_PER);
        const sz = (0.011 + 0.01 * hash(s + 2)) * Math.min(1.2, p.r / 0.2);
        o.position.set(p.x + Math.cos(a) * rr, soilY + sz * 0.25, p.z + Math.sin(a) * rr);
        o.rotation.set(hash(s + 3) * 3, hash(s + 4) * 3, hash(s + 5) * 3);
        o.scale.set(sz * (1 + 0.4 * hash(s + 6)), sz * 0.55, sz);
        o.updateMatrix();
        pebRef.current?.setMatrixAt(i * PEBBLES_PER + k, o.matrix);
        pebRef.current?.setColorAt(i * PEBBLES_PER + k, col.set(stones[Math.floor(hash(s + 7) * stones.length)]));
      }
    });
    for (const m of [footRef.current, bodyRef.current, soilRef.current, pebRef.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [specs]);
  const n = specs.length;
  return (
    <group>
      <instancedMesh key={`f${n}`} ref={footRef} args={[geos.foot, mats.plinth, n]} />
      <instancedMesh key={`b${n}`} ref={bodyRef} args={[geos.body, bodyMat, n]} />
      <instancedMesh key={`s${n}`} ref={soilRef} args={[geos.soil, mats.soil, n]} />
      <instancedMesh key={`p${n}`} ref={pebRef} args={[geos.pebble, mats.pebble, n * PEBBLES_PER]} />
    </group>
  );
}

/** Walnut plant stand in the bed's language: recessed dark plinth, a grained
 *  walnut block and a machined steel cap the planter stands on. */
export function PlantStand({ x, z, w, d, h, mats }: { x: number; z: number; w: number; d: number; h: number; mats: NurseryMats }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} material={mats.plinth}>
        <boxGeometry args={[w - 0.05, 0.04, d - 0.05]} />
      </mesh>
      <mesh position={[0, 0.04 + (h - 0.052) / 2, 0]} material={mats.walnut}>
        <boxGeometry args={[w, h - 0.052, d]} />
      </mesh>
      <mesh position={[0, h - 0.006, 0]} material={mats.lip}>
        <boxGeometry args={[w + 0.01, 0.012, d + 0.01]} />
      </mesh>
    </group>
  );
}

/** Feature plants (one instanced batch for every plant in the room). */
export function FeaturePlants({
  specs,
  mats,
  animate,
  lamp,
}: {
  specs: FeatureSpec[];
  mats: NurseryMats;
  animate: boolean;
  lamp?: LampBar;
}) {
  const built = useMemo(() => growFeature(specs), [specs]);
  return <PlantInstances built={built} mats={mats} animate={animate} broad lamp={lamp} />;
}

/* ── grow bar ────────────────────────────────────────────────────────────── */

/** Soft warm pool (additive, procedural — no texture): an elongated falloff
 *  under the bar on the deck, and a fainter wash on the side wall. */
function useWarmPoolMat(opacity: number) {
  const m = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uColor: { value: new THREE.Color(WARM) }, uOpacity: { value: opacity } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 2.0; float d = length(q); float a = pow(1.0 - smoothstep(0.0, 1.0, d), 1.8); gl_FragColor = vec4(uColor * a * uOpacity, 1.0); }",
      }),
    [opacity],
  );
  useDeferredDispose(m);
  return m;
}

/** Horticultural LED bar hung on two fine cables over the left column: a
 *  slim dark extrusion with machined end caps and one warm diffuser strip on
 *  its underside — the room's only warm practical. Emissive only; its light
 *  is faked on the leaves (see LampBar) and pooled on the deck. */
export function GrowBar({ bar, mats }: { bar: LampBar; mats: NurseryMats }) {
  const len = bar.z1 - bar.z0;
  const zc = (bar.z0 + bar.z1) / 2;
  const floorPool = useWarmPoolMat(0.12);
  const wallPool = useWarmPoolMat(0.05);
  return (
    <group>
      <group position={[bar.x, bar.y, zc]}>
        {/* extrusion + end caps */}
        <mesh material={mats.body}>
          <boxGeometry args={[0.1, 0.036, len]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} material={mats.steel}>
          <boxGeometry args={[0.05, 0.006, len - 0.04]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, 0, s * (len / 2 + 0.006)]} material={mats.lip}>
            <boxGeometry args={[0.108, 0.042, 0.012]} />
          </mesh>
        ))}
        {/* recessed warm diffuser strip on the underside */}
        <mesh position={[0, -0.0185, 0]} rotation-x={Math.PI / 2} material={mats.warmFace}>
          <planeGeometry args={[0.058, len - 0.05]} />
        </mesh>
        {/* two fine hanging cables up to machined ceiling cups */}
        {[-1, 1].map((s) => (
          <group key={`c${s}`} position={[0, 0, s * (len / 2 - 0.16)]}>
            <mesh position={[0, (4 - bar.y) / 2, 0]} material={mats.steel}>
              <cylinderGeometry args={[0.0035, 0.0035, 4 - bar.y, 6]} />
            </mesh>
            <mesh position={[0, 0.026, 0]} material={mats.lip}>
              <cylinderGeometry args={[0.012, 0.012, 0.018, 12]} />
            </mesh>
            <mesh position={[0, 4 - bar.y - 0.012, 0]} material={mats.lip}>
              <cylinderGeometry args={[0.035, 0.035, 0.024, 20]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* the bar's warmth pooled on the deck under it and washing the wall */}
      <mesh position={[bar.x + 0.1, 0.004, zc]} rotation-x={-Math.PI / 2} material={floorPool} renderOrder={1}>
        <planeGeometry args={[1.5, len + 1.0]} />
      </mesh>
      <mesh position={[-3.68, bar.y - 0.9, zc]} rotation-y={Math.PI / 2} material={wallPool} renderOrder={1}>
        <planeGeometry args={[len + 1.2, 2.0]} />
      </mesh>
    </group>
  );
}
