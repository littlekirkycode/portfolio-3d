"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { scrollRefs } from "@/lib/scrollStore";
import { clamp01 } from "@/lib/math";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { START_X, HALF_W, WALL_H } from "./hallConfig";
import { familyVar } from "./canvas2d";
import { GLOW, NEUTRAL, WARM } from "./theme";
import { useIsMobile } from "@/lib/useIsMobile";
import { useStudioEnv } from "./studioEnv";

/**
 * Outer docking door — the p=0 hero — plus the shared PRESSURE-DOOR KIT that
 * BulkheadGates and the Lobby portal build from, so every doorway on the ship
 * is one authored family:
 *
 *  - a heavy chamfered COLLAR (jambs, lintel with a downlight lip, tread sill)
 *    with one static rim line around the portal and hazard bands on the jambs;
 *  - TELESCOPING leaves (seam leaf in front of an outer leaf) with raised
 *    panels, kick plates, vent louvres, actuator housings and grab rails;
 *  - keyed SEAL DOGS that interlock across the seam and a split LOCK HUB —
 *    eight radial dogs around a boss, retracting outward, inside a lamp ring
 *    behind a dark glass bezel (the ring is the status light);
 *  - one procedural wear texture (brushed streaks, pits, grime) drives colour
 *    variation + roughness on every door surface, and a shader hook adds the
 *    vertical light falloff, bottom grime and worn bevel edges — no new lights.
 *
 * Opening is a pure function of the CAMERA playhead (Rig's smoothed scroll —
 * raw scroll under reduced motion), so the door moves in lockstep with the
 * dolly, scrubs both ways and never snaps on a wheel flick:
 *    0.0012 → 0.008  seals release — dogs retract, ring red → amber → green,
 *                     the leaves crack 6 mm and the slit brightens;
 *    0.0085 → 0.030  the leaves part (seam leaf travels ~2× the outer leaf and
 *                     both stack into the jamb pockets) while the camera has
 *                     barely moved (≈1.8 m of dolly by 0.03), so the door opens
 *                     FIRST and then you walk through.
 * The leaves are only hidden once the camera is past the door plane (they are
 * behind the lens then), so nothing ever pops out of frame on any aspect.
 */

/* ════════════════════════════ door kit (shared) ═══════════════════════════ */

export type G = THREE.BufferGeometry;

/** Non-indexed + normals, so every part merges per material. */
export const ni = (g: G): G => {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  return n;
};
export function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, rotZ = 0, rotX = 0): G {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  if (rotZ) g.rotateZ(rotZ);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return ni(g);
}
export function rbox(w: number, h: number, d: number, r: number, x: number, y: number, z: number): G {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  g.translate(x, y, z);
  return ni(g);
}
/** Cylinder with its axis along `axis`. */
export function cyl(r: number, len: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y", seg = 14): G {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return ni(g);
}
/** Prism from an outline drawn in the door plane ([z, y] points), extruded
 *  toward +x (away from the camera) from `xFront`. */
export function prismZY(pts: [number, number][], depth: number, bevel: number, xFront: number): G {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  g.rotateY(Math.PI / 2); // shape (x, y, z) → world (z, y, −x)
  g.translate(xFront + bevel, 0, 0);
  return ni(g);
}
/** Half disc (ri = 0) or half annulus facing the camera (−x), flat edge on the
 *  seam at `z`; `s` picks the half (+1 → the +z half). Front face at `xFront`. */
export function halfRing(
  ro: number,
  ri: number,
  depth: number,
  bevel: number,
  s: 1 | -1,
  xFront: number,
  y: number,
  z: number,
): G {
  const sh = new THREE.Shape();
  // shape X maps to world −z after the rotation, so the +z half is X ≤ 0
  const a0 = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  const a1 = a0 + Math.PI;
  sh.absarc(0, 0, ro, a0, a1, false);
  if (ri > 0) sh.absarc(0, 0, ri, a1, a0, true);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 28,
  });
  g.rotateY(Math.PI / 2);
  g.translate(xFront + bevel, y, z);
  return ni(g);
}
/** Bake a flat vertex colour so differently-shaded paint parts share ONE draw
 *  call (the paint material uses vertexColors). */
export function tint(g: G, hex: string): G {
  const c = new THREE.Color(hex);
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
/** Box-projected UVs from position + normal: the wear texture keeps one
 *  texel density on every part instead of stretching per face. */
export function worldUV(g: G, scale = 1.3): G {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
/** Merge (disposing the parts) and box-project UVs. */
export function merge(gs: G[], uvScale = 1.3): G {
  if (!gs.length) return new THREE.BufferGeometry();
  // every part must carry the same attribute set
  const hasColor = gs.some((g) => g.getAttribute("color"));
  for (const g of gs) {
    if (hasColor && !g.getAttribute("color")) tint(g, "#ffffff");
    for (const k of Object.keys(g.attributes)) {
      if (k !== "position" && k !== "normal" && k !== "uv" && k !== "color") g.deleteAttribute(k);
    }
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
  }
  const m = mergeGeometries(gs, false);
  gs.forEach((g) => g.dispose());
  return m ? worldUV(m, uvScale) : new THREE.BufferGeometry();
}

/** Seeded speckle (identical every load). */
export function wear(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.6;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ── shared textures (module singletons: one upload for every door) ── */

let _surface: THREE.CanvasTexture | null = null;
/** 512² tiling wear map, LINEAR (no colour space): used both as `map` (a
 *  0.7–1.0 colour-variation multiplier) and `roughnessMap` (G channel). Vertical
 *  brushed streaks, soft grime blotches and pits. */
export function doorSurface(): THREE.CanvasTexture {
  if (_surface) return _surface;
  const N = 512;
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const ctx = c.getContext("2d")!;
  let s = 41;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = "rgb(226,226,226)";
  ctx.fillRect(0, 0, N, N);
  // brushed streaks (vertical; wrap in y)
  for (let i = 0; i < 1600; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const len = 30 + rnd() * 260;
    const lighter = rnd() < 0.45;
    ctx.fillStyle = lighter ? `rgba(255,255,255,${0.04 + rnd() * 0.07})` : `rgba(120,120,120,${0.04 + rnd() * 0.08})`;
    const w = 0.6 + rnd() * 1.6;
    ctx.fillRect(x, y, w, len);
    if (y + len > N) ctx.fillRect(x, y - N, w, len);
  }
  // soft grime blotches (wrap both axes)
  for (let i = 0; i < 34; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 18 + rnd() * 80;
    const a = 0.06 + rnd() * 0.12;
    for (const ox of [-N, 0, N]) {
      for (const oy of [-N, 0, N]) {
        const gr = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, `rgba(70,70,70,${a})`);
        gr.addColorStop(1, "rgba(70,70,70,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  // pits + chips
  for (let i = 0; i < 1100; i++) {
    const dark = rnd() < 0.7;
    ctx.fillStyle = dark ? `rgba(60,60,60,${0.2 + rnd() * 0.35})` : `rgba(255,255,255,${0.15 + rnd() * 0.2})`;
    ctx.beginPath();
    ctx.arc(rnd() * N, rnd() * N, 0.4 + rnd() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _surface = t;
  return t;
}

let _hazard: THREE.CanvasTexture | null = null;
/** 45° worn hazard stripes (dark ground), tiling. Clone + set repeat per use. */
export function hazardTexture(): THREE.CanvasTexture {
  if (_hazard) return _hazard;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#a8843f";
  for (let k = -128; k < 256; k += 64) {
    ctx.beginPath();
    ctx.moveTo(k, 128);
    ctx.lineTo(k + 32, 128);
    ctx.lineTo(k + 160, 0);
    ctx.lineTo(k + 128, 0);
    ctx.closePath();
    ctx.fill();
  }
  wear(ctx, 128, 128, 160, 3);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#15171d";
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _hazard = t;
  return t;
}

let _glow: THREE.CanvasTexture | null = null;
/** Soft vertical light blade (narrow core, long faded ends) for seam slits. */
export function slitTexture(): THREE.CanvasTexture {
  if (_glow) return _glow;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const v = y / 255;
    const fy = Math.min(1, v / 0.14, (1 - v) / 0.42);
    for (let x = 0; x < 64; x++) {
      const u = Math.abs(x / 63 - 0.5) * 2;
      const core = Math.exp(-u * u * 22) * 0.8 + Math.exp(-u * u * 4) * 0.2;
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, core) * fy * fy * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

/** Hazard decal material on a cloned stripe texture (`rx`,`ry` = repeats). */
export function hazardDecal(rx: number, ry: number, glow = 0.1): THREE.MeshStandardMaterial {
  const t = hazardTexture().clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return decalMat(t, glow, 0.7);
}
/** Painted marking: map + a whisper of emissive so it holds on every GPU tier. */
export function decalMat(map: THREE.Texture, glow: number, roughness = 0.62): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    emissive: "#ffffff",
    emissiveMap: map,
    emissiveIntensity: glow,
    transparent: true,
    depthWrite: false,
    roughness,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

/** Shader hook for door surfaces: vertical light falloff (brighter toward the
 *  lintel downlight, darker lower third), grime along the bottom 30 cm and a
 *  lighter worn-paint read on bevels/rounded edges. World-y based, so moving
 *  leaves keep the same light as the frame beside them. */
export function shadeDoor(m: THREE.MeshStandardMaterial, lo = 0.5, edge = 0.05, top = 2.5) {
  const key = `door:${lo}:${edge}:${top}`;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vDoorY;\nvarying vec3 vDoorN;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 doorP = vec4(transformed, 1.0);
        vec3 doorN = objectNormal;
        #ifdef USE_INSTANCING
          doorP = instanceMatrix * doorP;
          doorN = mat3(instanceMatrix) * doorN;
        #endif
        vDoorY = (modelMatrix * doorP).y;
        vDoorN = mat3(modelMatrix) * doorN;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vDoorY;\nvarying vec3 vDoorN;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float doorG = mix(${lo.toFixed(3)}, 1.0, smoothstep(0.1, ${top.toFixed(3)}, vDoorY));
        doorG *= 1.0 - 0.22 * (1.0 - smoothstep(0.02, 0.34, vDoorY));
        vec3 doorA = abs(normalize(vDoorN));
        float doorE = clamp(1.0 - max(doorA.x, max(doorA.y, doorA.z)), 0.0, 0.3);
        diffuseColor.rgb = diffuseColor.rgb * doorG + doorE * ${edge.toFixed(3)};`,
      );
  };
  m.customProgramCacheKey = () => key;
}

// paint shades (vertex colours)
export const C_FRAME = "#283043";
export const C_LEAF = "#2d3547";
export const C_PANEL = "#39435a";
export const C_RECESS = NEUTRAL.hullShadow;
export const C_TRIM = "#3b4559"; // chamfers: lighter satin paint, never mirror steel
export const C_FIELD = "#29303f"; // recessed panel fields (a step darker than the leaf)

export type DoorMats = {
  paint: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  hub: THREE.MeshStandardMaterial;
  tread: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
};
/** The door material family (call in useMemo). Paint is vertex-coloured. */
export function makeDoorMats(top = 2.5): DoorMats {
  const surf = doorSurface();
  const std = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ map: surf, roughnessMap: surf, ...o });
  const paint = std({ vertexColors: true, roughness: 0.7, metalness: 0.5 });
  // satin, never mirror: polished steel at grazing angles threw white glare
  // bands (bloom) across the phone frame
  const steel = std({ color: "#8a93a4", roughness: 0.5, metalness: 0.82 });
  const hub = std({ color: "#566175", roughness: 0.46, metalness: 0.8 });
  // dark ribbed tread — can never read as a light slab
  const tread = std({ color: "#2a303c", roughness: 0.85, metalness: 0.45 });
  const glass = new THREE.MeshStandardMaterial({
    color: "#0c1018",
    roughness: 0.08,
    metalness: 0.3,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  // lower falloff lifted (0.48 → 0.64): the lower leaf fields read as painted
  // steel in shadow, never as a black void (DESIGN_SYSTEM §2)
  shadeDoor(paint, 0.64, 0.07, top);
  shadeDoor(steel, 0.55, 0.0, top);
  shadeDoor(hub, 0.62, 0.04, top);
  shadeDoor(tread, 0.8, 0.0, top);
  return { paint, steel, hub, tread, glass };
}
/** Give the door family the studio env at its own strength. */
export function useDoorEnv(mats: DoorMats, k = 1) {
  const env = useStudioEnv();
  useEffect(() => {
    for (const [m, i] of [
      [mats.paint, 0.72],
      [mats.steel, 0.62],
      [mats.hub, 0.78],
      [mats.tread, 0.38],
      [mats.glass, 1.2],
    ] as const) {
      m.envMap = env;
      m.envMapIntensity = env ? i * k : 1;
      m.needsUpdate = true;
    }
  }, [env, mats, k]);
}

/* ── lock hub + leaves ── */

export type LeafSpec = {
  kind: "inner" | "outer";
  s: 1 | -1; // side: −1 = the −z leaf
  W: number; // leaf width (z)
  LT: number; // thickness
  y0: number;
  y1: number;
  gap: number; // seam slit
  kick: readonly [number, number];
  low: readonly [number, number];
  lock: readonly [number, number];
  up: readonly [number, number];
  hubY: number;
  hubR: number;
  /** seal-dog heights along the lower seam (inner leaves) */
  dogs: readonly number[];
};

const _m4 = new THREE.Matrix4();
const _vu = new THREE.Vector3();
const _vv = new THREE.Vector3(-1, 0, 0); // proud = toward the camera
const _vl = new THREE.Vector3();
/** Panel-frame bar: a trapezoid section (full depth `D` on its outer edge, a
 *  45° chamfer `c` on the inner edge that steps down to the recessed field),
 *  run `len` along `dirL` from `origin`; `dirU` points into the panel. */
function chamferBar(len: number, B: number, D: number, c: number, origin: THREE.Vector3, dirU: THREE.Vector3, dirL: THREE.Vector3): G {
  const sh = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(B, 0),
    new THREE.Vector2(B, D - c),
    new THREE.Vector2(B - c, D),
    new THREE.Vector2(0, D),
  ]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  _vu.copy(dirU);
  _vl.copy(dirL);
  const o = origin.clone();
  _m4.makeBasis(_vu, _vv, _vl);
  // keep the winding outward-facing (FrontSide materials)
  if (_m4.determinant() < 0) {
    _vl.negate();
    o.addScaledVector(dirL, len);
    _m4.makeBasis(_vu, _vv, _vl);
  }
  _m4.setPosition(o);
  g.applyMatrix4(_m4);
  return ni(g);
}

/** Leaf-local geometry (origin at the leaf's centre, face toward −x). */
export function buildLeaf(L: LeafSpec) {
  const { s, W, LT, y0, y1 } = L;
  const H = y1 - y0;
  const FACE = -LT / 2;
  const seam = -s * (W / 2);
  const out = s * (W / 2);
  const seamZ = seam - s * (L.gap / 2); // world z = 0 when closed
  const paint: G[] = [tint(box(LT, H, W, 0, y0 + H / 2, 0), C_LEAF)];
  const steel: G[] = [];
  const hub: G[] = [];
  const glass: G[] = [];
  const lamp: G[] = [];
  const bolt = (x: number, y: number, z: number, r = 0.013) => steel.push(cyl(r, 0.012, x, y, z, "x", 6));

  /** Inset panel: a chamfered frame (3 cm proud, 2.4 cm 45° step) around a
   *  darker field that sits back at the leaf face, with a dark gasket line in
   *  the step so every seam holds shadow. Returns the FIELD rect. */
  const PB = 0.056; // frame bar width
  const PD = 0.03; // frame depth
  const PC = 0.022; // chamfer leg
  const panelAt = (ya: number, yb: number, inSeam: number, inOut: number) => {
    const pw = W - inSeam - inOut;
    const pz = s * ((inSeam - inOut) / 2);
    const za = pz - pw / 2;
    const zb = pz + pw / 2;
    const ph = yb - ya;
    const o = new THREE.Vector3();
    const bar = (len: number, ox: number, oy: number, oz: number, u: [number, number, number], l: [number, number, number]) =>
      paint.push(tint(chamferBar(len, PB, PD, PC, o.set(ox, oy, oz), new THREE.Vector3(...u), new THREE.Vector3(...l)), C_PANEL));
    bar(pw, FACE, yb, za, [0, -1, 0], [0, 0, 1]); // top (points down into the panel)
    bar(pw, FACE, ya, za, [0, 1, 0], [0, 0, 1]); // bottom
    bar(ph - 2 * PB, FACE, ya + PB, za, [0, 0, 1], [0, 1, 0]); // −z side
    bar(ph - 2 * PB, FACE, ya + PB, zb, [0, 0, -1], [0, 1, 0]); // +z side
    // recessed field + a gasket (fake AO) line round its edge
    const fw = pw - 2 * PB;
    const fh = ph - 2 * PB;
    const fy = (ya + yb) / 2;
    paint.push(tint(box(0.004, fh, fw, FACE - 0.002, fy, pz), C_FIELD));
    const gk = 0.014;
    paint.push(tint(box(0.005, gk, fw, FACE - 0.003, yb - PB - gk / 2, pz), C_RECESS));
    paint.push(tint(box(0.005, gk, fw, FACE - 0.003, ya + PB + gk / 2, pz), C_RECESS));
    paint.push(tint(box(0.005, fh, gk, FACE - 0.003, fy, za + PB + gk / 2), C_RECESS));
    paint.push(tint(box(0.005, fh, gk, FACE - 0.003, fy, zb - PB - gk / 2), C_RECESS));
    // hex fasteners on the frame corners
    for (const y of [ya + PB / 2, yb - PB / 2]) {
      for (const z of [za + PB / 2, zb - PB / 2]) bolt(FACE - PD - 0.004, y, z);
    }
    return { pz, pw: fw, fy, fh };
  };
  /** Horizontal structural rib across the leaf (proud, rounded). */
  const rib = (y: number, h = 0.05) => steel.push(rbox(0.036, h, W - 0.03, 0.012, FACE - 0.016, y, 0));

  // kick plate: steel tread band + (decal hazard added by the caller)
  steel.push(rbox(0.02, L.kick[1] - L.kick[0], W - 0.05, 0.006, FACE - 0.01, (L.kick[0] + L.kick[1]) / 2, 0));
  // outer machined edge cap
  steel.push(rbox(LT + 0.012, H, 0.03, 0.01, 0, y0 + H / 2, out - s * 0.015));
  // structural rib between the kick plate and the lower panel
  rib((L.kick[1] + L.low[0]) / 2, 0.04);

  let fields: { upper: ReturnType<typeof panelAt> } | null = null;
  if (L.kind === "inner") {
    panelAt(L.low[0], L.low[1], 0.07, 0.08);
    const upper = panelAt(L.up[0], L.up[1], 0.07, 0.08);
    fields = { upper };
    // lock band: recessed channel between two structural ribs
    paint.push(tint(box(0.01, L.lock[1] - L.lock[0], W - 0.04, FACE - 0.004, (L.lock[0] + L.lock[1]) / 2, 0), C_RECESS));
    rib(L.lock[0] - 0.02, 0.04);
    rib(L.lock[1] + 0.02, 0.04);
    // seam edge: proud machined cap + a dark gasket strip
    steel.push(rbox(LT + 0.026, H, 0.036, 0.012, 0, y0 + H / 2, seam + s * 0.018));
    paint.push(tint(box(LT + 0.03, H - 0.02, 0.008, 0, y0 + H / 2, seam + s * 0.002), C_RECESS));
    // rubber seal lip reaching the closed centreline (world z = 0): the two
    // lips meet, so a SEALED door shows no hall light through the seam; the
    // 6 mm crack on release is what first lets light in
    {
      const a = seam + s * 0.006;
      const b = seamZ - s * 0.0015;
      paint.push(tint(box(LT * 0.5, H - 0.03, Math.abs(a - b), 0, y0 + H / 2, (a + b) / 2), C_RECESS));
    }

    // seal dogs: SYMMETRIC clamp pairs — each leaf owns one half of every
    // dog, the two chamfered jaws meet on the seam and pull apart with the
    // leaves. Hinge knuckle on the outer end, two hex bolts, a dark pad
    // under each jaw for contact shadow.
    for (const y of L.dogs) {
      const zS = seamZ + s * 0.004; // jaw nose at the seam
      const zO = seamZ + s * 0.13; // jaw heel
      paint.push(
        tint(
          prismZY(
            [
              [zS - s * 0.002, y - 0.085],
              [zS - s * 0.002, y + 0.085],
              [zO + s * 0.03, y + 0.085],
              [zO + s * 0.03, y - 0.085],
            ],
            0.004,
            0,
            FACE - 0.004,
          ),
          C_RECESS,
        ),
      );
      hub.push(
        prismZY(
          [
            [zS, y - 0.05],
            [zS, y + 0.05],
            [zS + s * 0.035, y + 0.07],
            [zO, y + 0.07],
            [zO, y - 0.07],
            [zS + s * 0.035, y - 0.07],
          ],
          0.028,
          0.006,
          FACE - 0.044,
        ),
      );
      hub.push(cyl(0.022, 0.15, FACE - 0.03, y, zO + s * 0.012, "y", 14)); // hinge knuckle
      steel.push(cyl(0.009, 0.19, FACE - 0.03, y, zO + s * 0.012, "y", 8)); // hinge pin
      for (const dy of [-0.034, 0.034]) bolt(FACE - 0.048, y + dy, seamZ + s * 0.08, 0.011);
    }

    // split lock hub — layered, front to back:
    //   chrome outer bezel (engraved ticks) · tinted glass lens over a sunk
    //   lamp channel (the status ring) · chrome inner bezel with 4 dog
    //   sockets per half · dark field · wedge dogs (instanced) · centre boss
    const R = L.hubR;
    const hy = L.hubY;
    hub.push(halfRing(R * 1.06, 0, 0.018, 0.006, s, FACE - 0.024, hy, seamZ)); // mounting flange
    steel.push(halfRing(R, R * 0.8, 0.044, 0.01, s, FACE - 0.08, hy, seamZ)); // outer bezel
    paint.push(tint(halfRing(R * 0.8, R * 0.64, 0.008, 0, s, FACE - 0.034, hy, seamZ), C_RECESS)); // channel floor
    const t = new THREE.TorusGeometry(R * 0.72, 0.017, 10, 40, Math.PI);
    t.rotateZ((s * Math.PI) / 2);
    t.rotateY(Math.PI / 2);
    t.translate(FACE - 0.048, hy, seamZ);
    lamp.push(ni(t));
    glass.push(halfRing(R * 0.8, R * 0.64, 0.004, 0, s, FACE - 0.074, hy, seamZ)); // lens
    steel.push(halfRing(R * 0.64, R * 0.56, 0.044, 0.008, s, FACE - 0.08, hy, seamZ)); // inner bezel
    // hub face: a plate (leaf paint, not a black void) — the wedges read as
    // bolts on a face instead of spokes over a hole
    paint.push(tint(halfRing(R * 0.56, 0, 0.008, 0, s, FACE - 0.03, hy, seamZ), C_LEAF));
    paint.push(tint(halfRing(R * 0.33, R * 0.3, 0.004, 0, s, FACE - 0.0385, hy, seamZ), C_RECESS)); // engraved ring
    // engraved ticks on the outer bezel face
    for (let k = 0; k < 12; k++) {
      const th = s * ((7.5 + 15 * k) * Math.PI) / 180;
      const r = R * 0.9;
      paint.push(tint(box(0.004, k % 3 === 1 ? 0.05 : 0.028, 0.008, FACE - 0.0825, hy + r * Math.cos(th), seamZ + r * Math.sin(th), 0, 0, th), C_RECESS));
    }
    // dog sockets cut into the inner bezel (dark slots the wedges key into)
    for (let k = 0; k < 4; k++) {
      const th = s * ((22.5 + 45 * k) * Math.PI) / 180;
      const r = R * 0.6;
      paint.push(tint(box(0.004, R * 0.12, R * 0.17, FACE - 0.0825, hy + r * Math.cos(th), seamZ + r * Math.sin(th), 0, 0, th), C_RECESS));
    }
    hub.push(halfRing(R * 0.24, 0, 0.05, 0.012, s, FACE - 0.112, hy, seamZ)); // boss
    steel.push(halfRing(R * 0.1, 0, 0.01, 0.004, s, FACE - 0.12, hy, seamZ)); // boss cap
  } else {
    const lp = panelAt(L.low[0], L.low[1], 0.17, 0.07);
    const up = panelAt(L.lock[0], L.up[1], 0.17, 0.07);
    rib((L.low[1] + L.lock[0]) / 2, 0.05);
    // vent louvres set into the lower field
    const vz = lp.pz + s * 0.02;
    const vw = Math.min(0.4, lp.pw - 0.12);
    const vy0 = L.low[0] + 0.16;
    const vy1 = vy0 + 0.34;
    paint.push(tint(box(0.006, vy1 - vy0, vw, FACE - 0.004, (vy0 + vy1) / 2, vz), C_RECESS));
    steel.push(rbox(0.02, vy1 - vy0 + 0.04, 0.02, 0.006, FACE - 0.012, (vy0 + vy1) / 2, vz - vw / 2 - 0.01));
    steel.push(rbox(0.02, vy1 - vy0 + 0.04, 0.02, 0.006, FACE - 0.012, (vy0 + vy1) / 2, vz + vw / 2 + 0.01));
    for (let y = vy0 + 0.03; y < vy1 - 0.01; y += 0.052) {
      steel.push(box(0.026, 0.006, vw, FACE - 0.016, y, vz, 0, -0.6));
    }
    // viewport slit in the upper field: steel bezel round a dark glass slot
    const sz = up.pz - s * 0.05;
    const sy0 = L.lock[0] + 0.5;
    const sy1 = sy0 + 0.42;
    const sw = 0.06;
    steel.push(rbox(0.026, sy1 - sy0 + 0.05, 0.024, 0.008, FACE - 0.013, (sy0 + sy1) / 2, sz - sw / 2 - 0.012));
    steel.push(rbox(0.026, sy1 - sy0 + 0.05, 0.024, 0.008, FACE - 0.013, (sy0 + sy1) / 2, sz + sw / 2 + 0.012));
    steel.push(rbox(0.026, 0.024, sw + 0.048, 0.008, FACE - 0.013, sy1 + 0.013, sz));
    steel.push(rbox(0.026, 0.024, sw + 0.048, 0.008, FACE - 0.013, sy0 - 0.013, sz));
    paint.push(tint(box(0.004, sy1 - sy0, sw, FACE - 0.003, (sy0 + sy1) / 2, sz), C_RECESS));
    glass.push(box(0.004, sy1 - sy0, sw, FACE - 0.012, (sy0 + sy1) / 2, sz));
    // actuator housing near the pocket edge: cylinder, polished rod, clevises
    const az = out - s * 0.16;
    const ax = FACE - 0.05;
    hub.push(cyl(0.042, 0.62, ax, L.low[0] + 0.38, az));
    steel.push(cyl(0.017, 0.3, ax, L.low[0] + 0.84, az));
    hub.push(rbox(0.06, 0.05, 0.1, 0.012, ax + 0.012, L.low[0] + 0.05, az));
    hub.push(rbox(0.06, 0.05, 0.1, 0.012, ax + 0.012, L.low[0] + 1.0, az));
    // grab rail on stand-offs
    const gz = out - s * 0.2;
    const gy0 = L.lock[0] + 0.15;
    const gy1 = Math.min(L.up[1] - 0.2, gy0 + 0.95);
    steel.push(rbox(0.04, gy1 - gy0, 0.045, 0.018, FACE - 0.085, (gy0 + gy1) / 2, gz));
    steel.push(box(0.06, 0.045, 0.03, FACE - 0.045, gy0 + 0.06, gz));
    steel.push(box(0.06, 0.045, 0.03, FACE - 0.045, gy1 - 0.06, gz));
  }
  return {
    paint: merge(paint),
    steel: merge(steel),
    hub: hub.length ? merge(hub) : null,
    glass: glass.length ? merge(glass) : null,
    lamp: lamp.length ? merge(lamp) : null,
    seamZ,
    FACE,
    /** inner leaves: the upper field (stencil goes here) */
    upper: fields?.upper ?? null,
  };
}
export type LeafGeo = ReturnType<typeof buildLeaf>;
export const disposeLeaf = (l: LeafGeo) =>
  [l.paint, l.steel, l.hub, l.glass, l.lamp].forEach((g) => g?.dispose());

/** Wedge dog (4 per hub half, instanced): a chunky bolt with a chamfered
 *  nose, long axis on local +y (the nose). */
export function dogGeometry(R: number): G {
  const Lh = (R * 0.26) / 2;
  const w = R * 0.19;
  return prismZY(
    [
      [-w / 2, -Lh],
      [w / 2, -Lh],
      [w / 2, Lh - w * 0.4],
      [w * 0.22, Lh],
      [-w * 0.22, Lh],
      [-w / 2, Lh - w * 0.4],
    ],
    0.026,
    0.005,
    -0.018,
  );
}
const _dummy = new THREE.Object3D();
/** Engaged (u = 0): noses keyed into the inner-bezel sockets. Released
 *  (u = 1): the wedges slide inward under the boss. */
export function placeDogs(m: THREE.InstancedMesh, s: 1 | -1, FACE: number, hubY: number, seamZ: number, R: number, u: number) {
  const r = R * (0.51 - 0.17 * u); // centre radius
  for (let k = 0; k < 4; k++) {
    const th = s * ((22.5 + 45 * k) * Math.PI) / 180;
    _dummy.position.set(FACE - 0.06, hubY + r * Math.cos(th), seamZ + r * Math.sin(th));
    _dummy.rotation.set(th, 0, 0);
    _dummy.updateMatrix();
    m.setMatrixAt(k, _dummy.matrix);
  }
  m.instanceMatrix.needsUpdate = true;
}

export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Quintic smootherstep — heavy mass: zero velocity AND acceleration at both ends. */
export const smoother = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/* ════════════════════════════ the airlock ═════════════════════════════════ */

/** At START_X + 2.6 the escort drone (which idles at cameraXAt(0.035)) waits
 *  BEHIND the closed leaves and is revealed by the opening. */
const DOOR_X = START_X + 2.6;

// ── collar: a heavy, narrow pressure portal ────────────────────────────────
const O = 1.65; // clear opening half-width — the jambs read at the p=0 frame edges
const JAMB_OUT = HALF_W + 0.15;
const FRONT = -0.5;
const BACK = 0.5;
const CH = 0.12;
const TOP = 2.7;
const SILL = 0.08;

// ── leaves ──
const LT = 0.16;
const GAP = 0.024;
// Layer stack (collar-local x, camera at −x). The seam leaf's proud parts
// (hub + dogs, 0.125 ahead of its face) must stay behind the pocket-mouth
// plane x = FRONT + CH, or they poke through the jamb when parked; the outer
// leaf sits 0.12 behind the seam leaf so its actuators/rails clear it.
const IX = FRONT + CH + 0.125 + LT / 2; // seam leaves (front layer)
const OX = IX + LT + 0.12; // outer leaves (rear layer)
const IW = 0.9;
const OW = 0.88;
const I_Z = GAP / 2 + IW / 2;
const O_Z = 0.8 + OW / 2; // 0.11 overlap behind the seam leaf
const I_TRAVEL = O + 0.03 + IW / 2 - I_Z; // parked just inside the pocket reveal
const O_TRAVEL = 0.9;
const LY0 = SILL;
const LY1 = TOP + 0.06; // tucks behind the lintel step

const BANDS = {
  kick: [0.1, 0.34] as const,
  low: [0.4, 1.12] as const,
  lock: [1.2, 1.96] as const,
  up: [2.02, 2.66] as const,
};
const HUB_Y = 1.58;
const HUB_R = 0.35;
const DOGS = [0.52, 0.8, 1.06] as const;

// ── camera-playhead choreography ──
// [unlockA, unlockB, partA, partB]. Mobile starts later: the hero card fades
// IN PLACE there (desktop slides it off), so the leaves wait until it has
// mostly cleared instead of parting under a ghosted card.
const TIMING = {
  desktop: [0.0012, 0.008, 0.0085, 0.03],
  mobile: [0.002, 0.012, 0.014, 0.036],
} as const;

// status ring colours (reused temps — zero allocations in useFrame).
// SEALED red is the warning light (just over trim); CYCLING amber and
// EQUALISED teal stay at trim strength (under the bloom threshold) — a calm
// ship status colour, never a neon "go" green.
export const STATUS = { sealed: "#ff4a3d", cycling: "#ffa640", open: "#4fd1bd" } as const;
// sealed red sits at TRIM level, eased a touch warm: a status light, not the
// loudest object on the p=0 hero
const _red = new THREE.Color(STATUS.sealed).lerp(new THREE.Color(WARM), 0.12).multiplyScalar(GLOW.trim * 1.1);
const _amber = new THREE.Color(STATUS.cycling).multiplyScalar(GLOW.trim * 1.05);
const _green = new THREE.Color(STATUS.open).multiplyScalar(GLOW.trim);
const _ring = new THREE.Color();

/** Big leaf stencil: the PORT ID "A-01", split at the seam between "-" and
 *  "0" (never mid-word); each half carries its own small line. */
function drawStencil(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const W = c.width;
  const H = c.height;
  const mono = familyVar("--ff-mono", "ui-monospace, monospace");
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(236,232,222,0.96)";
  // each half is centred on its own leaf's recessed field
  let size = 200;
  ctx.font = `700 ${size}px ${mono}`;
  size *= (W * 0.5 * 0.78) / Math.max(1, ctx.measureText("01").width);
  size = Math.min(size, H * 0.74);
  ctx.font = `700 ${size}px ${mono}`;
  ctx.textAlign = "center";
  ctx.fillText("A-", W / 4, H * 0.7);
  ctx.fillText("01", (3 * W) / 4, H * 0.7);
  ctx.font = `600 ${Math.round(H * 0.075)}px ${mono}`;
  ctx.fillStyle = "rgba(232,228,218,0.56)";
  ctx.textAlign = "center";
  ctx.fillText("OUTER DOOR", W / 4, H * 0.9);
  ctx.fillText("DOCKING PORT A", (3 * W) / 4, H * 0.9);
  wear(ctx, W, H, 1100, 7);
}

/** 512×768 atlas of the small plates (128 px rows). */
function drawLabels(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const mono = familyVar("--ff-mono", "ui-monospace, monospace");
  ctx.clearRect(0, 0, 512, 768);
  const plate = (y0: number, stroke = "rgba(236,232,222,0.28)") => {
    ctx.fillStyle = "rgba(10,12,18,0.8)";
    ctx.fillRect(4, y0 + 4, 504, 120);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.strokeRect(6, y0 + 6, 500, 116);
  };
  ctx.textBaseline = "middle";
  // [0] readout
  plate(0);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(236,232,222,0.9)";
  ctx.font = `700 40px ${mono}`;
  ctx.fillText("A-01  OUTER", 26, 42);
  ctx.fillStyle = "rgba(236,232,222,0.6)";
  ctx.font = `500 30px ${mono}`;
  ctx.fillText("Δp 0.0 kPa · EQUAL", 26, 90);
  // [1] aside
  plate(128);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,196,110,0.92)";
  ctx.font = `700 40px ${mono}`;
  ctx.fillText("MIND THE DRONE", 486, 170);
  ctx.fillStyle = "rgba(236,232,222,0.6)";
  ctx.font = `500 30px ${mono}`;
  ctx.fillText("SCROLL TO CYCLE", 486, 218);
  // [2] / [3] outer-leaf marks (arrows point the way each leaf retracts)
  for (const [y0, dir] of [
    [256, -1],
    [384, 1],
  ] as const) {
    ctx.fillStyle = "rgba(236,232,222,0.72)";
    ctx.font = `700 42px ${mono}`;
    ctx.textAlign = dir < 0 ? "right" : "left";
    ctx.fillText(dir < 0 ? "A-01 · L" : "A-01 · R", dir < 0 ? 488 : 24, y0 + 40);
    ctx.fillStyle = "rgba(255,196,110,0.82)";
    for (let i = 0; i < 3; i++) {
      const cx = dir < 0 ? 80 + i * 44 : 432 - i * 44;
      const cy = y0 + 96;
      ctx.beginPath();
      ctx.moveTo(cx - dir * 16, cy - 18);
      ctx.lineTo(cx + dir * 6, cy);
      ctx.lineTo(cx - dir * 16, cy + 18);
      ctx.lineTo(cx - dir * 4, cy + 18);
      ctx.lineTo(cx + dir * 18, cy);
      ctx.lineTo(cx - dir * 4, cy - 18);
      ctx.closePath();
      ctx.fill();
    }
  }
  // [4] lintel ident — the only place the ship name repeats on the door
  plate(512);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(236,232,222,0.9)";
  ctx.font = `700 40px ${mono}`;
  ctx.fillText("KIRKHAM·01", 256, 556);
  ctx.fillStyle = "rgba(236,232,222,0.52)";
  ctx.font = `500 24px ${mono}`;
  ctx.fillText("AIRLOCK A-01 · DECK 01", 256, 600);
  // [5] keep-clear plate
  plate(640, "rgba(214,168,80,0.85)");
  ctx.fillStyle = "rgba(236,232,222,0.62)";
  ctx.font = `600 26px ${mono}`;
  ctx.fillText("PRESSURE BULKHEAD", 256, 680);
  ctx.fillStyle = "rgba(255,196,110,0.92)";
  ctx.font = `700 40px ${mono}`;
  ctx.fillText("KEEP CLEAR", 256, 724);
  wear(ctx, 512, 768, 700, 19);
}

type View = readonly [u0: number, v0: number, u1: number, v1: number];

/** One canvas, painted synchronously and repainted after webfonts land.
 *  Returns one texture per UV view sharing a single Source. */
function usePaintedViews(w: number, h: number, draw: (c: HTMLCanvasElement) => void, views: View[]) {
  const texs = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    draw(c);
    const base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    base.anisotropy = 8;
    return views.map(([u0, v0, u1, v1]) => {
      const t = base.clone();
      t.offset.set(u0, v0);
      t.repeat.set(u1 - u0, v1 - v0);
      t.needsUpdate = true;
      return t;
    });
    // views are module constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, draw]);
  useEffect(() => {
    let cancelled = false;
    if ("fonts" in document) {
      document.fonts.ready
        .then(() => {
          if (cancelled) return;
          draw(texs[0].image as HTMLCanvasElement);
          texs.forEach((t) => (t.needsUpdate = true));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [texs, draw]);
  useEffect(() => () => texs.forEach((t) => t.dispose()), [texs]);
  return texs;
}

const STENCIL_VIEWS: View[] = [
  [0, 0, 0.5, 1],
  [0.5, 0, 1, 1],
];
const R6 = 1 / 6;
const LABEL_VIEWS: View[] = [
  [0, 1 - R6, 1, 1], // readout
  [0, 1 - 2 * R6, 1, 1 - R6], // aside
  [0, 1 - 3 * R6, 1, 1 - 2 * R6], // mark L
  [0, 1 - 4 * R6, 1, 1 - 3 * R6], // mark R
  [0, 1 - 5 * R6, 1, 1 - 4 * R6], // ident
  [0, 0, 1, R6], // keep clear
];

let _halo: THREE.CanvasTexture | null = null;
function haloTexture() {
  if (_halo) return _halo;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,0.0)");
  g.addColorStop(0.28, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _halo = new THREE.CanvasTexture(c);
  return _halo;
}

export default function Airlock() {
  const reduced = useReducedMotion();
  const mobile = useIsMobile();

  const innerL = useRef<THREE.Group>(null);
  const innerR = useRef<THREE.Group>(null);
  const outerL = useRef<THREE.Group>(null);
  const outerR = useRef<THREE.Group>(null);
  const dogsL = useRef<THREE.InstancedMesh>(null);
  const dogsR = useRef<THREE.InstancedMesh>(null);
  const blade = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const lastU = useRef(-1);

  const stencil = usePaintedViews(1024, 384, drawStencil, STENCIL_VIEWS);
  const labels = usePaintedViews(512, 768, drawLabels, LABEL_VIEWS);

  /* ── materials ── */
  const mats = useMemo(() => makeDoorMats(2.5), []);
  useDoorEnv(mats);
  const fx = useMemo(() => {
    // pale steel-blue, kept under the bloom threshold: a lit edge, never a
    // white bar (at the phone's steep angle these read as glare bands)
    const rim = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#a9bddf").multiplyScalar(GLOW.trim * 0.85),
      toneMapped: false,
    });
    const downlight = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#c9d6ee").multiplyScalar(GLOW.trim * 0.5),
      toneMapped: false,
    });
    const ring = new THREE.MeshBasicMaterial({ color: _red.clone(), toneMapped: false });
    const halo = new THREE.MeshBasicMaterial({
      map: haloTexture(),
      color: _red.clone(),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    // warm light through the crack (WARM, the ship's practical hue) — it
    // exists only while the seal is releasing; a sealed door leaks nothing
    const blade = new THREE.MeshBasicMaterial({
      map: slitTexture(),
      color: new THREE.Color(WARM).multiplyScalar(0.9),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { rim, downlight, ring, halo, blade };
  }, []);

  const decals = useMemo(
    () => ({
      stencilL: decalMat(stencil[0], 0.4),
      stencilR: decalMat(stencil[1], 0.4),
      readout: decalMat(labels[0], 0.34),
      aside: decalMat(labels[1], 0.34),
      markL: decalMat(labels[2], 0.28),
      markR: decalMat(labels[3], 0.28),
      ident: decalMat(labels[4], 0.38),
      keep: decalMat(labels[5], 0.3),
      // repeats keep each 45° stripe tile square on its plane
      kick: hazardDecal((IW - 0.08) / 0.24, 1),
      kickO: hazardDecal((OW - 0.08) / 0.24, 1),
      jamb: hazardDecal(1, (TOP - 0.1) / 0.17),
    }),
    [stencil, labels],
  );

  /* ── static collar ── */
  const collar = useMemo(() => {
    const paint: G[] = [];
    const steel: G[] = [];
    const rim: G[] = [];
    const tread: G[] = [];
    const DIAG = CH * Math.SQRT2;
    const stepX = (FRONT + CH + BACK) / 2;
    for (const s of [-1, 1] as const) {
      const outerW = JAMB_OUT - (O + CH);
      paint.push(tint(box(BACK - FRONT, WALL_H, outerW, 0, WALL_H / 2, s * (O + CH + outerW / 2)), C_FRAME));
      paint.push(tint(box(BACK - FRONT - CH, TOP + CH, CH, stepX, (TOP + CH) / 2, s * (O + CH / 2)), C_FRAME));
      // 45° chamfer plate + the rim light set into it
      const cx = FRONT + CH / 2 + 0.006;
      const cz = s * (O + CH / 2 + 0.006);
      paint.push(tint(box(DIAG, TOP, 0.02, cx, TOP / 2, cz, s * (Math.PI / 4)), C_TRIM));
      // lamp segments set into a dark channel down the chamfer — short lit
      // blocks, not one continuous outline boxing the portal
      paint.push(tint(box(0.05, TOP - 0.2, 0.008, cx - 0.008, TOP / 2 - 0.02, cz - s * 0.008, s * (Math.PI / 4)), C_RECESS));
      for (let y = 0.32; y + 0.26 <= TOP - 0.2; y += 0.46) {
        rim.push(box(0.026, 0.26, 0.01, cx - 0.011, y + 0.13, cz - s * 0.011, s * (Math.PI / 4)));
      }
      // steel reveal lining the pocket mouth the leaves slide into
      paint.push(tint(box(BACK - FRONT - CH - 0.1, TOP, 0.02, stepX + 0.05, TOP / 2, s * (O + 0.004)), C_RECESS));
      // jamb face: hazard band (decal) beside the chamfer, then a recessed
      // service channel with a pressure-gauge column and twin conduits
      const chZ = s * (O + CH + 0.62);
      paint.push(tint(rbox(0.02, 2.3, 0.4, 0.008, FRONT - 0.006, 1.4, chZ), C_RECESS));
      for (const y of [0.5, 0.95, 1.4, 1.85, 2.3]) {
        steel.push(rbox(0.04, 0.3, 0.24, 0.012, FRONT - 0.02, y, chZ));
        paint.push(tint(cyl(0.05, 0.012, FRONT - 0.044, y + 0.04, chZ, "x", 18), C_RECESS));
      }
      for (const dz of [0.3, 0.38]) {
        const z = s * (O + CH + 0.62 + dz);
        steel.push(cyl(0.022, WALL_H - 0.3, FRONT - 0.03, WALL_H / 2, z, "y", 10));
        for (const y of [0.6, 1.6, 2.6, 3.4]) steel.push(box(0.05, 0.04, 0.05, FRONT - 0.02, y, z));
      }
      // kick guard + lintel corner gusset
      steel.push(box(0.03, 0.18, outerW - 0.05, FRONT - 0.012, 0.09, s * (O + CH + outerW / 2)));
      steel.push(box(0.03, 0.3, 0.3, FRONT - 0.012, TOP + CH + 0.26, s * (O + CH + 0.26)));
    }
    paint.push(tint(box(BACK - FRONT, WALL_H - TOP - CH, 2 * JAMB_OUT, 0, (TOP + CH + WALL_H) / 2, 0), C_FRAME));
    paint.push(tint(box(BACK - FRONT - CH, CH, 2 * (O + CH), stepX, TOP + CH / 2, 0), C_FRAME));
    // lintel chamfer in dark recess paint, no rim line: at p=0 its lower
    // edge lands on the HUD header row, so it must never read as a bright bar
    paint.push(tint(box(DIAG, 0.02, 2 * O, FRONT + CH / 2 + 0.006, TOP + CH / 2 + 0.006, 0, 0, -Math.PI / 4), C_RECESS));
    // downlight lip on the lintel face (the practical that motivates the
    // brighter upper door) — emitter strip on its underside
    paint.push(tint(rbox(0.12, 0.07, 2 * O + 0.1, 0.014, FRONT - 0.06, TOP + CH + 0.035, 0), C_RECESS));
    // ribbed tread sill (dark, rough — never a light slab) + a seal lip
    tread.push(box(BACK - FRONT, SILL, 2 * O, 0, SILL / 2, 0));
    for (let i = 0; i < 7; i++) {
      tread.push(rbox(0.05, 0.014, 2 * O - 0.08, 0.006, FRONT + 0.1 + i * 0.12, SILL + 0.005, 0));
    }
    tread.push(rbox(0.05, 0.03, 2 * O - 0.02, 0.012, IX - LT / 2 - 0.05, SILL + 0.012, 0));
    return { paint: merge(paint), steel: merge(steel), rim: merge(rim), tread: merge(tread) };
  }, []);

  /* ── leaves ── */
  const leaves = useMemo(() => {
    const spec = (kind: "inner" | "outer", s: 1 | -1): LeafSpec => ({
      kind,
      s,
      W: kind === "inner" ? IW : OW,
      LT,
      y0: LY0,
      y1: LY1,
      gap: GAP,
      ...BANDS,
      hubY: HUB_Y,
      hubR: HUB_R,
      dogs: DOGS,
    });
    return {
      il: buildLeaf(spec("inner", -1)),
      ir: buildLeaf(spec("inner", 1)),
      ol: buildLeaf(spec("outer", -1)),
      or: buildLeaf(spec("outer", 1)),
    };
  }, []);
  const dogGeo = useMemo(() => dogGeometry(HUB_R), []);

  useEffect(
    () => () => {
      Object.values(collar).forEach((g) => g.dispose());
      Object.values(leaves).forEach(disposeLeaf);
      dogGeo.dispose();
      // Geometry only. Materials are NOT disposed here: under dev StrictMode
      // this cleanup runs while the memoised materials stay in use, and a
      // material disposed mid-compileAsync (CompileReveal/Warmup) crashes
      // three's readiness poll. The door lives for the page's lifetime.
    },
    [collar, leaves, dogGeo],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    if (!reduced) t.current += dt;
    const p = scrollRefs.cameraProgress;

    const [UNLOCK_A, UNLOCK_B, PART_A, PART_B] = mobile ? TIMING.mobile : TIMING.desktop;
    const u = smoothstep(UNLOCK_A, UNLOCK_B, p); // seals
    const e = smoother((p - PART_A) / (PART_B - PART_A)); // leaves
    const crack = 0.006 * u;

    // hidden only once the lens is past the door plane (they are behind it)
    const show = state.camera.position.x < DOOR_X + 0.9;
    const zi = I_Z + crack + I_TRAVEL * e;
    const zo = O_Z + crack + O_TRAVEL * e;
    const set = (g: THREE.Group | null, z: number) => {
      if (!g) return;
      g.position.z = z;
      g.visible = show;
    };
    set(innerL.current, -zi);
    set(innerR.current, zi);
    set(outerL.current, -zo);
    set(outerR.current, zo);

    // wedge dogs slide in out of their sockets as the seal releases
    // (matrices only on change)
    if (u !== lastU.current) {
      lastU.current = u;
      if (dogsL.current) placeDogs(dogsL.current, -1, leaves.il.FACE, HUB_Y, leaves.il.seamZ, HUB_R, u);
      if (dogsR.current) placeDogs(dogsR.current, 1, leaves.ir.FACE, HUB_Y, leaves.ir.seamZ, HUB_R, u);
    }

    // status lamp: red → amber → teal, scroll-mapped (never time-switched).
    // Idle breath while sealed: 7 s cycle, ±6 % — calm, well under the rules.
    // amber → teal crossfades through a dim beat (a straight RGB lerp of the
    // two passes through a muddy olive)
    if (u < 0.5) _ring.copy(_red).lerp(_amber, u * 2);
    else {
      const k = (u - 0.5) * 2;
      _ring.copy(_amber).lerp(_green, k).multiplyScalar(1 - 0.65 * Math.sin(Math.PI * k));
    }
    const breath = reduced ? 1 : 1 + 0.06 * (1 - u) * Math.sin((t.current * Math.PI * 2) / 7);
    fx.ring.color.copy(_ring).multiplyScalar(breath);
    fx.halo.color.copy(_ring);
    fx.halo.opacity = 0.2 * (1 - smoothstep(0, 0.1, e));
    if (halo.current) halo.current.visible = e < 0.1;

    // light through the crack: ZERO while sealed (a sealed pressure door
    // leaks nothing), rises only as the seals release and the leaves crack,
    // then fades as the gap opens onto the lit hall — a warm glow, never a
    // cold white bar
    const gapW = GAP + 2 * (crack + I_TRAVEL * e);
    const bladeK = 0.42 * u * (1 - smoothstep(0.05, 0.6, gapW));
    if (blade.current) {
      blade.current.scale.x = gapW + 0.06;
      blade.current.visible = bladeK > 0.002;
    }
    fx.blade.opacity = bladeK;
  });

  const leafMeshes = (b: LeafGeo) => (
    <>
      <mesh geometry={b.paint} material={mats.paint} />
      <mesh geometry={b.steel} material={mats.steel} />
      {b.hub && <mesh geometry={b.hub} material={mats.hub} />}
      {b.lamp && <mesh geometry={b.lamp} material={fx.ring} />}
      {b.glass && <mesh geometry={b.glass} material={mats.glass} renderOrder={2} />}
    </>
  );
  const F = -LT / 2; // leaf-local face
  // stencil halves centred on each seam leaf's recessed upper field
  const stL = leaves.il.upper!;
  const stR = leaves.ir.upper!;
  const SH = (stL.pw * 384) / 512;

  return (
    <group position={[DOOR_X, 0, 0]}>
      {/* ── bulkhead collar ── */}
      <mesh geometry={collar.paint} material={mats.paint} />
      <mesh geometry={collar.steel} material={mats.steel} />
      <mesh geometry={collar.tread} material={mats.tread} />
      <mesh geometry={collar.rim} material={fx.rim} />
      {/* downlight strip + ident plate: desktop only — at the phone's taller
          frame the lintel sits under the header row, where a lit strip reads
          as a glare bar and the plate collides with the badge/menu (and
          repeats the header brand) */}
      {!mobile && (
        <>
          <mesh position={[FRONT - 0.06, TOP + CH - 0.002, 0]} rotation-x={Math.PI / 2} material={fx.downlight}>
            <planeGeometry args={[0.018, 2 * O - 0.1]} />
          </mesh>
          <mesh position={[FRONT - 0.004, TOP + CH + 0.5, 0]} rotation-y={-Math.PI / 2} material={decals.ident}>
            <planeGeometry args={[1.3, 0.325]} />
          </mesh>
        </>
      )}
      {/* hazard bands on the jamb faces beside the chamfer */}
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[FRONT - 0.003, TOP / 2 + 0.05, s * (O + CH + 0.11)]} rotation-y={-Math.PI / 2} material={decals.jamb}>
          <planeGeometry args={[0.17, TOP - 0.1]} />
        </mesh>
      ))}

      {/* light behind the seam slit */}
      <mesh ref={blade} position={[(IX + OX) / 2, LY0 + (LY1 - LY0) / 2, 0]} rotation-y={-Math.PI / 2} material={fx.blade}>
        <planeGeometry args={[1, LY1 - LY0 - 0.08]} />
      </mesh>
      {/* the lamp's soft spill on the leaf faces (sealed only) */}
      <mesh ref={halo} position={[IX + F - 0.004, HUB_Y, 0]} rotation-y={-Math.PI / 2} material={fx.halo}>
        <planeGeometry args={[HUB_R * 3.2, HUB_R * 3.2]} />
      </mesh>

      {/* ── outer leaves (rear layer) ── */}
      <group ref={outerL} position={[OX, 0, -O_Z]}>
        {leafMeshes(leaves.ol)}
        <mesh position={[F - 0.024, 0.22, 0.01]} rotation-y={-Math.PI / 2} material={decals.kickO}>
          <planeGeometry args={[OW - 0.08, 0.2]} />
        </mesh>
        <mesh position={[F - 0.008, 2.46, -0.05]} rotation-y={-Math.PI / 2} material={decals.markL}>
          <planeGeometry args={[0.5, 0.125]} />
        </mesh>
      </group>
      <group ref={outerR} position={[OX, 0, O_Z]}>
        {leafMeshes(leaves.or)}
        <mesh position={[F - 0.024, 0.22, -0.01]} rotation-y={-Math.PI / 2} material={decals.kickO}>
          <planeGeometry args={[OW - 0.08, 0.2]} />
        </mesh>
        <mesh position={[F - 0.008, 2.46, 0.05]} rotation-y={-Math.PI / 2} material={decals.markR}>
          <planeGeometry args={[0.5, 0.125]} />
        </mesh>
      </group>

      {/* ── seam leaves (front layer) ── */}
      <group ref={innerL} position={[IX, 0, -I_Z]}>
        {leafMeshes(leaves.il)}
        <instancedMesh ref={dogsL} args={[dogGeo, mats.hub, 4]} frustumCulled={false} />
        <mesh position={[F - 0.008, stL.fy, stL.pz]} rotation-y={-Math.PI / 2} material={decals.stencilL}>
          <planeGeometry args={[stL.pw, SH]} />
        </mesh>
        <mesh position={[F - 0.012, BANDS.lock[1] - 0.14, -0.2]} rotation-y={-Math.PI / 2} material={decals.readout}>
          <planeGeometry args={[0.4, 0.1]} />
        </mesh>
        <mesh position={[F - 0.024, 0.22, 0]} rotation-y={-Math.PI / 2} material={decals.kick}>
          <planeGeometry args={[IW - 0.08, 0.2]} />
        </mesh>
      </group>
      <group ref={innerR} position={[IX, 0, I_Z]}>
        {leafMeshes(leaves.ir)}
        <instancedMesh ref={dogsR} args={[dogGeo, mats.hub, 4]} frustumCulled={false} />
        <mesh position={[F - 0.008, stR.fy, stR.pz]} rotation-y={-Math.PI / 2} material={decals.stencilR}>
          <planeGeometry args={[stR.pw, SH]} />
        </mesh>
        <mesh position={[F - 0.012, BANDS.lock[1] - 0.14, 0.2]} rotation-y={-Math.PI / 2} material={decals.aside}>
          <planeGeometry args={[0.4, 0.1]} />
        </mesh>
        <mesh position={[F - 0.008, 0.78, 0.08]} rotation-y={-Math.PI / 2} material={decals.keep}>
          <planeGeometry args={[0.52, 0.13]} />
        </mesh>
        <mesh position={[F - 0.024, 0.22, 0]} rotation-y={-Math.PI / 2} material={decals.kick}>
          <planeGeometry args={[IW - 0.08, 0.2]} />
        </mesh>
      </group>
    </group>
  );
}
