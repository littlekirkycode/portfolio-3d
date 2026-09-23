"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { useTextTexture } from "../../canvas2d";
import { GLOW, MATERIALS, NEUTRAL, WARM, tintNeutral } from "../../theme";
import { getPuckTex } from "../shared";
import { FlowTube } from "../holo";
import { PICKS, R, ROUTE, YOU, buildCity } from "./layout";
import { makePlatePainter } from "./plate";
import { PIN_CELL, atlasUV, mapPlaneUV } from "./pins";

/* ── the hero: a raked map table ─────────────────────────────────────────────
 * A machined projector column carries a glass map plate, raked toward the
 * corridor so the city reads from the dwell camera (like a museum vitrine).
 * On the plate: the street map (painted), the city massing (instanced, matte
 * white-card architectural-model style, so it recedes behind the story), the
 * concierge's search circle, three numbered picks and the streaming
 * route from "you" to pick 1. The map eases slowly left↔right (36 s cycle) —
 * frozen under reduced motion.
 *
 * Placement: the left showcase column, brought forward toward the opening so
 * it is the bay's focal point from the dwell camera. The plate rim (R_OUT)
 * spans x ≈ −3.64…−2.40 (clear of the side wall at −3.70; it projects well
 * left of the hero screen), and the foot (r 0.28) sits wholly off the floor
 * map (mat edge x = −2.70). */

export const TABLE = { x: -3.02, z: 1.72 };
const PIVOT_Y = 0.98; // column top / tilt knuckle
const AZ = Math.atan2(-TABLE.x, 6.15 - TABLE.z); // face the corridor camera
/** Phones: the left column is off-frame, so a scaled table stands on the
 *  floor map below the info card, square to the stepped-in camera — right of
 *  centre and back, so its column clears the DOM "EXHIBIT" eyebrow and its
 *  foot stays above the control strip. */
const MOBILE = { x: 0.34, z: 1.7, scale: 0.42 };
const TILT = 0.44; // rake toward the viewer
const PLATE_Y = 0.17; // plate above the knuckle (tilted frame)
/** The plate as built (m). The map layout is authored at radius R and scaled
 *  up onto it, so everything painted and modelled on it lines up. */
const R_OUT = 0.64;
const MAP_S = R_OUT / R;
const PIN_H = [0.36, 0.25, 0.25];
const PIN_SIZE = [0.21, 0.175, 0.175];
const FOOT_R = 0.28;
const COL_BOT = 0.085; // column body spans COL_BOT … COL_TOP
const COL_TOP = PIVOT_Y - 0.07;

/* instanced city massing — a white-card architectural model: warm, light
 * roofs; sides graded by a fixed key from above/front-right; soft contact
 * darkening at every base; faint window bands on anything taller than a
 * few storeys. No emissive edges. Towers are built as podium + setback
 * shaft (+ a plant-room crown on the tallest), so the skyline has profile. */
function useCityMaterial(accent: string) {
  const m = useMemo(() => {
    const card = tintNeutral("#eeecf4", accent, 0.08);
    const roof = new THREE.Color("#f1ece6").lerp(new THREE.Color(WARM), 0.12);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uCard: { value: card }, uRoof: { value: roof } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec2 vDim;
        varying float vY;
        varying float vH;
        varying float vWy;
        void main() {
          vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vN = normal;
          vDim = abs(normal.x) > 0.5 ? vec2(s.z, s.y) : (abs(normal.y) > 0.5 ? vec2(s.x, s.z) : vec2(s.x, s.y));
          vUv = uv;
          vY = position.y + 0.5;
          vH = s.y;
          vWy = (instanceMatrix * vec4(position, 1.0)).y;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCard;
        uniform vec3 uRoof;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec2 vDim;
        varying float vY;
        varying float vH;
        varying float vWy;
        void main() {
          vec3 c;
          if (vN.y > 0.5) {
            c = uRoof * 0.6;
            // a crisp lighter lip round the roof edge (cut-card edge)
            vec2 d = min(vUv, 1.0 - vUv) * vDim;
            float e = min(d.x, d.y);
            float w = max(fwidth(e), 1e-5);
            c *= 1.0 + 0.1 * (1.0 - smoothstep(0.8 * w, 1.8 * w, e));
          } else {
            float shade = vN.z > 0.5 ? 0.78 : (vN.x > 0.5 ? 0.64 : (vN.x < -0.5 ? 0.5 : 0.4));
            // contact darkening at the base, lighter toward the roof
            c = uCard * 0.5 * shade * (0.6 + 0.4 * smoothstep(0.0, 0.8, vY));
            // window bands (storeys) on anything taller than a few floors,
            // kept off the parapet and the ground floor
            if (vH > 0.034) {
              float f = abs(fract(vWy / 0.017) - 0.5);
              float band = smoothstep(0.3, 0.42, f);
              float keep = step(0.012, vY * vH) * step(0.006, (1.0 - vY) * vH);
              c *= 1.0 - 0.16 * (1.0 - band) * keep;
            }
          }
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    mat.toneMapped = false;
    return mat;
  }, [accent]);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

type Mass = { x: number; z: number; w: number; d: number; y0: number; h: number };

/** Lots → masses: low blocks stay single boxes; towers become a podium and a
 *  setback shaft, the tallest also get a small crown. */
function massing(): Mass[] {
  const out: Mass[] = [];
  for (const b of buildCity()) {
    if (b.plan) continue;
    if (b.h < 0.07) {
      out.push({ x: b.x, z: b.z, w: b.w, d: b.d, y0: 0, h: b.h });
      continue;
    }
    const pod = Math.min(0.03, b.h * 0.32);
    out.push({ x: b.x, z: b.z, w: b.w, d: b.d, y0: 0, h: pod });
    const sw = b.w * 0.7;
    const sd = b.d * 0.7;
    // shaft set back toward the lot's rear-right (reads as stepped terraces)
    const sx = b.x + (b.w - sw) * 0.25;
    const sz = b.z - (b.d - sd) * 0.25;
    out.push({ x: sx, z: sz, w: sw, d: sd, y0: pod, h: b.h - pod });
    if (b.h > 0.12) out.push({ x: sx, z: sz, w: sw * 0.45, d: sd * 0.45, y0: b.h, h: 0.012 });
  }
  return out;
}

function City({ accent }: { accent: string }) {
  const blocks = useMemo(() => massing(), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useCityMaterial(accent);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    blocks.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y0 + b.h / 2, b.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks]);
  return (
    <instancedMesh ref={ref} args={[undefined, mat, blocks.length]} position-y={0.002}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** One billboarded pin from the atlas (cell i), tip at the local origin. */
function Pin({ i, size, tex }: { i: number; size: number; tex: THREE.Texture }) {
  const geo = useMemo(() => {
    const w = (size * PIN_CELL.w) / PIN_CELL.h;
    const g = new THREE.PlaneGeometry(w, size);
    g.translate(0, size / 2, 0);
    mapPlaneUV(g, atlasUV(PIN_CELL.w * i, 0, PIN_CELL.w, PIN_CELL.h));
    return g;
  }, [i, size]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} renderOrder={3}>
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} alphaTest={0.02} />
    </mesh>
  );
}

/** Cylinder strut between two points. */
function Strut({ a, b, r, material }: { a: THREE.Vector3; b: THREE.Vector3; r: number; material: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), quat, len };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={material}>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  );
}

export default function HoloTable({
  accent,
  animate,
  heroAnchor,
  atlas,
  mobile = false,
}: {
  accent: string;
  animate: boolean;
  mobile?: boolean;
  /** the room's sign atlas (pins + totem face) */
  atlas: THREE.Texture;
  /** receives the hero pin's head — the concierge panel's leader aims at it */
  heroAnchor: RefObject<THREE.Object3D | null>;
}) {
  const plateTex = useTextTexture(1024, 1024, useMemo(() => makePlatePainter(accent), [accent]));

  const mats = useMemo(() => {
    // column: a light satin paint so the facets separate top to bottom (no
    // black silhouette against the dark floor)
    // (phones: the table stands outside the light pool — push it to light steel)
    const column = new THREE.MeshStandardMaterial({
      color: new THREE.Color(NEUTRAL.hullLight)
        .lerp(new THREE.Color(NEUTRAL.steel), 0.75)
        .lerp(new THREE.Color(NEUTRAL.steelLight), mobile ? 0.6 : 0)
        .lerp(new THREE.Color(accent), 0.06),
      roughness: 0.48,
      metalness: 0.15,
      flatShading: true,
    });
    const band = MATERIALS.polished();
    band.flatShading = true;
    const glassLens = new THREE.MeshStandardMaterial({ color: NEUTRAL.hullShadow, roughness: 0.12, metalness: 0.7 });
    return {
      foot: MATERIALS.paintLight({ color: new THREE.Color(NEUTRAL.hullLight).lerp(new THREE.Color(NEUTRAL.steel), 0.4).lerp(new THREE.Color(accent), 0.05) }),
      step: MATERIALS.paintLight({ color: new THREE.Color(NEUTRAL.hullLight).lerp(new THREE.Color(NEUTRAL.steel), 0.6) }),
      steel: MATERIALS.steel(),
      polished: MATERIALS.polished(),
      column,
      band,
      collar: MATERIALS.paint({ color: tintNeutral(NEUTRAL.hullLight, accent, 0.08) }),
      skirt: MATERIALS.paint({ color: tintNeutral(NEUTRAL.hull, accent, 0.1) }),
      glassLens,
      trim: MATERIALS.emit(accent, GLOW.trim),
      line: MATERIALS.emit(accent, GLOW.line),
      hot: MATERIALS.emit("#e9ddff", GLOW.hot * 0.6),
      stem: MATERIALS.emit(accent, GLOW.trim),
      heroStem: MATERIALS.emit("#e6dcff", 0.85),
    };
  }, [accent, mobile]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // three struts from the collar rim up to the plate bezel
  const struts = useMemo(
    () =>
      [0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
        return {
          a: new THREE.Vector3(Math.sin(a) * 0.19, 0.08, Math.cos(a) * 0.19),
          b: new THREE.Vector3(Math.sin(a) * (R_OUT - 0.05), PLATE_Y - 0.02, Math.cos(a) * (R_OUT - 0.05)),
        };
      }),
    [],
  );

  // the map's slow ease left-right (never a spin: pick 1 stays camera-side)
  const sway = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!animate || !sway.current) return;
    t.current += Math.min(dt, 1 / 30);
    sway.current.rotation.y = 0.2 * Math.sin((t.current * Math.PI * 2) / 36);
  });

  const route = useMemo(() => {
    // tight corners: helper points either side of every turn
    const y = 0.009;
    const pts: [number, number, number][] = [];
    ROUTE.forEach(([x, z], i) => {
      const prev = ROUTE[i - 1];
      const next = ROUTE[i + 1];
      if (prev && next) {
        const k = 0.014;
        const dp = Math.hypot(x - prev[0], z - prev[1]);
        const dn = Math.hypot(next[0] - x, next[1] - z);
        pts.push([x - ((x - prev[0]) / dp) * k, y, z - ((z - prev[1]) / dp) * k]);
        pts.push([x, y, z]);
        pts.push([x + ((next[0] - x) / dn) * k, y, z + ((next[1] - z) / dn) * k]);
      } else pts.push([x, y, z]);
    });
    return pts;
  }, []);

  // tapered faceted column
  const colR = (y: number) => 0.175 - (0.045 * (y - COL_BOT)) / (COL_TOP - COL_BOT);
  const colMid = (COL_BOT + COL_TOP) / 2;
  const az = mobile ? 0 : AZ;
  const facet = az; // the column is rotated so one facet faces the camera
  const pinK = mobile ? 0.6 : 1; // shorter stems on phones (clear of the DOM card)

  return (
    <group position={mobile ? [MOBILE.x, 0, MOBILE.z] : [TABLE.x, 0, TABLE.z]} scale={mobile ? MOBILE.scale : 1}>
      {/* floor: exhibit glow puck + trim ring (both inside the foot's clear zone) */}
      <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.15, 1.15]} />
        <meshBasicMaterial map={getPuckTex()} color={accent} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} material={mats.trim}>
        <ringGeometry args={[FOOT_R + 0.03, FOOT_R + 0.042, 64]} />
      </mesh>

      {/* base: light foot, polished chamfer at the seam, step, then the
          faceted column with polished bands and a lit slit facing the hall */}
      <mesh position={[0, 0.027, 0]} material={mats.foot}>
        <cylinderGeometry args={[FOOT_R - 0.025, FOOT_R, 0.054, 48]} />
      </mesh>
      <mesh position={[0, 0.055, 0]} rotation-x={Math.PI / 2} material={mats.polished}>
        <torusGeometry args={[FOOT_R - 0.028, 0.008, 8, 64]} />
      </mesh>
      <mesh position={[0, 0.07, 0]} material={mats.step}>
        <cylinderGeometry args={[0.2, 0.235, 0.03, 48]} />
      </mesh>
      <mesh position={[0, colMid, 0]} rotation-y={facet - Math.PI / 8} material={mats.column}>
        <cylinderGeometry args={[colR(COL_TOP), colR(COL_BOT), COL_TOP - COL_BOT, 8]} />
      </mesh>
      {[COL_BOT + 0.06, COL_TOP - 0.012].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation-y={facet - Math.PI / 8} material={mats.band}>
          <cylinderGeometry args={[colR(y) + 0.008, colR(y) + 0.008, 0.022, 8]} />
        </mesh>
      ))}
      <group rotation-y={facet}>
        <mesh position={[0, colMid + 0.02, colR(colMid) * Math.cos(Math.PI / 8) + 0.004]} rotation-x={-0.06} material={mats.trim}>
          <boxGeometry args={[0.012, 0.44, 0.006]} />
        </mesh>
      </group>
      <mesh position={[0, PIVOT_Y - 0.035, 0]} material={mats.polished}>
        <cylinderGeometry args={[0.085, 0.125, 0.07, 32]} />
      </mesh>

      {/* raked head: collar, lens, struts, bezel, plate */}
      <group position={[0, PIVOT_Y, 0]} rotation-y={az}>
        <group rotation-x={TILT}>
          <mesh position={[0, 0.045, 0]} material={mats.collar}>
            <cylinderGeometry args={[0.22, 0.12, 0.09, 48]} />
          </mesh>
          <mesh position={[0, 0.09, 0]} rotation-x={Math.PI / 2} material={mats.polished}>
            <torusGeometry args={[0.212, 0.01, 10, 64]} />
          </mesh>
          <mesh position={[0, 0.091, 0]} rotation-x={-Math.PI / 2} material={mats.glassLens}>
            <circleGeometry args={[0.15, 48]} />
          </mesh>
          <mesh position={[0, 0.093, 0]} rotation-x={-Math.PI / 2} material={mats.line}>
            <ringGeometry args={[0.12, 0.133, 64]} />
          </mesh>
          <mesh position={[0, 0.094, 0]} rotation-x={-Math.PI / 2} material={mats.hot}>
            <circleGeometry args={[0.035, 32]} />
          </mesh>
          {struts.map((s, k) => (
            <Strut key={k} a={s.a} b={s.b} r={0.011} material={mats.steel} />
          ))}
          {/* bezel: satin skirt + polished rim */}
          <mesh position={[0, PLATE_Y - 0.018, 0]} material={mats.skirt}>
            <cylinderGeometry args={[R_OUT + 0.012, R_OUT - 0.03, 0.036, 96, 1, true]} />
          </mesh>
          <mesh position={[0, PLATE_Y, 0]} rotation-x={Math.PI / 2} material={mats.polished}>
            <torusGeometry args={[R_OUT + 0.008, 0.012, 10, 128]} />
          </mesh>

          <group position={[0, PLATE_Y, 0]} ref={sway}>
            <group scale={MAP_S}>
              <mesh rotation-x={-Math.PI / 2}>
                <circleGeometry args={[R, 96]} />
                <meshBasicMaterial map={plateTex} transparent toneMapped={false} />
              </mesh>
              <City accent={accent} />
              <FlowTube points={route} color="#e8deff" radius={0.011} speed={0.12} dashes={5} base={0.8} animate={animate} />
              {/* you are here — a lit puck at the search centre */}
              <group position={[YOU[0], 0, YOU[1]]}>
                <mesh position={[0, 0.013, 0]} material={mats.heroStem}>
                  <cylinderGeometry args={[0.02, 0.022, 0.024, 24]} />
                </mesh>
                <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} material={mats.line}>
                  <ringGeometry args={[0.032, 0.041, 40]} />
                </mesh>
              </group>
              {PICKS.map(({ at }, i) => (
                <group key={i} position={[at[0], 0, at[1]]}>
                  <mesh position={[0, (PIN_H[i] * pinK) / 2, 0]} material={i === 0 ? mats.heroStem : mats.stem}>
                    <cylinderGeometry args={[0.004, 0.004, PIN_H[i] * pinK, 6]} />
                  </mesh>
                  <Billboard position={[0, PIN_H[i] * pinK, 0]}>
                    <Pin i={i} size={PIN_SIZE[i]} tex={atlas} />
                    {i === 0 && <object3D ref={heroAnchor} position={[0, PIN_SIZE[0] * 1.02, 0]} />}
                  </Billboard>
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
