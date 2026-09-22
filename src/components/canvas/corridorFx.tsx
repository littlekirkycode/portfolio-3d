"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { scrollRefs } from "@/lib/scrollStore";
import {
  HALF_W,
  WALL_H,
  WALL_START,
  END_VISUAL_X,
  ROOMS,
  ALCOVE_OPEN_W,
  FEATURE_X,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
  GATES,
  PORTHOLES,
  BRIDGE_ENTER_P,
  ATRIUM_C,
  TILE,
} from "./hallConfig";

/* ── corridor light architecture ─────────────────────────────────────────────
 * Everything here is EMISSIVE geometry + additive shading — zero new scene
 * lights (the mounted-light count is a compile-time constant; see Walls'
 * BayLightPool note). Each system is one or two instanced draws:
 *
 *  - CeilingFixtures: recessed troffers (housing + diffuser + ceiling halo) on
 *    the rib grid, with structural cross-beams over every rib pair — the
 *    ribs + beams read as portal frames, the fixtures sit between them.
 *  - CoveLights: a continuous ledge on both walls with a bright front line,
 *    an up-wash and a down-wash, tinted toward the nearest bay's accent so
 *    the hall shifts colour as you walk room to room.
 *  - LightShafts: faint haze volumes under each troffer (view-angle softened
 *    so they read as light in air, not as solid wedges).
 *  - FloorReflection: a half-res planar reflection of the hall (desktop +
 *    "high" tier only), streak-blurred like a polished deck and added on top
 *    of the lit kit floor so emitters mirror in the floor.
 * ──────────────────────────────────────────────────────────────────────── */

/** Must match Corridor's END_X (bridge canopy plane). */
const END_X = END_VISUAL_X + 8;
/** Wall ribs sit at WALL_START + 2 + 4k (Corridor's WallRibs); beams share
 *  that grid and fixtures sit halfway between. */
const RIB_X0 = WALL_START + 2;
const RIB_PITCH = 4;

const FIX_L = 2.5; // troffer diffuser length (along the hall)
const FIX_W = 0.62; // troffer diffuser width
const FIX_Y = WALL_H - 0.1; // diffuser plane height

const nearGate = (x: number, m: number) => GATES.some((g) => Math.abs(x - g.x) < m);
const nearAtrium = (x: number, m: number) => Math.abs(x - ATRIUM_C) < TILE * 2.5 + m;

/** Troffer centres: halfway between ribs, from the lobby to the bridge
 *  approach, skipping the open atrium and the bulkhead-gate lintels. */
export const FIXTURE_XS: number[] = (() => {
  const out: number[] = [];
  for (let x = RIB_X0 + RIB_PITCH / 2; x < END_X - 3; x += RIB_PITCH) {
    if (nearAtrium(x, 1.4) || nearGate(x, 2.0)) continue;
    out.push(x);
  }
  return out;
})();

const BEAM_XS: number[] = (() => {
  const out: number[] = [];
  for (let x = RIB_X0; x < END_X - 2; x += RIB_PITCH) {
    if (nearAtrium(x, 0.4) || nearGate(x, 1.4)) continue;
    out.push(x);
  }
  return out;
})();

/* ── shared GLSL ─────────────────────────────────────────────────────────── */

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

const HEAD_V = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
`;
const HEAD_F = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
`;
const TAIL_F = /* glsl */ `
#include <fog_fragment>
#include <colorspace_fragment>
`;

/** Additive, fog-aware ShaderMaterial preset (emitters and light cheats). */
function additiveMaterial(p: {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  side?: THREE.Side;
}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: p.vertexShader,
    fragmentShader: p.fragmentShader,
    uniforms: { ...fogUniforms(), ...p.uniforms },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: p.side ?? THREE.FrontSide,
    fog: true,
  });
  m.toneMapped = false;
  return m;
}

/** Instanced plane vertex shader: passes uv + world position. */
const INST_PLANE_V = /* glsl */ `
${HEAD_V}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 wp = modelMatrix * vec4(position, 1.0);
  #endif
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/* ── diffuser (shared with the bay ceiling panels in bayLighting) ─────────── */

/** Troffer diffuser: bright core, soft falloff to the frame, faint louvre
 *  ribs across the width. HDR output so bloom lifts a soft glow off it. */
export function makeDiffuserMaterial(color: THREE.ColorRepresentation, intensity: number, aspect: number) {
  return additiveMaterial({
    vertexShader: INST_PLANE_V,
    fragmentShader: /* glsl */ `
${HEAD_F}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uDim;
uniform float uAspect;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 c = abs(vUv - 0.5) * 2.0;           // 0 centre → 1 edge
  float ex = 1.0 - smoothstep(0.55, 1.0, c.x);
  float ey = 1.0 - smoothstep(0.35, 1.0, c.y);
  float core = ex * ey;
  float louvre = 0.88 + 0.12 * smoothstep(0.2, 0.8, abs(fract(vUv.x * uAspect * 3.0) - 0.5) * 2.0);
  // tame the fixture directly overhead: walking under each one used to fire
  // a full-frame bloom flare at the top of the screen
  float near = mix(0.45, 1.0, smoothstep(1.5, 5.5, distance(cameraPosition, vWorld)));
  vec3 col = uColor * uIntensity * uDim * near * (0.45 + 0.75 * core) * louvre;
  gl_FragColor = vec4(col, 1.0);
  ${TAIL_F}
}`,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uDim: { value: 1 },
      uAspect: { value: aspect },
    },
  });
}

/** Soft rounded-rect glow (ceiling halo around a fixture / wall wash pools). */
export function makeHaloMaterial(color: THREE.ColorRepresentation, strength: number) {
  return additiveMaterial({
    vertexShader: INST_PLANE_V,
    fragmentShader: /* glsl */ `
${HEAD_F}
uniform vec3 uColor;
uniform float uStrength;
uniform float uDim;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 c = abs(vUv - 0.5) * 2.0;
  float d = length(max(c - vec2(0.45, 0.2), 0.0) / vec2(0.55, 0.8));
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
  gl_FragColor = vec4(uColor * uStrength * uDim, a);
  ${TAIL_F}
}`,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uDim: { value: 1 },
    },
  });
}

/** Vertical wall wash: brightest at the plane's top edge (uv.y = 1), falling
 *  off downward, feathered at both ends. Rotate the plane PI about its normal
 *  for an up-wash. */
export function makeWashMaterial(color: THREE.ColorRepresentation, strength: number) {
  return additiveMaterial({
    vertexShader: INST_PLANE_V,
    fragmentShader: /* glsl */ `
${HEAD_F}
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float ends = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  float a = pow(vUv.y, 2.3) * ends;
  gl_FragColor = vec4(uColor * uStrength, a);
  ${TAIL_F}
}`,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
    },
  });
}

/* ── light shafts ────────────────────────────────────────────────────────── */

/** Open truncated pyramid, top at y=0 (w0×d0) flaring to the floor at y=-h
 *  (w1×d1). aH = 1 at the top → 0 at the floor. Non-indexed, flat normals. */
export function makeShaftGeometry(w0: number, d0: number, w1: number, d1: number, h: number) {
  const t = [
    [-w0 / 2, 0, -d0 / 2], [w0 / 2, 0, -d0 / 2], [w0 / 2, 0, d0 / 2], [-w0 / 2, 0, d0 / 2],
  ];
  const b = [
    [-w1 / 2, -h, -d1 / 2], [w1 / 2, -h, -d1 / 2], [w1 / 2, -h, d1 / 2], [-w1 / 2, -h, d1 / 2],
  ];
  const pos: number[] = [];
  const hh: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // two triangles per side: t_i, b_i, b_j / t_i, b_j, t_j
    for (const [v, k] of [[t[i], 1], [b[i], 0], [b[j], 0], [t[i], 1], [b[j], 0], [t[j], 1]] as const) {
      pos.push(v[0], v[1], v[2]);
      hh.push(k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aH", new THREE.Float32BufferAttribute(hh, 1));
  g.computeVertexNormals();
  return g;
}

export function makeShaftMaterial(color: THREE.ColorRepresentation, strength: number) {
  return additiveMaterial({
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
${HEAD_V}
attribute float aH;
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  vH = aH;
  #ifdef USE_INSTANCING
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #else
    vec4 wp = modelMatrix * vec4(position, 1.0);
  #endif
  vec4 mvPosition = viewMatrix * wp;
  vN = normalize(normalMatrix * normal);
  vV = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */ `
${HEAD_F}
uniform vec3 uColor;
uniform float uStrength;
uniform float uDim;
varying float vH;
varying vec3 vN;
varying vec3 vV;
void main() {
  float dist = length(vV);
  float facing = abs(dot(normalize(vN), vV / dist));
  float soft = pow(facing, 1.6);                 // fade the silhouette edges
  float near = smoothstep(0.8, 3.5, dist);       // never haze the lens
  float a = uStrength * uDim * pow(vH, 1.4) * soft * near;
  gl_FragColor = vec4(uColor, a);
  ${TAIL_F}
}`,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uDim: { value: 1 },
    },
  });
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _qIdentity = new THREE.Quaternion();
const FACE_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

function useInstances(
  ref: RefObject<THREE.InstancedMesh | null>,
  xs: number[],
  y: number,
  q: THREE.Quaternion,
  z = 0,
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    _s.set(1, 1, 1);
    xs.forEach((x, i) => {
      _p.set(x, y, z);
      _m.compose(_p, q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, xs, y, q, z]);
}

/** Approach beat: hall lights dim as you near the bridge so the nebula owns
 *  the final frame (was CeilingBars' colour lerp). */
function bridgeDim(): number {
  const t = Math.min(1, Math.max(0, (scrollRefs.progress - BRIDGE_ENTER_P) / 0.09));
  return 1 - 0.82 * t * t * (3 - 2 * t);
}

/* ── ceiling ─────────────────────────────────────────────────────────────── */

const CEIL_COLOR = "#d4e2ff";

export function CeilingFixtures() {
  const housing = useRef<THREE.InstancedMesh>(null);
  const diffuser = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  const beamLines = useRef<THREE.InstancedMesh>(null);

  const diffMat = useMemo(() => makeDiffuserMaterial(CEIL_COLOR, 1.25, FIX_L / FIX_W), []);
  const haloMat = useMemo(() => makeHaloMaterial("#a9c2f0", 0.22), []);

  useInstances(housing, FIXTURE_XS, WALL_H - 0.045, _qIdentity);
  useInstances(diffuser, FIXTURE_XS, FIX_Y - 0.002, FACE_DOWN);
  useInstances(halo, FIXTURE_XS, WALL_H - 0.006, FACE_DOWN);
  useInstances(beams, BEAM_XS, WALL_H - 0.13, _qIdentity);
  useInstances(beamLines, BEAM_XS, WALL_H - 0.262, FACE_DOWN);

  useFrame(() => {
    const d = bridgeDim();
    diffMat.uniforms.uDim.value = d;
    haloMat.uniforms.uDim.value = d;
  });

  return (
    <group>
      {/* recessed housing: dark frame the diffuser sits inside */}
      <instancedMesh ref={housing} args={[undefined, undefined, FIXTURE_XS.length]} frustumCulled={false}>
        <boxGeometry args={[FIX_L + 0.26, 0.09, FIX_W + 0.22]} />
        <meshStandardMaterial color="#141822" roughness={0.45} metalness={0.7} />
      </instancedMesh>
      <instancedMesh ref={diffuser} args={[undefined, diffMat, FIXTURE_XS.length]} frustumCulled={false}>
        <planeGeometry args={[FIX_L, FIX_W]} />
      </instancedMesh>
      {/* light bleeding onto the ceiling around each troffer */}
      <instancedMesh ref={halo} args={[undefined, haloMat, FIXTURE_XS.length]} frustumCulled={false}>
        <planeGeometry args={[FIX_L + 1.1, FIX_W + 3.4]} />
      </instancedMesh>
      {/* structural cross-beams on the rib grid (ribs + beam = portal frame) */}
      <instancedMesh ref={beams} args={[undefined, undefined, BEAM_XS.length]} frustumCulled={false}>
        <boxGeometry args={[0.34, 0.26, HALF_W * 2]} />
        <meshStandardMaterial color="#343a4d" roughness={0.5} metalness={0.55} />
      </instancedMesh>
      {/* hairline status slit under each beam */}
      <instancedMesh ref={beamLines} args={[undefined, undefined, BEAM_XS.length]} frustumCulled={false}>
        <planeGeometry args={[0.03, HALF_W * 2 - 1.2]} />
        <meshBasicMaterial color="#5a74b0" />
      </instancedMesh>
    </group>
  );
}
export function LightShafts() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => makeShaftGeometry(FIX_L * 0.96, FIX_W * 0.9, FIX_L + 1.3, 2.6, FIX_Y), []);
  const mat = useMemo(() => makeShaftMaterial("#b9ccf2", 0.055), []);
  useInstances(ref, FIXTURE_XS, FIX_Y - 0.004, _qIdentity);
  useFrame(() => {
    mat.uniforms.uDim.value = bridgeDim();
  });
  return <instancedMesh ref={ref} args={[geo, mat, FIXTURE_XS.length]} frustumCulled={false} />;
}

/* ── cove lighting ───────────────────────────────────────────────────────── */

const COVE_Y = 3.28; // ledge underside
const LEDGE_H = 0.08;
const LEDGE_D = 0.22; // protrusion from the wall face (clears the 0.1 ribs)
const WASH_DOWN = 1.05;
const CORRIDOR_COOL = new THREE.Color("#6f97f0");

/** Cove tint at hall position x on a given wall: the cool corridor base,
 *  pulled toward any bay accent within ~7 units (stronger on the bay's own
 *  wall) so the strip hands off colour room to room. */
function coveColor(x: number, side: 1 | -1, out: THREE.Color): THREE.Color {
  out.copy(CORRIDOR_COOL);
  let wSum = 0;
  const acc = new THREE.Color(0, 0, 0);
  for (const r of ROOMS) {
    const d = (x - r.x) / 6.5;
    const w = Math.exp(-d * d) * (r.side === side ? 1 : 0.55);
    if (w < 0.01) continue;
    acc.add(new THREE.Color(r.accent).multiplyScalar(w));
    wSum += w;
  }
  if (wSum > 0) {
    acc.multiplyScalar(1 / wSum);
    out.lerp(acc, Math.min(1, wSum) * 0.85);
  }
  return out;
}

type Run = { x0: number; x1: number; side: 1 | -1 };

/** Clear wall runs for the cove: bays, showreel recess, gallery glazing and
 *  bulkhead jambs cut it. */
function coveRuns(): Run[] {
  const out: Run[] = [];
  for (const side of [-1, 1] as const) {
    const cuts: [number, number][] = ROOMS.filter((r) => r.side === side).map((r) => [
      r.x - (ALCOVE_OPEN_W / 2 + 0.3),
      r.x + (ALCOVE_OPEN_W / 2 + 0.3),
    ]);
    if (side === 1) cuts.push([FEATURE_X - 3.3, FEATURE_X + 3.3]);
    if (side === GALLERY_SIDE) cuts.push([GALLERY_X - GALLERY_SPAN / 2 - 0.3, GALLERY_X + GALLERY_SPAN / 2 + 0.3]);
    for (const g of GATES) cuts.push([g.x - 0.4, g.x + 0.4]);
    cuts.sort((a, b) => a[0] - b[0]);
    let x = WALL_START + 0.4;
    const endX = END_X - 0.6;
    for (const [c0, c1] of cuts) {
      if (c0 > x + 0.6) out.push({ x0: x, x1: Math.min(c0, endX), side });
      x = Math.max(x, c1);
    }
    if (x < endX - 0.6) out.push({ x0: x, x1: endX, side });
  }
  return out;
}

/** One merged geometry for every cove emitter: front line (kind 0), up-wash
 *  (kind 1) and down-wash (kind 2). Split into ~1-unit segments so the
 *  per-vertex tint can follow the bays. aF = brightness falloff (1 at the
 *  ledge → 0 at the far edge of a wash). */
function buildCoveGeometry(runs: Run[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const fal: number[] = [];
  const kind: number[] = [];
  const c0 = new THREE.Color();
  const c1 = new THREE.Color();
  const quad = (
    xa: number, xb: number, ya: number, yb: number, z: number,
    ca: THREE.Color, cb: THREE.Color, fa: number, fb: number, k: number,
  ) => {
    // (xa,ya) (xb,ya) (xb,yb) / (xa,ya) (xb,yb) (xa,yb); fa at ya, fb at yb
    const v = [
      [xa, ya, fa, ca], [xb, ya, fa, cb], [xb, yb, fb, cb],
      [xa, ya, fa, ca], [xb, yb, fb, cb], [xa, yb, fb, ca],
    ] as const;
    for (const [x, y, f, c] of v) {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
      fal.push(f);
      kind.push(k);
    }
  };
  // portholes: keep the down-wash off their frames
  const nearPort = (x: number, side: number) =>
    PORTHOLES.some((p) => p.side === side && Math.abs(x - p.x) < 1.5);
  for (const r of runs) {
    const n = Math.max(1, Math.round(r.x1 - r.x0));
    const step = (r.x1 - r.x0) / n;
    const zFront = r.side * (HALF_W - LEDGE_D - 0.002);
    const zWall = r.side * (HALF_W - 0.025);
    for (let i = 0; i < n; i++) {
      const xa = r.x0 + i * step;
      const xb = xa + step;
      coveColor(xa, r.side, c0);
      coveColor(xb, r.side, c1);
      quad(xa, xb, COVE_Y, COVE_Y + 0.028, zFront, c0, c1, 1, 1, 0);
      quad(xa, xb, COVE_Y + LEDGE_H, WALL_H - 0.01, zWall, c0, c1, 1, 0, 1);
      if (!nearPort((xa + xb) / 2, r.side)) quad(xa, xb, COVE_Y, COVE_Y - WASH_DOWN, zWall, c0, c1, 1, 0, 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aF", new THREE.Float32BufferAttribute(fal, 1));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.computeBoundingSphere();
  return g;
}

export function CoveLights() {
  const runs = useMemo(() => coveRuns(), []);
  const geo = useMemo(() => buildCoveGeometry(runs), [runs]);
  const mat = useMemo(
    () =>
      additiveMaterial({
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
${HEAD_V}
attribute vec3 aColor;
attribute float aF;
attribute float aKind;
varying vec3 vColor;
varying float vF;
varying float vKind;
varying float vX;
void main() {
  vColor = aColor;
  vF = aF;
  vKind = aKind;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vX = wp.x;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
        fragmentShader: /* glsl */ `
${HEAD_F}
uniform float uDim;
varying vec3 vColor;
varying float vF;
varying float vKind;
varying float vX;
void main() {
  // steady — no travelling pulses (they read as flashing)
  float k;
  if (vKind < 0.5) k = 1.6;                          // front line
  else if (vKind < 1.5) k = 0.30 * pow(vF, 1.7);     // up-wash
  else k = 0.16 * pow(vF, 2.4);                      // down-wash
  gl_FragColor = vec4(vColor * k * uDim, 1.0);
  ${TAIL_F}
}`,
        uniforms: { uDim: { value: 1 } },
      }),
    [],
  );

  // the ledge itself: one instanced unit box per run
  const ledges = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ledges.current;
    if (!mesh) return;
    runs.forEach((r, i) => {
      _p.set((r.x0 + r.x1) / 2, COVE_Y + LEDGE_H / 2, r.side * (HALF_W - LEDGE_D / 2));
      _s.set(r.x1 - r.x0, LEDGE_H, LEDGE_D);
      _m.compose(_p, _qIdentity, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [runs]);

  useFrame(() => {
    mat.uniforms.uDim.value = bridgeDim();
  });

  return (
    <group>
      <instancedMesh ref={ledges} args={[undefined, undefined, runs.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1a1f2d" roughness={0.4} metalness={0.7} />
      </instancedMesh>
      <mesh geometry={geo} material={mat} frustumCulled={false} />
    </group>
  );
}

/* ── planar floor reflection ─────────────────────────────────────────────── */

const ReflectShader = {
  name: "DeckReflection",
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uStrength: { value: 0.75 },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    ...THREE.UniformsLib.fog,
  },
  vertexShader: /* glsl */ `
${HEAD_V}
uniform mat4 textureMatrix;
varying vec4 vUvP;
varying vec3 vWorld;
void main() {
  vUvP = textureMatrix * vec4(position, 1.0);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
  fragmentShader: /* glsl */ `
${HEAD_F}
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform float uStrength;
uniform vec2 uTexel;
varying vec4 vUvP;
varying vec3 vWorld;
void main() {
  vec2 uv = vUvP.xy / vUvP.w;
  // vertical streak blur — a brushed/polished deck smears reflections
  // toward the viewer instead of mirroring them crisply
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -5; i <= 5; i++) {
    float fi = float(i);
    float w = exp(-fi * fi / 14.0);
    acc += texture2D(tDiffuse, uv + vec2(fi * uTexel.x * 0.7, fi * uTexel.y * 4.0)).rgb * w;
    wsum += w;
  }
  vec3 refl = acc / wsum;
  // kit panel seams (2-unit grid, boundaries on even coords) break it up
  vec2 g = abs(fract(vWorld.xz * 0.5 + 0.5) - 0.5) * 2.0;
  float seam = smoothstep(0.0, 0.035, min(g.x, g.y));
  // stronger at grazing angles (Fresnel-ish), weaker straight down
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.3 + 0.7 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  // fade toward the walls so the reflection reads as a sheen, not a mirror
  float wall = 1.0 - smoothstep(${(HALF_W - 1.2).toFixed(2)}, ${HALF_W.toFixed(2)}, abs(vWorld.z));
  float s = uStrength * fres * (0.45 + 0.55 * seam) * (0.35 + 0.65 * wall);
  gl_FragColor = vec4(refl * color * s, 1.0);
  ${TAIL_F}
}`,
};

/** Low-res planar reflection of the whole hall, streak-blurred and ADDED on
 *  top of the lit kit floor. Mounted by Corridor only on desktop + "high".
 *  Cost control: the mirror pass re-renders the scene, so it only runs while
 *  the CAMERA is moving (or right after a resize); during a dwell (camera
 *  parked on a bay — where visitors spend most of their time) the held
 *  texture is still valid. No periodic refresh: a stepped update read as
 *  flicker under the moving drone. Holds no lights, so
 *  mounting/unmounting never recompiles scene materials. */
export function FloorReflection({ scale = 0.35 }: { scale?: number }) {
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const dirty = useRef(true);
  const reflector = useMemo(() => {
    const len = END_X + 2 - WALL_START;
    const geo = new THREE.PlaneGeometry(len, HALF_W * 2);
    const r = new Reflector(geo, {
      clipBias: 0.003,
      textureWidth: 512,
      textureHeight: 512,
      color: 0xffffff,
      multisample: 0,
      shader: ReflectShader,
    });
    const m = r.material as THREE.ShaderMaterial;
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.fog = true;
    m.toneMapped = false;
    r.position.set(WALL_START + len / 2, 0.004, 0);
    r.rotation.x = -Math.PI / 2;
    r.frustumCulled = false;
    r.renderOrder = -1; // under the additive floor decals
    return r;
  }, []);
  useEffect(() => {
    // Skip the mirror pass while the camera is (near-)static. Skipping also
    // leaves textureMatrix untouched, which stays consistent with the held
    // texture for exactly as long as the camera hasn't moved.
    const r = reflector;
    const render = r.onBeforeRender;
    const last = new THREE.Matrix4();
    r.onBeforeRender = function (renderer, scene, camera, ...rest) {
      const e = camera.matrixWorld.elements;
      const l = last.elements;
      let moved = false;
      for (let i = 0; i < 16; i++) {
        if (Math.abs(e[i] - l[i]) > 1e-4) {
          moved = true;
          break;
        }
      }
      if (!moved && !dirty.current) return;
      last.copy(camera.matrixWorld);
      dirty.current = false;
      render.call(this, renderer, scene, camera, ...rest);
    };
    return () => {
      r.onBeforeRender = render;
    };
  }, [reflector]);
  useEffect(() => {
    const w = Math.max(64, Math.round(size.width * dpr * scale));
    const h = Math.max(64, Math.round(size.height * dpr * scale));
    reflector.getRenderTarget().setSize(w, h);
    // setSize drops the target's contents — re-render next frame even if the
    // camera is parked (otherwise the floor sheen blinks out on a DPR change)
    dirty.current = true;
    (reflector.material as THREE.ShaderMaterial).uniforms.uTexel.value.set(1 / w, 1 / h);
  }, [reflector, size.width, size.height, dpr, scale]);
  useEffect(
    () => () => {
      reflector.dispose();
      reflector.geometry.dispose();
    },
    [reflector],
  );
  return <primitive object={reflector} />;
}
