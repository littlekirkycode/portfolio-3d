"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollRefs, pointerRefs } from "@/lib/scrollStore";
import { HALF_W, WALL_H, END_VISUAL_X } from "./hallConfig";
import { backgroundVertex, backgroundFragment } from "./shaders";

/** Ceiling light fixture X positions (warm point lights for real illumination). */
const FIXTURES = [10, 40, 70, 100, 130, 158];

const END_X = END_VISUAL_X + 8;

/** The payoff at the end of the hall: an observation bridge looking out onto a
 *  drifting nebula (mounts the unused background shader), framed by sci-fi
 *  mullions, with a low lit console for foreground depth. */
function Bridge() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uProgress: { value: 0 }, uVelocity: { value: 0 }, uMouse: { value: new THREE.Vector2() } }),
    [],
  );
  useFrame((_, rawDt) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uTime.value += Math.min(rawDt, 1 / 30);
    m.uniforms.uProgress.value = scrollRefs.progress;
    m.uniforms.uVelocity.value = Math.min(Math.abs(scrollRefs.velocity) * 0.02, 1.5);
    (m.uniforms.uMouse.value as THREE.Vector2).set(pointerRefs.x, pointerRefs.y);
  });
  const winW = HALF_W * 2 * 0.82;
  const winH = (WALL_H - 0.4) * 0.82;
  const cy = WALL_H / 2 + 0.1;
  return (
    <group>
      {/* dark surround */}
      <mesh position={[END_X, WALL_H / 2, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[HALF_W * 2 + 0.4, WALL_H]} />
        <meshStandardMaterial color="#090911" roughness={1} />
      </mesh>
      {/* nebula observation window */}
      <mesh position={[END_X - 0.06, cy, 0]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[winW, winH]} />
        <shaderMaterial ref={matRef} vertexShader={backgroundVertex} fragmentShader={backgroundFragment} uniforms={uniforms} toneMapped={false} />
      </mesh>
      {/* vertical mullions */}
      {[-2.0, -0.67, 0.67, 2.0].map((zz, i) => (
        <mesh key={`v${i}`} position={[END_X - 0.09, cy, zz]}>
          <boxGeometry args={[0.08, winH, 0.08]} />
          <meshStandardMaterial color="#06060e" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      {/* horizontal mullions */}
      {[cy - winH / 3, cy + winH / 3].map((yy, i) => (
        <mesh key={`h${i}`} position={[END_X - 0.09, yy, 0]}>
          <boxGeometry args={[0.08, 0.08, winW]} />
          <meshStandardMaterial color="#06060e" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      {/* low console + glowing rail (foreground depth) */}
      <mesh position={[END_X - 1.1, 0.55, 0]}>
        <boxGeometry args={[0.5, 1.1, HALF_W * 2 - 1.2]} />
        <meshStandardMaterial color="#0c0d16" roughness={0.5} metalness={0.45} />
      </mesh>
      <mesh position={[END_X - 1.1, 1.13, 0]}>
        <boxGeometry args={[0.54, 0.05, HALF_W * 2 - 1.2]} />
        <meshBasicMaterial color="#bcd4ff" toneMapped={false} />
      </mesh>
      {/* cool spill back toward the camera */}
      <pointLight position={[END_X - 2.6, 1.8, 0]} color="#bcd4ff" intensity={22} distance={26} decay={2} />
    </group>
  );
}

/**
 * Corridor lighting + atmosphere: continuous emissive ceiling line, low warm
 * fixtures, the directional floor path, drifting motes (mounted in Scene), and
 * the observation-bridge payoff at the end. Geometry shell is in <KitShell/>.
 */
export default function Corridor() {
  return (
    <group>
      {/* Continuous emissive ceiling strip (the one clean light line up top) */}
      <mesh rotation-x={Math.PI / 2} position={[(END_X) / 2, WALL_H - 0.05, 0]}>
        <planeGeometry args={[END_X + 30, 0.5]} />
        <meshBasicMaterial color="#dfeaff" toneMapped={false} />
      </mesh>

      {/* Warm corridor lights — mounted LOW so they light floor/walls, not the roof */}
      {FIXTURES.map((x) => (
        <pointLight key={x} position={[x, 2.3, 0]} color="#fff0dc" intensity={10} distance={18} decay={2} />
      ))}

      <Bridge />
    </group>
  );
}
