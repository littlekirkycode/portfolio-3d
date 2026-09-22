"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { roundRect, wrapText } from "../canvas2d";
import { Board, FlowTube, INK, Spin, fonts, useAdditive, useGlow, type Painter } from "./holo";

/* ── Nuremi: an AI concierge anchored to a live map ──────────────────────────
 * The hero is the product's core view as a hologram: a city block projected
 * over a pedestal, with the concierge's picks pinned on it and the route
 * between them streaming. A chat card beside the exhibit shows the question
 * that produced the map. */

const C = { x: -2.88, z: 1.32, y: 1.18 }; // disc centre
const R = 0.78;

/** Deterministic little city: buildings on a jittered grid inside the disc. */
function useCity() {
  return useMemo(() => {
    let s = 20250917;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const out: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const step = 0.17;
    for (let gx = -R; gx <= R; gx += step) {
      for (let gz = -R; gz <= R; gz += step) {
        const r = Math.hypot(gx, gz);
        if (r > R - 0.1) continue;
        // a boulevard through the middle stays open
        if (Math.abs(gz) < 0.06) continue;
        if (rnd() < 0.18) continue;
        const centre = 1 - r / R;
        out.push({
          x: gx + (rnd() - 0.5) * 0.03,
          z: gz + (rnd() - 0.5) * 0.03,
          w: 0.09 + rnd() * 0.04,
          d: 0.09 + rnd() * 0.04,
          h: 0.04 + (0.1 + 0.36 * centre * centre) * (0.4 + rnd() * 0.8),
        });
      }
    }
    return out;
  }, []);
}

const PINS: [number, number][] = [
  [-0.42, 0.22],
  [0.1, -0.34],
  [0.46, 0.18],
];

function City({ accent, animate }: { accent: string; animate: boolean }) {
  const blocks = useCity();
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(accent) } },
      vertexShader: /* glsl */ `
        varying float vY;
        varying float vTop;
        void main() {
          vY = position.y + 0.5;           // unit box: 0 bottom → 1 top
          vTop = step(0.99, normal.y);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vY;
        varying float vTop;
        void main() {
          vec3 c = mix(uColor * 0.08, uColor * 0.9, pow(vY, 1.6));
          c = mix(c, uColor * 1.6, vTop);
          gl_FragColor = vec4(c, 0.88);
        }`,
      transparent: true,
    });
    m.toneMapped = false;
    return m;
  }, [accent]);
  useEffect(() => () => mat.dispose(), [mat]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    blocks.forEach((b, i) => {
      m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.h / 2, b.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks]);

  const pinMat = useGlow("#ffffff", 1.4);
  const pinAccent = useGlow(accent, 1.8);
  const discMat = useAdditive(accent, 0.12);
  const beam = useAdditive(accent, 0.06);
  const pins = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!animate || !pins.current) return;
    t.current += Math.min(dt, 1 / 30);
    pins.current.children.forEach((c, i) => {
      c.position.y = 0.52 + Math.sin(t.current * 1.3 + i * 2.1) * 0.035;
    });
  });

  // route across the three picks, a little above the rooftops
  const route: [number, number, number][] = [
    [PINS[0][0], 0.05, PINS[0][1]],
    [-0.18, 0.05, 0.0],
    [PINS[1][0], 0.05, PINS[1][1]],
    [0.32, 0.05, -0.05],
    [PINS[2][0], 0.05, PINS[2][1]],
  ];

  return (
    <group>
      {/* projector pedestal + beam */}
      <group position={[C.x, 0, C.z]}>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.22, 0.32, 0.6, 32]} />
          <meshStandardMaterial color="#3d3858" emissive="#1c1636" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.605, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.12, 0.2, 40]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.89, 0]} material={beam}>
          <cylinderGeometry args={[R * 0.95, 0.16, 0.56, 40, 1, true]} />
        </mesh>
      </group>
      <Spin speed={0.07} animate={animate} position={[C.x, C.y, C.z]}>
        {/* disc: faint fill + rim */}
        <mesh rotation-x={-Math.PI / 2} material={discMat}>
          <circleGeometry args={[R, 64]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.002}>
          <ringGeometry args={[R - 0.012, R + 0.01, 96]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <instancedMesh ref={ref} args={[undefined, mat, blocks.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
        <FlowTube points={route.map(([x, , z]) => [x, 0.55, z])} color="#ffffff" radius={0.008} speed={0.5} dashes={8} animate={animate} />
        <group ref={pins}>
          {PINS.map(([x, z], i) => (
            <group key={i} position={[x, 0.52, z]}>
              <mesh position={[0, 0.07, 0]} material={i === 1 ? pinMat : pinAccent}>
                <sphereGeometry args={[0.045, 16, 16]} />
              </mesh>
              <mesh rotation-x={Math.PI} material={i === 1 ? pinMat : pinAccent}>
                <coneGeometry args={[0.033, 0.09, 16]} />
              </mesh>
              {/* drop line to the street */}
              <mesh position={[0, -0.24, 0]}>
                <cylinderGeometry args={[0.003, 0.003, 0.5, 6]} />
                <meshBasicMaterial color={accent} transparent opacity={0.6} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      </Spin>
    </group>
  );
}

function useChatPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono, sans } = fonts();
      const pad = 34;
      ctx.fillStyle = accent;
      ctx.font = `600 24px ${mono}`;
      ctx.textAlign = "left";
      ctx.fillText("CONCIERGE", pad, 58);
      // user bubble (right)
      ctx.font = `500 28px ${sans}`;
      const q = "Quiet café for a meeting, near me?";
      ctx.fillStyle = "rgba(244,241,234,0.12)";
      roundRect(ctx, pad + 40, 84, w - pad * 2 - 40, 110, 18);
      ctx.fill();
      ctx.fillStyle = INK;
      wrapText(ctx, q, pad + 62, 128, w - pad * 2 - 84, 36);
      // assistant bubble (left, accent)
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      roundRect(ctx, pad, 214, w - pad * 2 - 40, 150, 18);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      wrapText(ctx, "3 spots within 400 m. Kin Coffee is quietest right now — pinned.", pad + 22, 258, w - pad * 2 - 84, 36);
      ctx.fillStyle = "rgba(244,241,234,0.55)";
      ctx.font = `500 20px ${mono}`;
      ctx.fillText("● LIVE · GEO + AGENT", pad, h - 30);
    },
    [accent],
  );
}

export default function NuremiRoom({ accent, animate }: { accent: string; animate: boolean }) {
  const chat = useChatPainter(accent);
  return (
    <group>
      <City accent={accent} animate={animate} />
      {/* chat card in the clear right lane beyond the info panel */}
      <group position={[3.42, 1.5, 1.62]} rotation-y={-0.62}>
        <Board w={0.95} h={0.84} res={512} paint={chat} accent={accent} />
      </group>
    </group>
  );
}
