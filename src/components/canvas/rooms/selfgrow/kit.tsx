"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLOW, MATERIALS, NEUTRAL, WARM, tintNeutral } from "../../theme";

/* ── SelfGrow nursery kit ─────────────────────────────────────────────────────
 * One material family + ONE procedural plant language for the whole room, so
 * the streak bed, the group's cloches and the feature plants read as a single
 * authored greenhouse instead of props from three packs:
 *  - smoked WALNUT (with a quiet procedural grain) + dark hull steel +
 *    machined lips for furniture — the ship's neutrals, walnut the WARM
 *    secondary,
 *  - dark charcoal-GLAZED ceramic for every planter, cell collar and saucer
 *    (unglazed clay foot, the glaze thinning to a warm break at the lip),
 *  - natural LEAF greens: folded blades shaded petiole→tip, pale midrib,
 *    faint lateral veins, paler undersides; warmed from above where the grow
 *    bar hangs (a shader term, not a light). The accent is light only: the
 *    deck's front LED line, the group's shared ring and today's seed ring.
 * ──────────────────────────────────────────────────────────────────────── */

export type NurseryMats = ReturnType<typeof makeMats>;

/* ── deferred disposal ───────────────────────────────────────────────────────
 * React StrictMode (dev) runs every effect cleanup once straight after mount,
 * and the scene's compile-before-reveal pass may still hold a pending
 * compileAsync on these materials — disposing them then throws inside three
 * ("reading isReady"). Cleanup only SCHEDULES disposal; a re-mount with the
 * same object cancels it, a real unmount disposes a few seconds later. */
type Disposable = { dispose: () => void };
const pendingDispose = new WeakMap<object, number>();
export function useDeferredDispose(objs: Disposable | Disposable[] | Record<string, Disposable>) {
  useEffect(() => {
    const list: Disposable[] = Array.isArray(objs) ? objs : "dispose" in objs ? [objs as Disposable] : Object.values(objs);
    for (const o of list) {
      const t = pendingDispose.get(o);
      if (t !== undefined) {
        window.clearTimeout(t);
        pendingDispose.delete(o);
      }
    }
    return () => {
      for (const o of list) {
        pendingDispose.set(
          o,
          window.setTimeout(() => {
            pendingDispose.delete(o);
            o.dispose();
          }, 8000),
        );
      }
    };
  }, [objs]);
}

/** Walnut boarding + grain in WORLD space (the bay never tilts, so every
 *  walnut piece shares one horizontal board rhythm and the seams meet at the
 *  corners): 62 mm boards, each its own tone (±5%), a fine dark seam between
 *  them, long wavy grain with slow meander and fine pores (±7%). */
function addGrain(m: THREE.MeshStandardMaterial, key: string) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSgP;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vSgP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vSgP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSgP;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float by = vSgP.y / 0.062;
          float board = floor(by);
          float tone = fract(sin(board * 91.7 + 13.1) * 43758.5453);
          float fy = fract(by);
          float seam = 1.0 - smoothstep(0.0, 0.035, min(fy, 1.0 - fy));
          float gw = vSgP.y * 160.0 + sin(vSgP.x * 2.3 + vSgP.z * 1.9 + board * 1.7) * 2.6 + sin(vSgP.x * 9.0 - vSgP.z * 7.0) * 0.5;
          float g = pow(0.5 + 0.5 * sin(gw), 3.0);
          float pore = fract(sin(dot(floor(vSgP * vec3(260.0, 900.0, 260.0)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          diffuseColor.rgb *= (0.95 + 0.1 * tone) * (0.95 + 0.08 * (1.0 - g) - 0.03 * pore) * (1.0 - 0.42 * seam);
        }`,
      );
  };
  m.customProgramCacheKey = () => key;
}

function makeMats(accent: string) {
  // smoked walnut, a touch darker/less saturated so it sits with the cool hull
  const walnut = MATERIALS.wood({ color: "#5a4130" });
  walnut.roughness = 0.48;
  addGrain(walnut, "selfgrow-walnut-v2");
  // dark charcoal glaze (a warm cast), clearcoated — bed collars, saucers
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: tintNeutral(NEUTRAL.hull, WARM, 0.09),
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.22,
  });
  const soil = new THREE.MeshStandardMaterial({ color: "#1d1611", roughness: 1, metalness: 0, envMapIntensity: 0.5 });
  const pebble = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.72, metalness: 0 });
  const plinth = MATERIALS.paint({ color: NEUTRAL.hullShadow });
  const body = MATERIALS.paintLight({ color: "#343c4e" });
  const deck = MATERIALS.paint({
    color: new THREE.Color(NEUTRAL.hull).lerp(new THREE.Color(NEUTRAL.hullLight), 0.22).lerp(new THREE.Color(WARM), 0.05),
  });
  deck.roughness = 0.74;
  deck.metalness = 0.12;
  const lip = MATERIALS.polished();
  const steel = MATERIALS.steel();
  const leaf = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.52, metalness: 0, side: THREE.DoubleSide });
  const stem = new THREE.MeshStandardMaterial({ color: "#2f4a2a", roughness: 0.72, metalness: 0 });
  const glass = new THREE.MeshStandardMaterial({
    color: "#e4ecff",
    roughness: 0.04,
    metalness: 0.35,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    envMapIntensity: 1.6,
  });
  const ledTrim = MATERIALS.emit(accent, GLOW.trim);
  const ledLine = MATERIALS.emit(accent, GLOW.line);
  // the grow bar's diffuser: warm, just at the bloom threshold
  const warmFace = new THREE.MeshBasicMaterial({ color: new THREE.Color(WARM).multiplyScalar(1.1), toneMapped: false });
  return { walnut, ceramic, soil, pebble, plinth, body, deck, lip, steel, leaf, stem, glass, ledTrim, ledLine, warmFace };
}

/** Memoised per-accent material set (disposed with the room). */
export function useNurseryMats(accent: string): NurseryMats {
  const mats = useMemo(() => makeMats(accent), [accent]);
  useDeferredDispose(mats);
  return mats;
}

/* ── procedural leaf ─────────────────────────────────────────────────────── */

/** Unit leaf: petiole at the origin, blade along +x (length 1). The blade is
 *  FOLDED along a crisp midrib (the two halves are separate vertex strips so
 *  the crease keeps a hard normal and light splits across it), lightly cupped,
 *  and arched so the tip rises then droops. Tapered base, acuminate tip.
 *  `width` is the half-width at the widest point; front faces point up. */
function makeLeafGeometry(width: number, arch: number, fold: number): THREE.BufferGeometry {
  const U = 14;
  const V = 4; // per half
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const row = V + 1;
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= U; i++) {
      const u = i / U;
      const w = width * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.78)), 0.9);
      const lift = arch * (0.22 * u - 0.34 * u * u);
      for (let j = 0; j <= V; j++) {
        const a = j / V; // 0 at the midrib, 1 at the margin
        const v = side * a;
        const y = fold * a * w + 0.35 * a * a * w + lift; // fold + cup + arch
        pos.push(u, y, v * w);
        uvs.push(u, (v + 1) / 2);
      }
    }
    for (let i = 0; i < U; i++) {
      for (let j = 0; j < V; j++) {
        const a = base + i * row + j;
        const b = a + row;
        // wind so the upper surface is the front face on both halves
        if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const _geo: { slim?: THREE.BufferGeometry; broad?: THREE.BufferGeometry; stem?: THREE.BufferGeometry } = {};
function leafGeo(broad: boolean) {
  if (broad) return (_geo.broad ??= makeLeafGeometry(0.21, 1.2, 0.36));
  return (_geo.slim ??= makeLeafGeometry(0.25, 1, 0.26));
}
function stemGeo() {
  if (!_geo.stem) {
    _geo.stem = new THREE.CylinderGeometry(0.7, 1, 1, 7, 1);
    _geo.stem.translate(0, 0.5, 0);
  }
  return _geo.stem;
}

/* ── growth ──────────────────────────────────────────────────────────────── */

export type Sprout = { x: number; y: number; z: number; age: number; seed: number };

const GOLDEN = 2.39996;
const YOUNG = new THREE.Color("#a8b86e");
const MATURE = new THREE.Color("#24553a");
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export type Built = { stems: THREE.Matrix4[]; leaves: THREE.Matrix4[]; colors: THREE.Color[] };

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);

/** Grow each sprout: stem height, leaf count, size and colour all follow age
 *  (0 = planted today, 1 = the first clean day). The curve is steep on
 *  purpose — the young weeks stay tiny sprouts and only the oldest rows are
 *  properly leafy, so the gradient reads from across the corridor. Each
 *  plant also gets its own vigour (±10%) and a small offset inside its cell,
 *  so the rows read as grown, not stamped. */
export function grow(sprouts: Sprout[], scale: number): Built {
  const stems: THREE.Matrix4[] = [];
  const leaves: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const qz = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  for (const s of sprouts) {
    const a = s.age;
    const g = Math.pow(a, 1.7); // visual maturity
    const vigor = 0.9 + 0.2 * hash(s.seed + 21);
    const sx = s.x + (hash(s.seed + 41) - 0.5) * 0.02 * scale;
    const sz = s.z + (hash(s.seed + 43) - 0.5) * 0.02 * scale;
    const h = (0.012 + 0.2 * g) * scale * vigor;
    const lean = (hash(s.seed + 3) - 0.5) * 0.14;
    const leanYaw = hash(s.seed + 4) * Math.PI * 2;
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(leanYaw), 0, Math.sin(leanYaw)), lean);
    const r = (0.003 + 0.0055 * g) * scale;
    stems.push(new THREE.Matrix4().compose(new THREE.Vector3(sx, s.y, sz), tilt, new THREE.Vector3(r, h, r)));
    const cot = a < 0.1; // a pair of seed leaves in the first days
    const n = cot ? 2 : 3 + Math.round(Math.pow(a, 1.1) * 11);
    const yaw0 = hash(s.seed) * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 1 : k / (n - 1);
      const hk = cot ? h : h * (0.25 + 0.75 * t);
      const yaw = cot ? yaw0 + k * Math.PI : yaw0 + k * GOLDEN;
      const size =
        (cot ? 0.04 + 0.12 * a : (0.03 + 0.19 * g) * (1.15 - 0.5 * t)) * scale * vigor * (0.88 + 0.24 * hash(s.seed + k * 7));
      const pitch = cot ? 0.3 : 0.04 + 0.6 * t * t + (hash(s.seed + k * 13) - 0.5) * 0.2;
      const roll = (hash(s.seed + k * 5) - 0.5) * 0.5;
      qy.setFromAxisAngle(Y, yaw);
      qz.setFromAxisAngle(Z, pitch);
      qx.setFromAxisAngle(X, roll);
      q.copy(tilt).multiply(qy).multiply(qz).multiply(qx);
      const p = new THREE.Vector3(0, hk, 0).applyQuaternion(tilt).add(new THREE.Vector3(sx, s.y, sz));
      leaves.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(size, size, size)));
      const c = YOUNG.clone().lerp(MATURE, Math.min(1, a * 1.15));
      c.lerp(YOUNG, t * 0.3 * a); // new growth at the crown is fresher
      c.offsetHSL((hash(s.seed + k) - 0.5) * 0.03, 0, (hash(s.seed + k * 3) - 0.5) * 0.05);
      colors.push(c);
    }
  }
  return { stems, leaves, colors };
}

export type FeatureSpec = { x: number; y: number; z: number; height: number; leaves: number; seed: number; hue?: number; spread?: number };

/** A mature feature plant in the SAME language as the seedlings — the
 *  streak bed's week one, fully grown (a peace-lily habit): a thick crown at
 *  the soil, long olive petioles arching out in two segments, each carrying
 *  one folded lanceolate blade. Outer leaves are the longest and droop, inner
 *  ones are shorter and stand up. Leaf length varies 0.6–1.15 and every leaf
 *  gets its own tone. Built once, drawn in the shared instanced batch. */
export function growFeature(specs: FeatureSpec[]): Built {
  const stems: THREE.Matrix4[] = [];
  const leaves: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const qz = new THREE.Quaternion();
  const qx = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const base = new THREE.Color("#28573a");
  const deep = new THREE.Color("#173a28");
  for (const f of specs) {
    const H = f.height;
    const spread = f.spread ?? 1;
    const yaw0 = hash(f.seed) * Math.PI * 2;
    // crown: a short thick base where the petioles gather at the soil
    const cr = 0.022 * (H / 1.2) + 0.008;
    stems.push(new THREE.Matrix4().compose(new THREE.Vector3(f.x, f.y - 0.01, f.z), q.identity(), new THREE.Vector3(cr, 0.05 * H + 0.01, cr)));
    for (let k = 0; k < f.leaves; k++) {
      const t = k / (f.leaves - 1); // 0 = outer/oldest, 1 = inner/newest
      const yaw = yaw0 + k * GOLDEN;
      const jitter = hash(f.seed + k * 17);
      const theta = (0.1 + 0.46 * (1 - t) * (0.8 + 0.4 * jitter)) * spread;
      const len = H * (0.32 + 0.3 * Math.sin(Math.PI * (0.2 + 0.7 * t))) * (0.86 + 0.28 * hash(f.seed + k * 29));
      const r = (0.0075 * (H / 1.2) + 0.002) * (0.8 + 0.4 * (1 - t));
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      let px = f.x + cy * cr * 0.5;
      let py = f.y + 0.03 * H;
      let pz = f.z + sy * cr * 0.5;
      const segs: [number, number][] = [
        [theta * 0.5, 0.55],
        [theta * 1.5 + 0.1, 0.45],
      ];
      for (const [th, frac] of segs) {
        dir.set(Math.sin(th) * cy, Math.cos(th), Math.sin(th) * sy);
        q.setFromUnitVectors(Y, dir);
        const l = len * frac;
        stems.push(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), q, new THREE.Vector3(r, l + r, r)));
        px += dir.x * l;
        py += dir.y * l;
        pz += dir.z * l;
      }
      // folded blade from the petiole tip: long outer leaves arch out and
      // droop, short young inner ones stand up — a soft fountain, not a ball
      const L = 0.6 + 0.55 * (0.35 * (1 - t) + 0.65 * hash(f.seed + k * 31)); // 0.6–1.15
      const size = H * 0.4;
      const elev = -0.22 + 1.0 * t + (jitter - 0.5) * 0.32;
      qy.setFromAxisAngle(Y, -yaw);
      qz.setFromAxisAngle(Z, elev);
      qx.setFromAxisAngle(X, (hash(f.seed + k * 7) - 0.5) * 0.6);
      const lq = new THREE.Quaternion().copy(qy).multiply(qz).multiply(qx);
      leaves.push(
        new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), lq, new THREE.Vector3(size * L, size * (0.8 + 0.2 * L), size * (0.85 + 0.15 * L))),
      );
      // older outer leaves deeper, young inner ones fresher; ±8% value each
      const c = deep.clone().lerp(base, 0.35 + 0.65 * t).lerp(YOUNG, 0.1 * t * t);
      c.offsetHSL((f.hue ?? 0) * 0.022 + (hash(f.seed + k) - 0.5) * 0.02, (hash(f.seed + k * 11) - 0.5) * 0.06, 0);
      c.multiplyScalar(0.92 + 0.16 * hash(f.seed + k * 3));
      colors.push(c);
    }
  }
  return { stems, leaves, colors };
}

/* ── instanced renderer ──────────────────────────────────────────────────── */

/** Warm practical the leaves respond to: a horizontal bar at (x, y) spanning
 *  z0..z1 in the instanced mesh's own space; strength 0 disables it. */
export type LampBar = { x: number; y: number; z0: number; z1: number; strength: number };
const NO_LAMP: LampBar = { x: 0, y: 0, z0: 0, z1: 0, strength: 0 };

/** Stems + leaves in TWO draw calls. Leaves are shaded petiole→tip (dark at
 *  the base, fresh at the tip) with a pale midrib, faint lateral veins on the
 *  broad blades and a paler underside, so each one has real form; leaves
 *  near the grow bar take its warmth on their up-facing surfaces. They
 *  breathe with a slow, per-leaf phase-shifted sway (~8 s period,
 *  millimetres of travel) — frozen when `animate` is false. */
export function PlantInstances({
  built,
  mats,
  animate,
  broad = false,
  lamp = NO_LAMP,
}: {
  built: Built;
  mats: NurseryMats;
  animate: boolean;
  broad?: boolean;
  lamp?: LampBar;
}) {
  const stemRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const time = useRef({ value: 0 });

  const leafMat = useMemo(() => {
    const m = mats.leaf.clone();
    const uTime = time.current;
    const uLampA = { value: new THREE.Vector4(lamp.x, lamp.y, lamp.z0, lamp.z1) };
    const uLampK = { value: lamp.strength };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uLampA = uLampA;
      shader.uniforms.uLampK = uLampK;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec2 vSgUv;\nvarying vec3 vSgP;\nvarying vec3 vSgN;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vSgUv = uv;
          #ifdef USE_INSTANCING
            float sgPh = instanceMatrix[3].x * 9.0 + instanceMatrix[3].z * 6.0;
            transformed.y += sin(uTime * 0.8 + sgPh) * 0.05 * position.x * position.x;
            vSgP = (instanceMatrix * vec4(transformed, 1.0)).xyz;
            vSgN = normalize(mat3(instanceMatrix) * objectNormal);
          #else
            vSgP = transformed;
            vSgN = objectNormal;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          ${broad ? "#define SG_BROAD" : ""}
          uniform vec4 uLampA;
          uniform float uLampK;
          varying vec2 vSgUv;
          varying vec3 vSgP;
          varying vec3 vSgN;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float sgLampW = 0.0;
          {
            float sgA = abs(vSgUv.y - 0.5) * 2.0; // 0 midrib → 1 margin
            // petiole → tip: deep at the base, fresh toward the tip
            diffuseColor.rgb *= mix(0.42, 1.18, smoothstep(0.0, 0.85, vSgUv.x));
            // pale midrib fading toward the tip
            float sgRib = 1.0 - smoothstep(0.0, 0.05, sgA);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.45, 1.5, 1.12) + vec3(0.02, 0.025, 0.0), sgRib * 0.6 * (1.0 - 0.7 * vSgUv.x));
            #ifdef SG_BROAD
              // lateral veins sweeping toward the tip, faint and recessed
              float sgS = vSgUv.x * 11.0 - sgA * 2.6;
              float sgD = abs(fract(sgS) - 0.5);
              float sgVein = smoothstep(0.38, 0.5, sgD) * (1.0 - smoothstep(0.7, 1.0, sgA)) * smoothstep(0.06, 0.2, vSgUv.x);
              diffuseColor.rgb *= 1.0 - 0.16 * sgVein;
              // a slightly lighter, yellower margin
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.12, 0.9), smoothstep(0.75, 1.0, sgA) * 0.5);
            #endif
            // the underside of a leaf is paler and greyer
            if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.3, 1.12) + vec3(0.02, 0.03, 0.02), 0.6);
            // warmth from the grow bar above: proximity to the bar × up-facing
            if (uLampK > 0.0) {
              vec2 sgQ = vec2(vSgP.x - uLampA.x, vSgP.z - clamp(vSgP.z, uLampA.z, uLampA.w));
              float sgNear = 1.0 - smoothstep(0.1, 0.85, length(sgQ));
              float sgBelow = smoothstep(uLampA.y - 2.0, uLampA.y - 0.9, vSgP.y);
              float sgUp = (gl_FrontFacing ? 1.0 : -1.0) * normalize(vSgN).y;
              sgLampW = clamp(uLampK * sgNear * sgBelow * (0.25 + 0.75 * clamp(sgUp, 0.0, 1.0)), 0.0, 1.0);
              diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.7, 1.3, 0.7), sgLampW);
            }
          }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          // the bar's light on the leaf, independent of the dim column's pool
          totalEmissiveRadiance += (diffuseColor.rgb * vec3(1.2, 0.9, 0.5) + vec3(0.05, 0.032, 0.01)) * sgLampW;`,
        );
    };
    m.customProgramCacheKey = () => (broad ? "selfgrow-leaf-v4-broad" : "selfgrow-leaf-v4");
    return m;
  }, [mats.leaf, broad, lamp.x, lamp.y, lamp.z0, lamp.z1, lamp.strength]);
  useDeferredDispose(leafMat);

  useLayoutEffect(() => {
    const st = stemRef.current;
    const lf = leafRef.current;
    if (!st || !lf) return;
    built.stems.forEach((m, i) => st.setMatrixAt(i, m));
    built.leaves.forEach((m, i) => {
      lf.setMatrixAt(i, m);
      lf.setColorAt(i, built.colors[i]);
    });
    st.instanceMatrix.needsUpdate = true;
    lf.instanceMatrix.needsUpdate = true;
    if (lf.instanceColor) lf.instanceColor.needsUpdate = true;
    st.computeBoundingSphere();
    lf.computeBoundingSphere();
  }, [built]);

  useFrame((_, dt) => {
    if (animate) time.current.value += Math.min(dt, 1 / 30);
  });

  return (
    <group>
      <instancedMesh key={`s${built.stems.length}`} ref={stemRef} args={[stemGeo(), mats.stem, built.stems.length]} />
      <instancedMesh key={`l${built.leaves.length}`} ref={leafRef} args={[leafGeo(broad), leafMat, built.leaves.length]} />
    </group>
  );
}

/** A tray of procedural seedlings (see `grow`). */
export function Seedlings({
  sprouts,
  mats,
  animate,
  scale = 1,
}: {
  sprouts: Sprout[];
  mats: NurseryMats;
  animate: boolean;
  scale?: number;
}) {
  const built = useMemo(() => grow(sprouts, scale), [sprouts, scale]);
  return <PlantInstances built={built} mats={mats} animate={animate} />;
}
