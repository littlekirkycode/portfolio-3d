"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { scrollRefs, pointerRefs } from "@/lib/scrollStore";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { withBase } from "@/lib/asset";
import {
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
  PORTHOLES,
  HALF_W,
  WALL_H,
} from "./hallConfig";

/* ─────────────────────────────────────────────────────────────────────────
   LOCAL star-field shader — a COPY of shaders.ts backgroundVertex/Fragment
   (shaders.ts is frozen this round, so the copy lives here). The copy adds
   two uniforms over the original:
     uOffset — per-window sky offset so every viewport shows a different
               patch of space instead of the same tiled nebula;
     uWarp   — 0→1 hyperspace: stars smear into streaks along the travel
               axis and brighten (smoothstep-shaped). Fed by fxRefs.warp on
               the bridge; stays 0 on the gallery/portholes.
   Exported for Corridor's bridge finale, which shares this material pair.
   ───────────────────────────────────────────────────────────────────────── */

export const starVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const starFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uVelocity;
  uniform vec2  uMouse;
  uniform vec2  uOffset;
  uniform float uWarp;

  varying vec2 vUv;

  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }

  // 2D simplex noise (Ashima)
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // fractional brownian motion
  float fbm(vec2 p){
    float total = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 5; i++){
      total += snoise(p * freq) * amp;
      freq *= 2.02;
      amp  *= 0.5;
    }
    return total;
  }

  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // One star layer: jittered grid; each occupied cell gets a star with its own
  // position, size and twinkle phase/rate. density = fraction of lit cells.
  float stars(vec2 uv, float scale, float density, float t){
    vec2 g = uv * scale;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float rnd = hash21(id);
    if(rnd > density) return 0.0;
    vec2 off = (vec2(hash21(id + 3.7), hash21(id + 9.1)) - 0.5) * 0.7;
    float d = length(f - off);
    float size = mix(0.03, 0.10, hash21(id + 5.3));
    float star = smoothstep(size, 0.0, d);
    float tw = 0.55 + 0.45 * sin(t * (0.8 + 3.0 * rnd / density) + rnd * 40.0);
    return star * tw;
  }

  void main(){
    vec2 uv = vUv;

    // Equalise the ~2:1 window aspect so stars stay round, not stretched;
    // uOffset shifts the whole sky so each viewport frames different space.
    vec2 suv = (uv - 0.5) * vec2(2.05, 1.0) + uOffset;

    float t = uTime;
    float w = smoothstep(0.0, 1.0, clamp(uWarp, 0.0, 1.0));

    // Hyperspace: compressing star-space X smears every star into a streak
    // along the travel axis; the (unwarped) drift below is added AFTER the
    // squash, so the streak field also races sideways as w rises.
    vec2 wuv = vec2(suv.x * mix(1.0, 0.045, w), suv.y);

    // Slow drift, plus a whisper of pointer/scroll parallax. Near layers move
    // more than far ones -> depth.
    vec2 drift = vec2(t * 0.006, t * 0.0022);
    vec2 par = uMouse * 0.012 + vec2(uProgress * 0.05, 0.0);

    float s1 = stars(wuv + drift * 0.5 + par * 0.4, 22.0, 0.10, t);        // far, faint
    float s2 = stars(wuv + drift + par * 0.7 + 3.1, 12.0, 0.14, t);        // mid
    float s3 = stars(wuv + drift * 1.8 + par + 7.7, 6.0, 0.10, t * 0.7);   // near, few, big

    // Blue-violet nebula clouds behind the stars — the nebula does NOT warp,
    // so the streaks read against a stable deep-space backdrop.
    vec2 np = suv * 1.6 + vec2(t * 0.008, 0.0) + uMouse * 0.03;
    float n1 = fbm(np);
    float n2 = fbm(np * 0.55 + vec2(4.7, 2.3) - t * 0.005);
    vec3 neb1 = vec3(0.110, 0.200, 0.560); // deep blue
    vec3 neb2 = vec3(0.400, 0.190, 0.640); // violet
    vec3 neb3 = vec3(0.640, 0.200, 0.500); // magenta core

    float c1 = smoothstep(0.05, 0.95, n1);
    float c2 = smoothstep(0.25, 1.05, n2);

    vec3 col = vec3(0.004, 0.006, 0.014);  // deep-space base — near black
    col += neb1 * c1 * 0.38;
    col += neb2 * c2 * 0.28;
    col += neb3 * c1 * c2 * 0.40;

    // Star colours: far layer cool blue, near layer warm white. Streaks
    // brighten as the jump spools up.
    float boost = 1.0 + 2.6 * w;
    col += vec3(0.55, 0.65, 0.85) * s1 * 0.55 * boost;
    col += vec3(0.85, 0.90, 1.00) * s2 * 1.00 * boost;
    col += vec3(1.00, 0.97, 0.92) * s3 * 1.40 * boost;

    // Fast scrolls give the clouds a brief energetic lift.
    col += neb2 * abs(uVelocity) * 0.05;

    // Blue-white cabin wash as the hyperspace jump winds up.
    col += vec3(0.32, 0.44, 0.78) * w * 0.22;

    // Soft vignette toward the window frame -> the void recedes at the edges.
    float vig = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(1.6, 2.0)));
    col *= mix(0.55, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export type StarUniforms = {
  uTime: { value: number };
  uProgress: { value: number };
  uVelocity: { value: number };
  uMouse: { value: THREE.Vector2 };
  uOffset: { value: THREE.Vector2 };
  uWarp: { value: number };
};

export function makeStarUniforms(offsetX = 0, offsetY = 0): StarUniforms {
  return {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uVelocity: { value: 0 },
    uMouse: { value: new THREE.Vector2() },
    uOffset: { value: new THREE.Vector2(offsetX, offsetY) },
    uWarp: { value: 0 },
  };
}

/** Per-frame star-uniform tick (call from useFrame — zero allocation). */
export function updateStarUniforms(u: StarUniforms, rawDt: number, warp = 0): void {
  u.uTime.value += Math.min(rawDt, 1 / 30);
  u.uProgress.value = scrollRefs.progress;
  u.uVelocity.value = Math.min(Math.abs(scrollRefs.velocity) * 0.02, 1.5);
  u.uMouse.value.set(pointerRefs.x, pointerRefs.y);
  u.uWarp.value = warp;
}

/* ── shared 'starlight rake' assets (one CanvasTexture for every spill quad) ── */

function makeRakeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.55, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  tex.needsUpdate = true;
  return tex;
}

/* ── "the pilot" — a mini James adrift outside the observation glazing ─────
   Sight gag for the gallery dwell: a tiny space-suited figure tumbling in
   zero-g just past the mullions (in FRONT of the opaque star plane, so the
   nebula reads as the void he's lost in), with a deadpan HUD tag overhead.
   Sits mid-pane at x=+1.14 so his whole tumble radius clears the posts at
   +0.57/+1.71 and stays off the glass at z 3.98. */

// "Astronaut" by PW Wu (poly.pizza/m/erlAEWfFKH3, CC-BY 3.0 — credited in the
// Contact section). Proper EVA suit + dark visor, authored mid-float.
const PILOT_URL = withBase("/models/astronaut.glb");
// No module-scope preload: staged in ModelLoader's preloadDeferredModels()
// (idle-time) — the 1.2 MB gag prop must not gate the corridor shell.

const PILOT_H = 0.58; // mini — reads as "someone out there", not a mannequin
// x 0.92 (not pane-centre 1.14): keeps him + his name tag inside the NARROW
// mobile frame (~±1.6 world units visible at the glass) while still clear of
// the mullion posts at 0.57/1.71 through the ±0.15 drift.
const PILOT_X = 0.92;
const PILOT_Y = 2.3;

function makePilotLabelTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 224;
  const ctx = c.getContext("2d")!;
  const mono = "ui-monospace, 'Cascadia Mono', Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 76px ${mono}`;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillText("JAMES — PILOT", 320, 92);
  ctx.font = `500 42px ${mono}`;
  ctx.fillStyle = "rgba(255,176,122,0.9)";
  ctx.fillText("re-entry pending…", 320, 156);
  // leader caret pointing down at him
  ctx.fillStyle = "#ff5c38";
  ctx.beginPath();
  ctx.moveTo(320 - 16, 186);
  ctx.lineTo(320 + 16, 186);
  ctx.lineTo(320, 214);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function SpacewalkPilot() {
  const S = GALLERY_SIDE;
  const reduced = useReducedMotion();
  const { scene } = useGLTF(PILOT_URL);
  const drift = useRef<THREE.Group>(null);
  const tumble = useRef<THREE.Group>(null);
  const tRef = useRef(0);

  const fig = useMemo(() => {
    // SkeletonUtils clone — the worker is a SkinnedMesh rig; a plain deep
    // clone stays bound to the original bones and never draws (see ModelLoader).
    const c = cloneWithSkeleton(scene) as THREE.Group;
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    c.scale.setScalar(PILOT_H / (size.y || 1));
    c.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(c);
    const centre = new THREE.Vector3();
    box2.getCenter(centre);
    c.position.sub(centre); // spin about his middle, like real bad EVA luck
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false; // bounds go stale under the re-scale
      // keep the suit's own baked colours; starlit emissive lift so he stays
      // readable against the void (materials belong to this GLB alone)
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat && mat.isMeshStandardMaterial) {
        mat.emissive.copy(mat.color);
        mat.emissiveIntensity = 0.25;
      }
    });
    return c;
  }, [scene]);

  const labelTex = useMemo(makePilotLabelTexture, []);

  useFrame((_, rawDt) => {
    const d = drift.current;
    const tb = tumble.current;
    if (!d || !tb) return;
    if (reduced) {
      // parked at a jaunty off-axis angle — still tells the joke, no motion
      tb.rotation.set(0.15, 0, 0.55);
      return;
    }
    const dt = Math.min(rawDt, 1 / 30);
    tRef.current += dt;
    const t = tRef.current;
    // slow zero-g drift inside the pane; amplitudes keep him clear of the
    // mullions and off the glass plane
    d.position.x = PILOT_X + Math.sin(t * 0.23) * 0.15;
    d.position.y = PILOT_Y + Math.sin(t * 0.6) * 0.12;
    // lazy cartwheel with a wobble — flailing, not spinning like a top
    tb.rotation.z = t * 0.55;
    tb.rotation.x = 0.2 * Math.sin(t * 0.9);
  });

  return (
    <group>
      {/* drifting anchor (label rides along but never tumbles) */}
      <group ref={drift} position={[PILOT_X, PILOT_Y, S * (HALF_W + 0.19)]} rotation-y={S === 1 ? Math.PI : 0}>
        <group ref={tumble}>
          <primitive object={fig} />
        </group>
        {/* HUD name tag — upright, riding the drift */}
        <mesh position={[0, 0.52, 0.03]}>
          <planeGeometry args={[1.08, 0.38]} />
          <meshBasicMaterial map={labelTex} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ── observation gallery (slot 5) — floor-to-ceiling glazing on the +z wall ── */

const SILL_H = 0.55; // chunky sill from the floor
const LINTEL_H = 0.35;
const GLASS_H = WALL_H - SILL_H - LINTEL_H;
const GLASS_Y = SILL_H + GLASS_H / 2;
const PORT_Y = 2.0; // porthole centre height

/** Tiny emissive dart that lerps across the gallery view every ~25s — one
 *  reused mesh, position writes only (micro-delight, no allocation). */
const DART_PERIOD = 25;
const DART_FLIGHT = 2.6;

function Gallery({ rakeMat }: { rakeMat: THREE.MeshBasicMaterial }) {
  const S = GALLERY_SIDE;
  const rotY = S === 1 ? Math.PI : 0;
  const uni = useMemo(() => makeStarUniforms(3.6, 1.3), []);
  // Matte frames: at metalness 0.5 the corridor fixture at x=100 fired a
  // grazing-angle specular up the centre mullion's side face — a blown white
  // streak across the glazing (QA: gallery "white line"). Rough + dielectric
  // kills the hot lobe; the frames should read as dark structure anyway.
  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#151a28", roughness: 0.85, metalness: 0.15 }),
    [],
  );
  const mullions = useRef<THREE.InstancedMesh>(null);
  const dart = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);

  const posts = useMemo(() => {
    const n = Math.max(3, Math.round(GALLERY_SPAN / 1.2) + 1); // verticals incl. edges
    const w = GALLERY_SPAN - 0.3;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(-w / 2 + (w * i) / (n - 1));
    return out;
  }, []);

  useLayoutEffect(() => {
    const mesh = mullions.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    posts.forEach((px, i) => {
      m.makeTranslation(px, GLASS_Y, S * (HALF_W + 0.14));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [posts, S]);

  useFrame((_, rawDt) => {
    updateStarUniforms(uni, rawDt); // gallery never warps — that's the bridge's beat
    tRef.current += Math.min(rawDt, 1 / 30);
    const d = dart.current;
    if (!d) return;
    const cycle = tRef.current % DART_PERIOD;
    if (cycle < DART_FLIGHT) {
      const k = cycle / DART_FLIGHT;
      d.visible = true;
      d.position.x = -(GALLERY_SPAN / 2 + 1.5) + k * (GALLERY_SPAN + 3);
      d.position.y = 2.55 + Math.sin(k * 5.2) * 0.12;
    } else {
      d.visible = false;
    }
  });

  return (
    <group position={[GALLERY_X, 0, 0]}>
      {/* star glazing — recessed just past the wall cut */}
      <mesh position={[0, GLASS_Y, S * (HALF_W + 0.28)]} rotation-y={rotY}>
        <planeGeometry args={[GALLERY_SPAN - 0.2, GLASS_H]} />
        <shaderMaterial vertexShader={starVertex} fragmentShader={starFragment} uniforms={uni} toneMapped={false} />
      </mesh>

      {/* simple vertical mullions — one instanced draw */}
      <instancedMesh ref={mullions} args={[undefined, undefined, posts.length]} material={frameMat} frustumCulled={false}>
        <boxGeometry args={[0.09, GLASS_H, 0.16]} />
      </instancedMesh>

      {/* chunky sill + lintel (also hide the wall-cut seams) */}
      <mesh position={[0, SILL_H / 2, S * (HALF_W + 0.12)]} material={frameMat}>
        <boxGeometry args={[GALLERY_SPAN + 0.7, SILL_H, 0.55]} />
      </mesh>
      <mesh position={[0, WALL_H - LINTEL_H / 2, S * (HALF_W + 0.12)]} material={frameMat}>
        <boxGeometry args={[GALLERY_SPAN + 0.7, LINTEL_H, 0.55]} />
      </mesh>
      {/* chunky end posts cover the cut's side seams */}
      {([-1, 1] as const).map((e) => (
        <mesh key={e} position={[e * (GALLERY_SPAN / 2 + 0.16), WALL_H / 2, S * (HALF_W + 0.12)]} material={frameMat}>
          <boxGeometry args={[0.35, WALL_H, 0.55]} />
        </mesh>
      ))}

      {/* one cool emissive strip along the sill's corridor edge */}
      <mesh position={[0, SILL_H + 0.015, S * (HALF_W - 0.16)]}>
        <boxGeometry args={[GALLERY_SPAN - 0.2, 0.03, 0.03]} />
        <meshBasicMaterial color="#6f9fd6" toneMapped={false} />
      </mesh>

      {/* starlight rake — additive spill pooling on the floor under the glass */}
      <mesh material={rakeMat} rotation-x={-Math.PI / 2} position={[0, 0.022, S * (HALF_W - 1.5)]}>
        <planeGeometry args={[GALLERY_SPAN + 1.2, 2.8]} />
      </mesh>

      {/* micro-delight: a distant ship darting across the view (behind mullions,
          in front of the glass) */}
      <mesh ref={dart} visible={false} position={[0, 2.55, S * (HALF_W + 0.24)]}>
        <boxGeometry args={[0.5, 0.035, 0.05]} />
        <meshBasicMaterial color="#ffd9a8" toneMapped={false} />
      </mesh>

      {/* the pilot, regrettably outside */}
      <SpacewalkPilot />
    </group>
  );
}

/* ── portholes — small round viewports on the blank wall runs ──────────────── */

function Portholes({ rakeMat }: { rakeMat: THREE.MeshBasicMaterial }) {
  const frames = useRef<THREE.InstancedMesh>(null);
  // each porthole frames its own patch of sky
  const uniformSets = useMemo(
    () => PORTHOLES.map((_, i) => makeStarUniforms(4.7 + i * 3.3, -1.4 + i * 1.9)),
    [],
  );

  useLayoutEffect(() => {
    const mesh = frames.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    PORTHOLES.forEach((p, i) => {
      m.makeTranslation(p.x, PORT_Y, p.side * (HALF_W + 0.02));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  useFrame((_, rawDt) => {
    for (const u of uniformSets) updateStarUniforms(u, rawDt);
  });

  return (
    <group>
      {/* ring frames — one instanced draw (torus lies in the wall plane) */}
      <instancedMesh ref={frames} args={[undefined, undefined, PORTHOLES.length]} frustumCulled={false}>
        <torusGeometry args={[0.52, 0.09, 10, 28]} />
        {/* matte for the same reason as the gallery frames — no fixture glints */}
        <meshStandardMaterial color="#1a2030" roughness={0.85} metalness={0.15} />
      </instancedMesh>

      {/* star discs — small shader planes recessed into the wall slab */}
      {PORTHOLES.map((p, i) => (
        <mesh
          key={`disc${i}`}
          position={[p.x, PORT_Y, p.side * (HALF_W + 0.16)]}
          rotation-y={p.side === 1 ? Math.PI : 0}
        >
          <circleGeometry args={[0.46, 28]} />
          <shaderMaterial vertexShader={starVertex} fragmentShader={starFragment} uniforms={uniformSets[i]} toneMapped={false} />
        </mesh>
      ))}

      {/* starlight rakes under each viewport */}
      {PORTHOLES.map((p, i) => (
        <mesh
          key={`rake${i}`}
          material={rakeMat}
          rotation-x={-Math.PI / 2}
          position={[p.x, 0.022, p.side * (HALF_W - 0.65)]}
        >
          <planeGeometry args={[1.8, 1.2]} />
        </mesh>
      ))}
    </group>
  );
}

/** Observation-gallery glazing (dwell slot 5) + porthole viewports on the blank
 *  wall runs — every window runs the local star shader with its own sky offset,
 *  and spills a faint cool 'starlight rake' onto the deck. */
export default function Windows() {
  const rakeMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      map: makeRakeTexture(),
      color: "#7fb0e8",
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return m;
  }, []);
  return (
    <group>
      <Gallery rakeMat={rakeMat} />
      <Portholes rakeMat={rakeMat} />
    </group>
  );
}
