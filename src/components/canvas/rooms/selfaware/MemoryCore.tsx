"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLOW, MATERIALS, NEUTRAL, WARM } from "../../theme";
import { getPuckTex } from "../shared";
import { ORBIT } from "./memories";
import { chipGeometry, lightTint, useChipAtlas } from "./tiles";
import { useDeferredDispose } from "./dispose";

/* ── SelfAware hero: the MEMORY CORE ─────────────────────────────────────────
 * A piece of installed hardware projecting the assistant's mind:
 *  - a stepped service plinth (the unit's own footing, clear of the mat); a
 *    flat steel cable cover runs from it to the side wall, turns up the wall
 *    and ends in a flush service plate with a warm indicator — the unit is
 *    visibly powered;
 *  - a two-tone projector: painted base drum with a machined steel band, a
 *    faceted brushed-steel housing with a vent grille and a warm status
 *    window (the room's warm counterpoint), a painted shoulder, a polished
 *    collar with the one trim LED, and a steel emitter dish with a lens;
 *  - a GIMBAL: two polished yoke arms whose pins seat into a steel equator
 *    band around the orb — the orb is visibly held;
 *  - the mind itself: a glass orb with a near-white fresnel rim (it separates
 *    from the blue walls), a faceted crystal core with hard lit facets, and a
 *    fine gyro arc turning slowly around it;
 *  - one orbit track carrying the memories: the three retrieval returned are
 *    lit glass tiles on the right (wired to the core, the side the answer
 *    streams out of), three dormant ones rest on the left as dark glass
 *    chips. No tile sits in the front/back wedge, so none crosses the orb.
 * ──────────────────────────────────────────────────────────────────────── */

const PLINTH_H = 0.07;
const LENS_Y = PLINTH_H + 0.85;
export const ORB_Y = 1.66;
export const ORB_R = 0.34;
const TRACK_R = 0.8;
const CHIP = 0.2;
const CHIP_DORMANT = 0.17;
/** Gimbal equator band (the yoke pins seat into it). */
const BAND_R = ORB_R + 0.006;
/** Yoke pivot height in the projector's (pre-lift) frame = the orb equator. */
const YOKE_Y = ORB_Y - PLINTH_H;
/** Orbit plane tilt toward the camera. */
const TILT = 0.5;
/** Gimbal ring tilt about the pin axis (a flat equator band reads as a rod
 *  from the level dwell camera; tipped, it reads as the ring the pins hold). */
const BAND_TILT = -0.8;
/** Yaw that turns the unit's front detail toward the corridor camera. */
const FACE_Y = 0.5;
/** Service plinth radius. */
export const PLINTH_R = 0.5;
/** Conduit heading from the plinth to the side wall (rad, toward the back). */
const CONDUIT_YAW = 0.35;

/** Base drum: foot chamfer, drum wall, top chamfer into the column. */
const DRUM: [number, number][] = [
  [0.0, 0.0], [0.29, 0.0], [0.305, 0.015], [0.305, 0.13], [0.29, 0.15],
  [0.21, 0.19], [0.0, 0.19],
];
/** Shoulder: the housing flaring out to the collar seat. */
const SHOULDER: [number, number][] = [
  [0.0, 0.6], [0.182, 0.6], [0.182, 0.64], [0.212, 0.7], [0.236, 0.74],
  [0.236, 0.76], [0.0, 0.76],
];

const shellVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = position;
    gl_Position = projectionMatrix * mv;
  }`;

/** Glass shell: a faint body tint, a fresnel rim that runs to near-white at
 *  the silhouette, faint latitude bands drifting upward and a soft specular
 *  crescent from a fixed upper-left key. */
const shellFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uRim;
  uniform float uT;
  uniform float uR;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float f = 1.0 - abs(dot(n, v));
    float rim = pow(f, 2.4);
    float edge = smoothstep(0.55, 0.98, f);
    float b = fract(vP.y / uR * 2.5 + uT);
    float band = smoothstep(0.0, 0.08, b) * (1.0 - smoothstep(0.12, 0.22, b));
    vec3 H = normalize(normalize(vec3(-0.55, 0.7, 0.45)) + v);
    float spec = pow(max(dot(n, H), 0.0), 18.0) * smoothstep(0.3, 0.8, f);
    vec3 col = mix(uColor, uRim, edge);
    float a = 0.05 + 1.05 * rim + band * 0.05 * (0.4 + f) + spec * 0.45;
    gl_FragColor = vec4(mix(col, vec3(0.9, 0.93, 1.0), clamp(spec, 0.0, 0.7)), a);
  }`;

/** Faceted crystal core: flat facet normals from screen-space derivatives,
 *  lit from a fixed view-space key so every facet reads as a hard plane. */
const crystalVert = /* glsl */ `
  varying vec3 vVP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vVP = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const crystalFrag = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uHi;
  varying vec3 vVP;
  void main() {
    vec3 n = normalize(cross(dFdx(vVP), dFdy(vVP)));
    vec3 v = normalize(-vVP);
    float face = abs(dot(n, v));
    float key = max(dot(n, normalize(vec3(-0.45, 0.75, 0.5))), 0.0);
    float edge = pow(1.0 - face, 3.0);
    vec3 col = mix(uDeep, uHi, clamp(0.22 + 0.62 * key + 0.5 * edge, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }`;

/** Projector beam: bright at the lens, falling off fast, brighter at edges. */
const beamVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }`;
const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uI;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float h = clamp(vUv.y, 0.0, 1.0);
    float fade = pow(1.0 - h, 2.6) * smoothstep(0.0, 0.05, h);
    gl_FragColor = vec4(uColor, uI * fade * (0.25 + 0.75 * f));
  }`;

function useShader(
  frag: string,
  vert: string,
  uniforms: Record<string, THREE.IUniform>,
  additive = true,
) {
  const m = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: additive,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.FrontSide,
    });
    mat.toneMapped = false;
    return mat;
  }, [frag, vert, uniforms, additive]);
  useDeferredDispose(m);
  return m;
}

/** Uniforms for the orb's glass shell (rim near-white at the silhouette). */
export function useShellUniforms(accent: string, r: number) {
  return useMemo(
    () => ({
      uColor: { value: lightTint(accent, 0.15) },
      uRim: { value: new THREE.Color(accent).lerp(new THREE.Color("#dfe6ff"), 0.6).multiplyScalar(1.15) },
      uT: { value: 0 },
      uR: { value: r },
    }),
    [accent, r],
  );
}

/** The orb's glass shell material (additive fresnel). */
export function useShellMaterial(uniforms: Record<string, THREE.IUniform>) {
  return useShader(shellFrag, shellVert, uniforms);
}

const lathe = (p: [number, number][]) =>
  new THREE.LatheGeometry(p.map(([r, y]) => new THREE.Vector2(r, y)), 64);

type HwKey = "paint" | "plinth" | "shadowGap" | "steel" | "column" | "polished" | "dish" | "led" | "warm" | "lens";
type V3 = [number, number, number];

/** Static hardware geometry, merged per material (≈10 draw calls for ~45
 *  parts). Everything is authored in the core's local frame. */
function buildHardware(wallX: number): Record<HwKey, THREE.BufferGeometry> {
  const parts: Record<HwKey, THREE.BufferGeometry[]> = {
    paint: [], plinth: [], shadowGap: [], steel: [], column: [], polished: [], dish: [], led: [], warm: [], lens: [],
  };
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  /** add geometry g at pos/rot, inside an optional parent (yaw, then lift). */
  const add = (key: HwKey, g: THREE.BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], yaw = 0, lift = 0) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q.setFromEuler(e.set(...rot)), one);
    if (yaw) m.premultiply(new THREE.Matrix4().makeRotationY(yaw));
    if (lift) m.premultiply(new THREE.Matrix4().makeTranslation(0, lift, 0));
    g.applyMatrix4(m);
    parts[key].push(g);
  };
  const H = PLINTH_H;

  // ── stepped service plinth ──
  add("plinth", new THREE.CylinderGeometry(PLINTH_R - 0.01, PLINTH_R, 0.044, 64), [0, 0.022, 0]);
  add("shadowGap", new THREE.CylinderGeometry(PLINTH_R - 0.035, PLINTH_R - 0.035, 0.006, 64), [0, 0.046, 0]);
  add("steel", new THREE.CylinderGeometry(0.4, 0.41, 0.024, 64), [0, 0.058, 0]);

  // ── cable cover: flat steel strip back-left to the side wall, a riser up
  //    the wall, and a flush service plate with a warm indicator ──
  const runLen = -wallX / Math.cos(CONDUIT_YAW) - PLINTH_R + 0.012;
  const runX = -PLINTH_R - runLen / 2 + 0.03;
  add("steel", new THREE.BoxGeometry(runLen, 0.016, 0.1), [runX, 0.008, 0], [0, 0, 0], -CONDUIT_YAW);
  add("shadowGap", new THREE.BoxGeometry(runLen, 0.003, 0.016), [runX, 0.017, 0], [0, 0, 0], -CONDUIT_YAW);
  const jz = wallX * Math.tan(CONDUIT_YAW);
  const RISER_TOP = 0.16;
  add("steel", new THREE.BoxGeometry(0.016, RISER_TOP, 0.1), [wallX + 0.008, RISER_TOP / 2, jz]);
  add("steel", new THREE.BoxGeometry(0.05, 0.05, 0.1), [wallX + 0.02, 0.02, jz]); // floor-to-wall elbow cover
  add("paint", new THREE.BoxGeometry(0.02, 0.16, 0.2), [wallX + 0.01, RISER_TOP + 0.07, jz]);
  add("steel", new THREE.BoxGeometry(0.006, 0.13, 0.17), [wallX + 0.022, RISER_TOP + 0.07, jz]);
  add("shadowGap", new THREE.BoxGeometry(0.004, 0.026, 0.09), [wallX + 0.026, RISER_TOP + 0.1, jz]);
  add("warm", new THREE.BoxGeometry(0.004, 0.01, 0.05), [wallX + 0.028, RISER_TOP + 0.1, jz]);

  // ── base drum + machined band ──
  add("paint", lathe(DRUM), [0, H, 0]);
  add("polished", new THREE.TorusGeometry(0.306, 0.007, 8, 64), [0, H + 0.075, 0], [Math.PI / 2, 0, 0]);

  // ── faceted brushed-steel housing (octagon, a flat face to the camera):
  //    vent grille + warm status window ──
  {
    const oct = new THREE.CylinderGeometry(0.172, 0.182, 0.42, 8, 1, false, -Math.PI / 8).toNonIndexed();
    oct.computeVertexNormals();
    add("column", oct, [0, 0.395, 0], [0, 0, 0], FACE_Y, H);
  }
  add("shadowGap", new THREE.BoxGeometry(0.13, 0.13, 0.02), [0, 0.3, 0.164], [0, 0, 0], FACE_Y, H);
  for (let k = 0; k < 5; k++)
    add("steel", new THREE.BoxGeometry(0.12, 0.004, 0.018), [0, 0.252 + k * 0.024, 0.172], [-0.5, 0, 0], FACE_Y, H);
  add("shadowGap", new THREE.BoxGeometry(0.15, 0.032, 0.012), [0, 0.48, 0.168], [0, 0, 0], FACE_Y, H);
  add("warm", new THREE.BoxGeometry(0.12, 0.011, 0.003), [0, 0.48, 0.175], [0, 0, 0], FACE_Y, H);

  // ── shoulder, polished collar + the one trim LED ──
  add("paint", lathe(SHOULDER), [0, H, 0]);
  add("polished", new THREE.CylinderGeometry(0.245, 0.238, 0.07, 64), [0, H + 0.795, 0]);
  add("led", new THREE.TorusGeometry(0.246, 0.005, 6, 64), [0, H + 0.795, 0], [Math.PI / 2, 0, 0]);

  // ── emitter dish + lens ──
  add("dish", new THREE.CylinderGeometry(0.29, 0.235, 0.07, 64, 1, true), [0, H + 0.865, 0]);
  add("polished", new THREE.TorusGeometry(0.29, 0.012, 8, 64), [0, H + 0.9, 0], [Math.PI / 2, 0, 0]);
  add("shadowGap", new THREE.CircleGeometry(0.24, 48), [0, H + 0.835, 0], [-Math.PI / 2, 0, 0]);
  add("steel", new THREE.RingGeometry(0.07, 0.11, 48), [0, H + 0.84, 0], [-Math.PI / 2, 0, 0]);
  add("lens", new THREE.SphereGeometry(0.058, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), [0, H + 0.84, 0]);

  // ── gimbal: two polished yoke arms rise from the dish rim and end in hubs;
  //    a steel pin from each hub seats into the equator band on the orb ──
  const HUB_IN = BAND_R + 0.07;
  const arm = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.83, 0.26),
    new THREE.Vector3(0, 0.98, 0.4),
    new THREE.Vector3(0, 1.28, 0.475),
    new THREE.Vector3(0, YOKE_Y - 0.03, HUB_IN + 0.03),
  ]);
  for (const k of [-1, 1]) {
    const yaw = FACE_Y + (k * Math.PI) / 2;
    add("polished", new THREE.TubeGeometry(arm, 48, 0.018, 12, false), [0, 0, 0], [0, 0, 0], yaw, H);
    // hub: a painted boss across the arm tip, its axis pointing at the orb
    add("paint", new THREE.CylinderGeometry(0.036, 0.036, 0.06, 24), [0, YOKE_Y, HUB_IN + 0.03], [Math.PI / 2, 0, 0], yaw, H);
    add("polished", new THREE.CylinderGeometry(0.026, 0.026, 0.008, 20), [0, YOKE_Y, HUB_IN - 0.004], [Math.PI / 2, 0, 0], yaw, H);
    // pin: hub face → band (touches the band's outer face)
    const pinLen = HUB_IN - BAND_R;
    add("polished", new THREE.CylinderGeometry(0.011, 0.011, pinLen, 14), [0, YOKE_Y, BAND_R + pinLen / 2], [Math.PI / 2, 0, 0], yaw, H);
    // seat: a small saddle clamped onto the band where the pin lands
    add("steel", new THREE.BoxGeometry(0.05, 0.03, 0.014), [0, YOKE_Y, BAND_R + 0.004], [0, 0, 0], yaw, H);
  }
  // gimbal ring — pivots on the pins, tipped about the pin axis (local z)
  {
    const band = new THREE.TorusGeometry(BAND_R, 0.0065, 8, 128);
    band.rotateX(-Math.PI / 2);
    band.rotateZ(BAND_TILT);
    add("polished", band, [0, YOKE_Y, 0], [0, 0, 0], FACE_Y + Math.PI / 2, H);
  }

  const out = {} as Record<HwKey, THREE.BufferGeometry>;
  for (const key of Object.keys(parts) as HwKey[]) {
    const list = parts[key];
    // mergeGeometries needs matching index-ness: the faceted housing is the
    // only non-indexed part and lives alone in its bucket
    out[key] = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (list.length > 1) list.forEach((g) => g.dispose());
  }
  return out;
}

/** The hardware: plinth, cable cover + service plate, projector, gimbal. */
function Projector({ accent, wallX }: { accent: string; wallX: number }) {
  const geo = useMemo(() => buildHardware(wallX), [wallX]);
  const mats = useMemo<Record<HwKey, THREE.Material>>(
    () => ({
      paint: MATERIALS.paintLight({ color: NEUTRAL.hullLight }),
      plinth: MATERIALS.paint({ color: NEUTRAL.hull }),
      column: MATERIALS.steel({ color: NEUTRAL.steelLight }),
      shadowGap: MATERIALS.paint({ color: NEUTRAL.hullShadow }),
      steel: MATERIALS.steel(),
      polished: MATERIALS.polished(),
      dish: Object.assign(MATERIALS.steel({ color: NEUTRAL.steel }), { side: THREE.DoubleSide }),
      led: MATERIALS.emit(lightTint(accent, 0.35), GLOW.trim),
      warm: MATERIALS.emit(WARM, GLOW.trim),
      lens: MATERIALS.emit(lightTint(accent, 0.35), GLOW.trim),
    }),
    [accent],
  );
  useDeferredDispose(geo);
  useDeferredDispose(mats);
  return (
    <group>
      {(Object.keys(geo) as HwKey[]).map((k) => (
        <mesh key={k} geometry={geo[k]} material={mats[k]} />
      ))}
    </group>
  );
}

/** Fine gyro arc (part torus) around the crystal. */
function arcGeometry(r: number) {
  return new THREE.TorusGeometry(r, 0.0032, 6, 96, Math.PI * 1.6);
}

export default function MemoryCore({
  accent,
  animate,
  wallX,
  frontYaw,
}: {
  accent: string;
  animate: boolean;
  /** side-wall face in the core's local x (cable cover + service plate). */
  wallX: number;
  /** yaw (from +z toward +x) of the direction from the core to the dwell
   *  camera — the orbit layout's "front". */
  frontYaw: number;
}) {
  const orbit = useRef<THREE.Group>(null);
  const center = useRef<THREE.Group>(null);
  const crystal = useRef<THREE.Mesh>(null);
  const gyroA = useRef<THREE.Mesh>(null);
  const chips = useRef<(THREE.Group | null)[]>([]);
  const halo = useRef<THREE.Mesh>(null);
  const clock = useRef(0);
  const atlas = useChipAtlas(accent);

  const uShell = useShellUniforms(accent, ORB_R);
  const uCrystal = useMemo(
    () => ({
      uDeep: { value: new THREE.Color(accent).multiplyScalar(0.55) },
      uHi: { value: lightTint(accent, 0.62).multiplyScalar(1.35) },
    }),
    [accent],
  );
  const uBeam = useMemo(() => ({ uColor: { value: lightTint(accent, 0.3) }, uI: { value: 0.42 } }), [accent]);
  const shellMat = useShellMaterial(uShell);
  const crystalMat = useShader(crystalFrag, crystalVert, uCrystal, false);
  const beamMat = useShader(beamFrag, beamVert, uBeam);

  const m = useMemo(
    () => ({
      track: new THREE.MeshBasicMaterial({ color: lightTint(accent, 0.2).multiplyScalar(GLOW.trim * 0.9), toneMapped: false }),
      gyro: new THREE.MeshBasicMaterial({ color: lightTint(accent, 0.5).multiplyScalar(GLOW.line), toneMapped: false }),
      spoke: new THREE.LineBasicMaterial({ color: lightTint(accent, 0.4).multiplyScalar(GLOW.line), transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }),
      chip: new THREE.MeshBasicMaterial({ map: atlas, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }),
      glass: new THREE.MeshStandardMaterial({ color: NEUTRAL.glassTint, roughness: 0.08, metalness: 0.9, transparent: true, opacity: 0.22, depthWrite: false }),
      halo: new THREE.MeshBasicMaterial({ map: getPuckTex(), color: accent, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      shadow: new THREE.MeshBasicMaterial({ map: getPuckTex(), color: NEUTRAL.void, transparent: true, opacity: 0.35, depthWrite: false }),
    }),
    [accent, atlas],
  );

  const geo = useMemo(() => {
    const chipGeos = ORBIT.map((mem, i) => chipGeometry(i, mem.score !== undefined ? CHIP : CHIP_DORMANT));
    const pts: number[] = [];
    ORBIT.forEach((mem) => {
      if (mem.score === undefined) return;
      const s = Math.sin(mem.at);
      const c = Math.cos(mem.at);
      pts.push(s * (BAND_R + 0.01), 0, c * (BAND_R + 0.01), s * (TRACK_R - CHIP * 0.5), 0, c * (TRACK_R - CHIP * 0.5));
    });
    const spokes = new THREE.BufferGeometry();
    spokes.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const slab = new THREE.BoxGeometry(CHIP * 0.94, CHIP * 0.94, 0.012);
    const crystalGeo = new THREE.IcosahedronGeometry(ORB_R * 0.36, 0);
    const arcA = arcGeometry(ORB_R * 0.6);
    return { chipGeos, spokes, slab, crystalGeo, arcA };
  }, []);

  const geoList = useMemo(() => [geo.spokes, geo.slab, geo.crystalGeo, geo.arcA, ...geo.chipGeos], [geo]);
  useDeferredDispose(m);
  useDeferredDispose(geoList);

  // tiles sit tangent to the orbit, yawed most of the way toward the viewer:
  // they foreshorten with the track instead of reading as pasted-on icons
  const tmp = useMemo(
    () => ({ c: new THREE.Vector3(), p: new THREE.Vector3(), r: new THREE.Vector3(), t: new THREE.Vector3() }),
    [],
  );
  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (animate) {
      clock.current += dt;
      const t = clock.current;
      // the orbit sways (±0.1 rad over 28 s) rather than spinning, so the
      // composition holds and no tile drifts across the orb
      if (orbit.current) orbit.current.rotation.y = 0.1 * Math.sin((t * Math.PI * 2) / 28);
      if (crystal.current) crystal.current.rotation.y += dt * 0.12;
      if (gyroA.current) gyroA.current.rotation.z += dt * 0.16;
      uShell.uT.value += dt * 0.03;
    }
    if (!center.current) return;
    center.current.getWorldPosition(tmp.c);
    for (const g of chips.current) {
      if (!g) continue;
      g.getWorldPosition(tmp.p);
      tmp.r.subVectors(tmp.p, tmp.c).setY(0).normalize();
      tmp.t.subVectors(camera.position, tmp.p).normalize();
      tmp.r.multiplyScalar(0.5).add(tmp.t).normalize().add(tmp.p);
      g.lookAt(tmp.r);
    }
    halo.current?.lookAt(camera.position);
  });

  const beamH = ORB_Y - ORB_R * 0.75 - LENS_Y;
  return (
    <group>
      {/* soft contact shadow grounding the plinth on the deck */}
      <mesh position={[0, 0.003, 0]} rotation-x={-Math.PI / 2} material={m.shadow}>
        <planeGeometry args={[1.35, 1.35]} />
      </mesh>
      <Projector accent={accent} wallX={wallX} />
      {/* projection cone: narrow at the lens, fading fast up into the orb */}
      <mesh position={[0, LENS_Y + beamH / 2, 0]} material={beamMat}>
        <cylinderGeometry args={[ORB_R * 0.6, 0.045, beamH, 40, 1, true]} />
      </mesh>

      <group ref={center} position={[0, ORB_Y, 0]}>
        <mesh ref={halo} material={m.halo}>
          <planeGeometry args={[ORB_R * 3.2, ORB_R * 3.2]} />
        </mesh>
        {/* the mind: faceted crystal + a fine gyro arc */}
        <mesh ref={crystal} geometry={geo.crystalGeo} material={crystalMat} rotation={[0.35, 0, 0.2]} />
        <group rotation={[1.1, 0.2, 0]}>
          <mesh ref={gyroA} geometry={geo.arcA} material={m.gyro} />
        </group>
        <mesh material={shellMat} renderOrder={2}>
          <sphereGeometry args={[ORB_R, 64, 40]} />
        </mesh>

        {/* the orbit: one track tilted toward the camera, carrying the tiles */}
        <group rotation-y={frontYaw}>
          <group rotation-x={TILT}>
            <group ref={orbit}>
              <mesh rotation-x={Math.PI / 2} material={m.track}>
                <torusGeometry args={[TRACK_R, 0.0045, 6, 180]} />
              </mesh>
              <lineSegments geometry={geo.spokes} material={m.spoke} />
              {ORBIT.map((mem, i) => {
                const lit = mem.score !== undefined;
                return (
                  <group key={i} position={[Math.sin(mem.at) * TRACK_R, 0, Math.cos(mem.at) * TRACK_R]}>
                    <group
                      ref={(el) => {
                        chips.current[i] = el;
                      }}
                    >
                      {lit && <mesh geometry={geo.slab} material={m.glass} position-z={-0.007} />}
                      <mesh geometry={geo.chipGeos[i]} material={m.chip} />
                    </group>
                  </group>
                );
              })}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
