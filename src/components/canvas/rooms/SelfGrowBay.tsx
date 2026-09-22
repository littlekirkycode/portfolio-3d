"use client";

import * as THREE from "three";
import { Model } from "../ModelLoader";
import { getPuckTex, d2r, type BayProps } from "./shared";
import SelfGrowRoom from "./SelfGrowRoom";

/** SelfGrow bay — the complete room composition (installation + props).
 *  SelfGrow — plants arc left-to-centre (tallest back-left) + one far-right so no dead third */
export default function SelfGrowBay({ accent }: BayProps) {
  return (
      <group>
        <Model name="plant" height={1.45} position={[-3.3, 0, 1.7]} rotation={[0, d2r(25), 0]} />
        {/* hanging grow-lamp over the tall back-left plant: rod from the bay
            ceiling (local y 4), cone shade, warm emissive face + a soft warm
            pool on the foliage below — a nurture beat, no real light added */}
        <group position={[-3.3, 0, 1.7]}>
          <mesh position={[0, 3.32, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1.36, 8]} />
            <meshStandardMaterial color="#171a24" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[0, 2.56, 0]}>
            <coneGeometry args={[0.22, 0.18, 20, 1, true]} />
            <meshStandardMaterial color="#1b1e2a" roughness={0.5} metalness={0.55} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 2.47, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.16, 20]} />
            <meshBasicMaterial color="#ffd9a0" toneMapped={false} side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, 1.62, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.0, 1.0]} />
            <meshBasicMaterial
              map={getPuckTex()}
              color="#ffbe8a"
              transparent
              opacity={0.16}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
        {/* pulled left + trimmed so its top leaf clears the phone's
            bottom-left corner from the dwell camera */}
        <Model name="plant" height={0.85} position={[-2.4, 0, 0.35]} rotation={[0, d2r(-60), 0]} />
        {/* two-tier planter bench at the growth path's end — the streak
            made physical: the small plant graduates onto the top step.
            Low (≤0.6 + plant 0.5) so it ducks the panel's bottom edge */}
        <group position={[-0.35, 0, 1.05]} rotation={[0, d2r(-12), 0]}>
          <mesh position={[-0.34, 0.11, 0]}>
            <boxGeometry args={[0.62, 0.22, 0.6]} />
            <meshStandardMaterial color="#20242f" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0.34, 0.2, 0]}>
            <boxGeometry args={[0.62, 0.4, 0.6]} />
            <meshStandardMaterial color="#252a37" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.415, 0.26]}>
            <boxGeometry args={[1.3, 0.03, 0.04]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <Model name="plant" height={0.34} position={[-0.34, 0.22, 0]} rotation={[0, d2r(40), 0]} />
          <Model name="plant" height={0.5} position={[0.34, 0.4, 0]} rotation={[0, d2r(140), 0]} />
        </group>
        <Model name="wateringcan" height={0.36} position={[-1.8, 0, 1.85]} rotation={[0, d2r(55), 0]} />
        {/* streak wall + accountability ring */}
        <SelfGrowRoom accent={accent} />
        {/* beyond the panel's right edge so the right third isn't empty */}
        <Model name="plant" height={0.45} position={[3.4, 0, 1.2]} rotation={[0, d2r(80), 0]} />
      </group>
  );
}
