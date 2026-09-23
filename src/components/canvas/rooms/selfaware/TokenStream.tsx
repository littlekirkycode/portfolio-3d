"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLOW, MATERIALS, NEUTRAL } from "../../theme";
import { lightTint } from "./tiles";
import { useDeferredDispose } from "./dispose";

/* ── the answer streaming out of the core into the phone ────────────────────
 * A calm lit conduit from the core to a small steel receiver clamp on the
 * phone's bezel: a STATIC gradient, brightest where it leaves the core and
 * dimmer where it lands. The word-length token texture is kept only as a
 * barely-there drift (≤ +0.08 over the base, very slow) you notice if you
 * look for it — never a marching line of light (DESIGN_SYSTEM §4: no
 * travelling light pulses). Frozen under reduced motion.
 * ──────────────────────────────────────────────────────────────────────── */

const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uT;
  uniform float uN;
  varying float vS;
  float hash(float n) { return fract(sin(n * 91.345) * 47453.21); }
  void main() {
    float s = vS * uN - uT;
    float id = floor(s);
    float f = fract(s);
    float len = 0.35 + 0.45 * hash(id);
    float gap = step(0.14, hash(id + 17.0));
    float tok = smoothstep(0.0, 0.2, f) * (1.0 - smoothstep(len - 0.2, len, f)) * gap;
    float ends = smoothstep(0.0, 0.05, vS) * smoothstep(1.0, 0.94, vS);
    // static source-to-sink gradient + a faint drift of token texture
    float k = (0.5 - 0.2 * vS + 0.08 * tok) * ends;
    gl_FragColor = vec4(uColor * (0.9 + 0.06 * tok), k);
  }`;
const vert = /* glsl */ `
  varying float vS;
  void main() {
    vS = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** Tube along `curve` whose radius tapers to `tip` over the last `taper`
 *  fraction (TubeGeometry samples getPointAt(u), with u = uv.x). */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r: number, radial: number, taper: number, tip: number) {
  const g = new THREE.TubeGeometry(curve, 140, r, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const k = u < 1 - taper ? 1 : tip + (1 - tip) * (1 - THREE.MathUtils.smoothstep(u, 1 - taper, 1));
    const s0 = u < taper * 0.4 ? 0.6 + 0.4 * THREE.MathUtils.smoothstep(u, 0, taper * 0.4) : 1;
    curve.getPointAt(Math.min(u, 1), c);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(k * s0).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export default function TokenStream({
  points,
  accent,
  animate,
}: {
  points: [number, number, number][];
  accent: string;
  animate: boolean;
}) {
  const key = JSON.stringify(points);
  const { tube, sheath, end } = useMemo(() => {
    const pts = (JSON.parse(key) as [number, number, number][]).map((p) => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    return {
      tube: taperedTube(curve, 0.013, 8, 0.14, 0.5),
      sheath: taperedTube(curve, 0.036, 14, 0.14, 0.55),
      end: pts[pts.length - 1],
    };
  }, [key]);
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: lightTint(accent, 0.32).multiplyScalar(GLOW.line) },
        uT: { value: 0 },
        uN: { value: 18 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    m.toneMapped = false;
    return m;
  }, [accent]);
  const mats = useMemo(
    () => ({
      sheath: new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      body: MATERIALS.paint({ color: NEUTRAL.hull }),
      face: MATERIALS.steel(),
      port: MATERIALS.polished(),
      gap: MATERIALS.paint({ color: NEUTRAL.hullShadow }),
      lamp: MATERIALS.emit(lightTint(accent, 0.35), GLOW.trim),
    }),
    [accent],
  );
  const own = useMemo(() => [tube, sheath, mat], [tube, sheath, mat]);
  useDeferredDispose(own);
  useDeferredDispose(mats);
  useFrame((_, dt) => {
    if (animate) mat.uniforms.uT.value += Math.min(dt, 1 / 30) * 0.2;
  });
  return (
    <group>
      <mesh geometry={sheath} material={mats.sheath} />
      <mesh geometry={tube} material={mat} />
      {/* receiver: a steel clamp bracket gripping the display's left bezel;
          the stream lands in its port, a tiny trim lamp says "receiving" */}
      <group position={end}>
        <mesh position={[0.035, 0, -0.02]} material={mats.body}>
          <boxGeometry args={[0.08, 0.14, 0.1]} />
        </mesh>
        <mesh position={[0.035, 0, 0.031]} material={mats.face}>
          <boxGeometry args={[0.066, 0.12, 0.004]} />
        </mesh>
        {/* jaw lip wrapping onto the bezel front */}
        <mesh position={[0.085, 0, 0.034]} material={mats.body}>
          <boxGeometry args={[0.03, 0.1, 0.012]} />
        </mesh>
        <mesh position={[-0.006, 0, -0.01]} rotation-z={Math.PI / 2} material={mats.port}>
          <cylinderGeometry args={[0.03, 0.036, 0.016, 24]} />
        </mesh>
        <mesh position={[-0.015, 0, -0.01]} rotation-z={Math.PI / 2} material={mats.gap}>
          <cylinderGeometry args={[0.018, 0.018, 0.004, 20]} />
        </mesh>
        <mesh position={[0.035, -0.042, 0.034]} material={mats.lamp}>
          <boxGeometry args={[0.03, 0.006, 0.002]} />
        </mesh>
      </group>
    </group>
  );
}
