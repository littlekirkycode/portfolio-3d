"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GLOW, NEUTRAL, WARM } from "../../theme";
import { useTextTexture } from "../../canvas2d";
import { fonts } from "../holo";

/* ── Xuabelle boutique kit: one material palette + geometry helpers ──────────
 * Quiet-luxury display furniture in three materials — satin plum-grey
 * lacquer (a hull neutral pulled a touch toward the accent), brushed brass
 * (WARM, the ship's only secondary hue) and garnet velvet — plus the jewels'
 * own polished gold / faceted stone. The accent appears only as a small
 * garnet stone and as light. Everything is static except the hero turntable. */

export const BRASS = "#b8925a";
export const GOLD = "#e2c07e";
export const OXBLOOD = "#4a1418";

export type BoutiqueMats = {
  lacquer: THREE.MeshPhysicalMaterial;
  gap: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  velvet: THREE.MeshPhysicalMaterial;
  /** the bench's seat: a touch more oxblood than the display velvet */
  upholstery: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshStandardMaterial;
  glassEdge: THREE.LineBasicMaterial;
  gold: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  /** small stones + the hero: whiter, so a 20 px piece still reads as diamond */
  stoneBright: THREE.MeshStandardMaterial;
  garnet: THREE.MeshStandardMaterial;
  beam: THREE.ShaderMaterial;
  /** the hero vitrine's stronger (still static) downlight */
  heroBeam: THREE.ShaderMaterial;
  /** the display wall's cornice wash, half the vitrines' beam */
  wash: THREE.ShaderMaterial;
  pool: THREE.MeshBasicMaterial;
  heroPool: THREE.MeshBasicMaterial;
  contact: THREE.MeshBasicMaterial;
  warmLine: THREE.MeshBasicMaterial;
  plaque: THREE.MeshStandardMaterial;
};

/* ── engraved brass plaques: every label shares ONE canvas texture ── */

/** Numerals only: at the dwell camera a plaque is ~45 px wide, so a full
 *  name was a 4 px smear. A large engraved numeral between two rules reads
 *  as a gallery mark. */
export const PLAQUES = ["N°01", "N°02", "N°03"] as const;
export const PLQ_W = 512;
export const PLQ_ROW = 96;

function paintPlaques(ctx: CanvasRenderingContext2D, w: number) {
  const { ser } = fonts();
  PLAQUES.forEach((label, i) => {
    const y0 = i * PLQ_ROW;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + PLQ_ROW);
    g.addColorStop(0, "#e2c690");
    g.addColorStop(0.5, "#c7a468");
    g.addColorStop(1, "#9c7a45");
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, w, PLQ_ROW);
    ctx.strokeStyle = "rgba(60,40,18,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, y0 + 8, w - 16, PLQ_ROW - 16);
    ctx.fillStyle = "#2c1d0e";
    ctx.font = `600 ${Math.round(PLQ_ROW * 0.62)}px ${ser}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, w / 2, y0 + PLQ_ROW / 2 + 3);
    // engraved rules either side of the numeral
    const tw = ctx.measureText(label).width;
    ctx.strokeStyle = "rgba(44,29,14,0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, y0 + PLQ_ROW / 2);
    ctx.lineTo(w / 2 - tw / 2 - 26, y0 + PLQ_ROW / 2);
    ctx.moveTo(w / 2 + tw / 2 + 26, y0 + PLQ_ROW / 2);
    ctx.lineTo(w - 40, y0 + PLQ_ROW / 2);
    ctx.stroke();
  });
}

const Ctx = createContext<BoutiqueMats | null>(null);

export function useBoutique(): BoutiqueMats {
  const m = useContext(Ctx);
  if (!m) throw new Error("useBoutique outside <BoutiqueMaterials>");
  return m;
}

/** Soft radial gradient (white centre → clear) — pools of light + contact shadows. */
let _radial: THREE.CanvasTexture | null = null;
function radialTex(): THREE.CanvasTexture {
  if (_radial) return _radial;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 63);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(0.7, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _radial = new THREE.CanvasTexture(c);
  return _radial;
}

/** Static soft light volume: brightest at the fixture (uv.y = 1), fading to
 *  nothing at the base and at grazing silhouettes. No time uniform. */
export function makeBeam(color: THREE.ColorRepresentation, k: number) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: k } },
    vertexShader: /* glsl */ `
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        vY = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uK;
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float a = uK * pow(vY, 3.2) * pow(f, 2.0);
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.toneMapped = false;
  return m;
}

export function BoutiqueMaterials({ accent, children }: { accent: string; children: ReactNode }) {
  const plaqueTex = useTextTexture(PLQ_W, PLQ_ROW * PLAQUES.length, paintPlaques);
  const mats = useMemo<BoutiqueMats>(() => {
    const warm = new THREE.Color(WARM);
    return {
      // deep rosewood lacquer: a hull neutral pulled darker and warm (only 5%
      // toward the accent — the red belongs to light and trim, not to big lit
      // faces — plus WARM) so the joinery separates from the steel-blue shell
      // and pairs with the brass. A soft clearcoat gives the sheen without
      // letting the bay's red side light pool on the flat faces.
      lacquer: new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(NEUTRAL.wood).lerp(new THREE.Color(NEUTRAL.hullShadow), 0.6).lerp(new THREE.Color(accent), 0.04),
        roughness: 0.45,
        metalness: 0.05,
        clearcoat: 0.35,
        clearcoatRoughness: 0.4,
      }),
      // shadow-gap recesses (toe kicks, reveals)
      gap: new THREE.MeshStandardMaterial({ color: NEUTRAL.hullShadow, roughness: 0.7, metalness: 0.1 }),
      // satin (brushed) brass: rough enough that the bay's red side light can't
      // run a hot streak down a vertical bezel
      brass: new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.46, metalness: 0.8 }),
      // display velvet: near the darkest hull neutral with a touch of oxblood,
      // so polished gold + white stones pop against it; sheen keeps its form
      velvet: new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(NEUTRAL.hullShadow).lerp(new THREE.Color(OXBLOOD), 0.22),
        roughness: 0.92,
        metalness: 0,
        sheen: 0.85,
        sheenRoughness: 0.4,
        sheenColor: new THREE.Color(accent).lerp(warm, 0.55).multiplyScalar(0.55),
      }),
      upholstery: new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(NEUTRAL.hullShadow).lerp(new THREE.Color(OXBLOOD), 0.4).lerp(new THREE.Color(NEUTRAL.wood), 0.1),
        roughness: 0.9,
        metalness: 0,
        sheen: 1,
        sheenRoughness: 0.35,
        sheenColor: new THREE.Color(accent).lerp(warm, 0.6).multiplyScalar(0.6),
      }),
      // glass: soft enough that the bay spot's reflection can't sweep a hot
      // specular across a pane as the camera walks past (flash risk)
      glass: new THREE.MeshStandardMaterial({
        color: NEUTRAL.glassTint,
        roughness: 0.16,
        metalness: 0.1,
        envMapIntensity: 0.5,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      }),
      glassEdge: new THREE.LineBasicMaterial({ color: "#fff4e2", transparent: true, opacity: 0.2, depthWrite: false }),
      gold: new THREE.MeshStandardMaterial({
        color: GOLD,
        roughness: 0.24,
        metalness: 1,
        emissive: new THREE.Color(GOLD),
        emissiveIntensity: 0.1,
      }),
      stone: new THREE.MeshStandardMaterial({
        // not pure white + real roughness: facets still read off the studio
        // environment, but the bay SPOT's specular peak (GGX ∝ 1/α²) can't
        // go hot enough to bloom a ring of stones into a white disc (it did on
        // the phone camera's steeper angle at roughness 0.12)
        color: "#cdd3de",
        roughness: 0.3,
        metalness: 1,
        flatShading: true,
        emissive: new THREE.Color("#dfe6ff"),
        emissiveIntensity: 0.08,
        envMapIntensity: 0.95,
      }),
      stoneBright: new THREE.MeshStandardMaterial({
        color: "#e6eaf2",
        roughness: 0.3,
        metalness: 1,
        flatShading: true,
        emissive: new THREE.Color("#eef2ff"),
        emissiveIntensity: 0.2,
        envMapIntensity: 1.05,
      }),
      garnet: new THREE.MeshStandardMaterial({
        color: new THREE.Color(accent).lerp(new THREE.Color("#5a0d10"), 0.25),
        roughness: 0.05,
        metalness: 0.55,
        flatShading: true,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.28,
      }),
      beam: makeBeam(warm.clone().lerp(new THREE.Color("#ffffff"), 0.15), 0.06),
      heroBeam: makeBeam(warm.clone().lerp(new THREE.Color("#ffffff"), 0.25), 0.11),
      wash: makeBeam(warm.clone().lerp(new THREE.Color("#ffffff"), 0.15), 0.03),
      pool: new THREE.MeshBasicMaterial({
        map: radialTex(),
        color: warm,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      heroPool: new THREE.MeshBasicMaterial({
        map: radialTex(),
        color: warm.clone().lerp(new THREE.Color("#ffffff"), 0.2),
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      contact: new THREE.MeshBasicMaterial({
        map: radialTex(),
        color: "#000000",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
      warmLine: new THREE.MeshBasicMaterial({ color: warm.clone().multiplyScalar(GLOW.trim), toneMapped: false }),
      plaque: new THREE.MeshStandardMaterial({
        map: plaqueTex,
        roughness: 0.4,
        metalness: 0.7,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: plaqueTex,
        emissiveIntensity: 0.14,
      }),
    };
  }, [accent, plaqueTex]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return <Ctx.Provider value={mats}>{children}</Ctx.Provider>;
}

/* ── geometry helpers ───────────────────────────────────────────────────── */

type Xf = { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] };

/** Bake a transform into a (fresh) geometry. */
export function xf(g: THREE.BufferGeometry, { p, r, s }: Xf = {}): THREE.BufferGeometry {
  if (s) g.scale(...s);
  if (r) {
    g.rotateX(r[0]);
    g.rotateY(r[1]);
    g.rotateZ(r[2]);
  }
  if (p) g.translate(...p);
  return g;
}

export const box = (w: number, h: number, d: number, t: Xf = {}) => xf(new THREE.BoxGeometry(w, h, d), t);
export const rbox = (w: number, h: number, d: number, rad: number, t: Xf = {}) =>
  xf(new RoundedBoxGeometry(w, h, d, 3, Math.min(rad, w / 2, h / 2, d / 2) * 0.999), t);
export const cyl = (rt: number, rb: number, h: number, seg: number, t: Xf = {}) =>
  xf(new THREE.CylinderGeometry(rt, rb, h, seg), t);

/** Reeded (fluted) lacquer: half-embedded vertical rods across a face of
 *  width `w` centred at x=0, from y0 to y1, face plane at z = `z` (facing +z).
 *  Returned as parts to merge into the carcass — no extra draw call. */
export function reeds(w: number, y0: number, y1: number, z: number, pitch = 0.036, r = 0.011): THREE.BufferGeometry[] {
  const n = Math.max(1, Math.floor((w - pitch * 0.5) / pitch));
  const span = (n - 1) * pitch;
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    out.push(cyl(r, r, y1 - y0, 8, { p: [-span / 2 + i * pitch, (y0 + y1) / 2, z - r * 0.35] }));
  }
  return out;
}

/** Merge static parts that share one material into one draw call. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    // keep only the attributes every part has
    for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const m = mergeGeometries(clean, false)!;
  clean.forEach((g) => g.dispose());
  return m;
}

/** Dispose a record of geometries on unmount / re-memo. */
export function useDisposeAll(geos: Record<string, THREE.BufferGeometry>) {
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
}

/** A round-brilliant cut (girdle radius 1, table up +y): lathe with few
 *  radial segments + flat shading, so each facet catches the studio
 *  environment separately — sparkle from geometry, not from blinking. */
export function brilliantGeo(seg = 10, stretch = 1): THREE.BufferGeometry {
  const pts = [
    [0, -0.82],
    [0.72, -0.28],
    [1, -0.03],
    [1, 0.04],
    [0.82, 0.2],
    [0.56, 0.34],
    [0, 0.34],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg);
  if (stretch !== 1) g.scale(1, 1, stretch);
  return g;
}

/** A pear (drop) cut: the round brilliant stretched into a teardrop along
 *  local -z (the point) — in <Stones> with a front-facing normal the point
 *  ends up at the top, the way a drop earring hangs. */
export function pearGeo(seg = 16): THREE.BufferGeometry {
  const g = brilliantGeo(seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < 0) {
      const u = Math.min(1, -z);
      pos.setX(i, pos.getX(i) * (1 - 0.72 * Math.pow(u, 1.3)));
      pos.setZ(i, z * 1.65);
    }
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Floor contact shadow + optional warm pool, the grounding every piece of
 *  furniture gets (a dark radial decal — not a light). */
export function Contact({ w, d, y = 0.006 }: { w: number; d: number; y?: number }) {
  const m = useBoutique();
  return (
    <mesh material={m.contact} position={[0, y, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}
