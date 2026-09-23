"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { fxRefs } from "@/lib/scrollStore";
import { BRIDGE_C, GALLERY_X } from "../hallConfig";

/* ── the view outside the bridge ─────────────────────────────────────────────
 * Everything here is unlit ShaderMaterial with fog OFF (the hall's exp2 fog
 * would grey out anything 60+ m away):
 *  - SkyDome: a big back-faced sphere centred on the bridge with three layers
 *    of procedural stars (per-cell hashed positions, colour temperature
 *    spread) over a dark, low-contrast nebula. fxRefs.warp stretches every
 *    star along its meridian toward the ship's +x heading — the DEPART
 *    hyperspace streak — instead of the old flat window panes' shader.
 *  - Planet: an ocean world (fbm continents, ice caps, drifting clouds, a
 *    lit limb + terminator, sparse warm city lights on the night side) with
 *    a back-faced fresnel atmosphere shell.
 *  - Moon: a small cratered grey sphere lit by the same sun.
 *  - GasGiant: a banded, ringed giant placed in the observation gallery
 *    view (the gallery glazing looks onto this same sky).
 *  - OrbitDrift: the planet + moon ease a few degrees back and forth over
 *    minutes — the ship coasting along its orbit.
 * No motion faster than a slow drift; nothing twinkles.
 * ──────────────────────────────────────────────────────────────────────── */

/** Direction the (unseen) sun lies in — shared by the planet and the moon. */
const SUN_DIR = new THREE.Vector3(0.15, 0.32, -0.94).normalize();

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < OCTAVES; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;

/* ── sky dome ────────────────────────────────────────────────────────────── */

const SKY_R = 100;

function SkyDome({ octaves }: { octaves: number }) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      defines: { OCTAVES: octaves },
      uniforms: { uWarp: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uWarp;
        varying vec3 vDir;
        ${NOISE}
        // one star layer: a star per 3D cell at scale S, brightness b
        vec3 stars(vec3 d, float S, float density, float b, float warpK) {
          vec3 p = d * S;
          vec3 cell = floor(p);
          vec3 acc = vec3(0.0);
          // ship heading +x: in warp, stretch each star along its meridian
          vec3 F = vec3(1.0, 0.0, 0.0);
          vec3 m = F - dot(F, d) * d;
          float ml = length(m);
          m = ml > 1e-4 ? m / ml : vec3(0.0, 1.0, 0.0);
          for (int x = -1; x <= 1; x++)
          for (int y = -1; y <= 1; y++)
          for (int z = -1; z <= 1; z++) {
            vec3 c = cell + vec3(x, y, z);
            float h = hash13(c + 11.7);
            if (h > density) continue;
            vec3 sp = c + hash33(c);
            vec3 diff = p - sp;
            float dm = dot(diff, m);
            vec3 dp = diff - dm * m;
            float stretch = 1.0 + warpK * uWarp;
            float r2 = dot(dp, dp) + (dm * dm) / (stretch * stretch);
            float core = exp(-r2 * 90.0);
            float halo = exp(-r2 * 14.0) * 0.18;
            float t = hash13(c + 3.1);
            vec3 tint = t < 0.2 ? vec3(1.0, 0.82, 0.66) : t < 0.55 ? vec3(0.78, 0.86, 1.0) : vec3(1.0);
            acc += tint * (core + halo) * b * (0.35 + 0.65 * hash13(c + 5.3));
          }
          return acc;
        }
        void main() {
          vec3 d = normalize(vDir);
          // nebula: two fbm fields, kept dark and low-contrast
          float n1 = fbm(d * 2.2 + vec3(4.0, 1.0, 7.0));
          float n2 = fbm(d * 4.6 + vec3(-3.0, 9.0, 2.0));
          float band = exp(-pow((d.y - 0.18 * d.z) * 2.4, 2.0)); // soft galactic band
          float neb = smoothstep(0.42, 0.85, n1) * (0.55 + 0.45 * band);
          vec3 deep = vec3(0.012, 0.016, 0.04);
          vec3 violet = vec3(0.16, 0.07, 0.26);
          vec3 blue = vec3(0.05, 0.12, 0.28);
          vec3 teal = vec3(0.03, 0.16, 0.18);
          vec3 col = deep + band * vec3(0.02, 0.025, 0.05);
          col += mix(blue, violet, smoothstep(0.35, 0.75, n2)) * neb * 0.8;
          col += teal * smoothstep(0.62, 0.9, n2) * neb * 0.45;
          // dust lanes darken the band
          col *= 1.0 - 0.45 * smoothstep(0.55, 0.8, fbm(d * 7.0 + 2.0)) * band;
          // stars
          col += stars(d, 70.0, 0.22, 1.0, 30.0);
          col += stars(d, 160.0, 0.2, 0.42, 45.0);
          col += stars(d, 320.0, 0.18, 0.22, 60.0) * (0.5 + 1.0 * band);
          // warp: a faint blue wash toward the heading
          col += vec3(0.1, 0.18, 0.4) * uWarp * pow(max(d.x, 0.0), 6.0) * 0.8;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
    });
    m.toneMapped = false;
    return m;
  }, [octaves]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    mat.uniforms.uWarp.value = fxRefs.warp;
  });
  return (
    // default render order: drawn after the (nearer) opaque hull, so early-z
    // skips every pixel the walls cover — only what shows through a window
    // pays for the star/nebula shader
    <mesh material={mat} frustumCulled={false}>
      <sphereGeometry args={[SKY_R, 64, 32]} />
    </mesh>
  );
}

/* ── planet ──────────────────────────────────────────────────────────────── */

function Planet({
  position,
  radius,
  octaves,
  animate,
}: {
  position: [number, number, number];
  radius: number;
  octaves: number;
  animate: boolean;
}) {
  const surface = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      defines: { OCTAVES: octaves },
      uniforms: {
        uSun: { value: SUN_DIR.clone() },
        uTime: { value: 0 },
        uDim: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vObj;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vObj = normalize(position);
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uTime;
        uniform float uDim;
        varying vec3 vObj;
        varying vec3 vN;
        varying vec3 vV;
        ${NOISE}
        void main() {
          vec3 p = vObj;
          float land = fbm(p * 2.6 + 3.0);
          float detail = fbm(p * 9.0);
          float isLand = smoothstep(0.52, 0.56, land + detail * 0.08);
          vec3 ocean = mix(vec3(0.02, 0.07, 0.16), vec3(0.04, 0.16, 0.3), smoothstep(0.3, 0.52, land));
          vec3 ground = mix(vec3(0.2, 0.22, 0.13), vec3(0.34, 0.28, 0.18), detail);
          ground = mix(ground, vec3(0.12, 0.2, 0.1), smoothstep(0.55, 0.7, land));
          vec3 col = mix(ocean, ground, isLand);
          float ice = smoothstep(0.78, 0.86, abs(p.y) + detail * 0.08);
          col = mix(col, vec3(0.85, 0.9, 0.95), ice);
          // clouds drift slowly (rotating noise domain)
          float a = uTime * 0.012;
          vec3 q = vec3(p.x * cos(a) - p.z * sin(a), p.y, p.x * sin(a) + p.z * cos(a));
          float cl = smoothstep(0.52, 0.78, fbm(q * 3.2 + 8.0) * 0.7 + fbm(q * 9.0) * 0.3);
          // lighting
          vec3 n = normalize(vN);
          float ndl = dot(n, uSun);
          float lit = smoothstep(-0.08, 0.35, ndl);
          vec3 day = mix(col, vec3(0.8, 0.84, 0.88), cl * 0.6) * (0.03 + 0.95 * pow(max(ndl, 0.0), 0.8));
          // specular glint on the oceans
          vec3 h = normalize(uSun + normalize(vV));
          day += vec3(1.0, 0.92, 0.8) * pow(max(dot(n, h), 0.0), 60.0) * 0.5 * (1.0 - isLand) * (1.0 - cl);
          // night side: sparse warm city lights on land
          // clustered: only where a low-frequency "population" field is high,
          // and as fine points (1 cell ≈ a few pixels even up close)
          float pop = smoothstep(0.55, 0.7, fbm(p * 5.0 + 21.0));
          float city = step(0.965, hash13(floor(p * 700.0))) * pop * isLand * (1.0 - ice) * (1.0 - cl);
          vec3 night = vec3(1.0, 0.74, 0.45) * city * 0.5;
          vec3 outc = mix(night, day, lit);
          // atmosphere scatter at the limb (lit side stronger)
          float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
          outc += vec3(0.25, 0.5, 1.0) * rim * (0.15 + 0.85 * smoothstep(-0.3, 0.5, ndl)) * 0.9;
          gl_FragColor = vec4(outc * uDim, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    m.toneMapped = false;
    return m;
  }, [octaves]);
  const atmo = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN_DIR.clone() }, uDim: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uDim;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec3 n = normalize(vN);
          float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.6);
          float sun = smoothstep(-0.4, 0.6, dot(n, uSun));
          vec3 c = vec3(0.3, 0.55, 1.0) * f * (0.25 + 1.1 * sun);
          gl_FragColor = vec4(c * uDim, f);
        }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    m.toneMapped = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      surface.dispose();
      atmo.dispose();
    },
    [surface, atmo],
  );
  const spin = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 30);
    if (animate) {
      surface.uniforms.uTime.value += d;
      if (spin.current) spin.current.rotation.y += d * 0.004;
    }
    const dim = 1 - 0.75 * fxRefs.warp;
    surface.uniforms.uDim.value = dim;
    atmo.uniforms.uDim.value = dim;
  });
  return (
    <group position={position}>
      <mesh ref={spin} material={surface} rotation={[0.35, 0, 0.18]}>
        <sphereGeometry args={[radius, 96, 64]} />
      </mesh>
      <mesh material={atmo} scale={1.07}>
        <sphereGeometry args={[radius, 64, 48]} />
      </mesh>
    </group>
  );
}

function Moon({ position, radius, octaves }: { position: [number, number, number]; radius: number; octaves: number }) {
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      defines: { OCTAVES: octaves },
      uniforms: { uSun: { value: SUN_DIR.clone() }, uDim: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vObj;
        varying vec3 vN;
        void main() {
          vObj = normalize(position);
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uDim;
        varying vec3 vObj;
        varying vec3 vN;
        ${NOISE}
        void main() {
          float n = fbm(vObj * 5.0);
          float crater = smoothstep(0.62, 0.66, fbm(vObj * 11.0 + 4.0));
          vec3 col = mix(vec3(0.3, 0.3, 0.32), vec3(0.55, 0.54, 0.52), n) * (1.0 - 0.25 * crater);
          float ndl = max(dot(normalize(vN), uSun), 0.0);
          gl_FragColor = vec4(col * (0.03 + 1.0 * ndl) * uDim, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    m.toneMapped = false;
    return m;
  }, [octaves]);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    mat.uniforms.uDim.value = 1 - 0.75 * fxRefs.warp;
  });
  return (
    <mesh material={mat} position={position}>
      <sphereGeometry args={[radius, 48, 32]} />
    </mesh>
  );
}

/* ── gas giant (seen from the observation gallery) ───────────────────────── */

function GasGiant({ position, radius, animate }: { position: [number, number, number]; radius: number; animate: boolean }) {
  const body = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      defines: { OCTAVES: 4 },
      uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 }, uDim: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vObj;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vObj = normalize(position);
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun;
        uniform float uTime;
        uniform float uDim;
        varying vec3 vObj;
        varying vec3 vN;
        varying vec3 vV;
        ${NOISE}
        void main() {
          vec3 p = vObj;
          // latitude bands, warped by slow turbulence
          float warp = fbm(p * 3.0 + vec3(uTime * 0.01, 0.0, 0.0)) * 0.35;
          float lat = p.y + warp * 0.25;
          float b = sin(lat * 18.0) * 0.5 + 0.5;
          float b2 = sin(lat * 7.0 + 1.3) * 0.5 + 0.5;
          vec3 cream = vec3(0.78, 0.70, 0.56);
          vec3 rust = vec3(0.55, 0.33, 0.20);
          vec3 slate = vec3(0.32, 0.36, 0.42);
          vec3 col = mix(cream, rust, b * 0.7);
          col = mix(col, slate, b2 * 0.35);
          // a storm eye
          float storm = 1.0 - smoothstep(0.0, 0.12, length(vec2(p.x - 0.35, (p.y + 0.28) * 1.6)));
          col = mix(col, vec3(0.62, 0.28, 0.18), storm * 0.8);
          vec3 n = normalize(vN);
          float ndl = dot(n, uSun);
          vec3 lit = col * (0.02 + 0.95 * pow(max(ndl, 0.0), 0.75));
          float rim = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
          lit += vec3(0.9, 0.7, 0.5) * rim * smoothstep(-0.2, 0.5, ndl) * 0.25;
          gl_FragColor = vec4(lit * uDim, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    m.toneMapped = false;
    return m;
  }, []);
  const ring = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uDim: { value: 1 } },
      vertexShader: /* glsl */ `
        varying float vR;
        void main() {
          vR = length(position.xy);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDim;
        varying float vR;
        void main() {
          float r = (vR - ${(radius * 1.35).toFixed(2)}) / ${(radius * 0.9).toFixed(2)};
          float bands = 0.55 + 0.45 * sin(r * 60.0) * sin(r * 17.0 + 1.0);
          float edge = smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.9, r);
          float gap = 1.0 - 0.85 * (1.0 - smoothstep(0.0, 0.02, abs(r - 0.62)));
          float a = bands * edge * gap * 0.55;
          gl_FragColor = vec4(vec3(0.78, 0.72, 0.62) * a * uDim, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    m.toneMapped = false;
    return m;
  }, [radius]);
  useEffect(
    () => () => {
      body.dispose();
      ring.dispose();
    },
    [body, ring],
  );
  useFrame((_, dt) => {
    if (animate) body.uniforms.uTime.value += Math.min(dt, 1 / 30);
    const dim = 1 - 0.75 * fxRefs.warp;
    body.uniforms.uDim.value = dim;
    ring.uniforms.uDim.value = dim;
  });
  return (
    <group position={position} rotation={[0.25, 0.4, -0.32]}>
      <mesh material={body}>
        <sphereGeometry args={[radius, 96, 64]} />
      </mesh>
      <mesh material={ring} rotation-x={Math.PI / 2 - 0.08}>
        <ringGeometry args={[radius * 1.35, radius * 2.25, 160, 1]} />
      </mesh>
    </group>
  );
}

/** Slow orbital drift: the ship coasting along its orbit, so the planet and
 *  moon ease a few degrees across the canopy and back over four minutes. */
function OrbitDrift({ animate, children }: { animate: boolean; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!g.current || !animate) return;
    t.current += Math.min(dt, 1 / 30);
    g.current.rotation.y = 0.11 * Math.sin((t.current / 240) * Math.PI * 2);
    g.current.rotation.x = 0.02 * Math.sin((t.current / 170) * Math.PI * 2);
  });
  return <group ref={g}>{children}</group>;
}

/** The whole outside view, centred on the bridge. Distance-gated: nothing is
 *  drawn until the camera is near the bridge (it's enclosed everywhere else). */
export default function SpaceView({ mobile = false, animate = true }: { mobile?: boolean; animate?: boolean }) {
  const octaves = mobile ? 3 : 5;
  const gate = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = gate.current;
    if (!g) return;
    // visible near the bridge, and around the observation gallery (whose
    // glazing looks out onto the same sky)
    const cx = camera.position.x;
    g.visible = BRIDGE_C - cx < (g.visible ? 48 : 45) || Math.abs(cx - GALLERY_X) < (g.visible ? 24 : 21);
  });
  return (
    <group ref={gate} position={[BRIDGE_C, 0, 0]}>
      <SkyDome octaves={octaves} />
      <OrbitDrift animate={animate}>
        <Planet position={[58, 3, 33]} radius={21} octaves={octaves} animate={animate} />
        <Moon position={[84, 17, -6]} radius={2.1} octaves={octaves} />
      </OrbitDrift>
      {/* the gallery view: a ringed gas giant off the starboard side */}
      <GasGiant position={[GALLERY_X + 12 - BRIDGE_C, 9, 48]} radius={11} animate={animate} />
    </group>
  );
}
