"use client";

import { Model } from "../ModelLoader";
import { d2r, type BayProps } from "./shared";
import CapabilitiesRoom from "./CapabilitiesRoom";

/** Capabilities bay — the complete room composition (installation + props).
 *  Capabilities — a real workstation, back-left so the code terminal + panel stay clear */
export default function CapabilitiesBay({ accent }: BayProps) {
  return (
      <group>
        <Model name="deskq" height={0.78} position={[-1.6, 0, -0.4]} rotation={[0, d2r(15), 0]} />
        <Model name="laptop" maxDim={0.44} position={[-1.95, 0.78, -0.5]} rotation={[0, d2r(32), 0]} />
        <Model name="monitor" height={0.36} position={[-1.25, 0.78, -0.55]} rotation={[0, d2r(4), 0]} />
        {/* faint powered-on glow so the desk screens don't read as dead slabs
            next to the lit wall terminal (emissive planes, no extra lights) */}
        <group position={[-1.25, 0.78, -0.55]} rotation={[0, d2r(4), 0]}>
          <mesh position={[0, 0.2, 0.075]}>
            <planeGeometry args={[0.38, 0.2]} />
            <meshStandardMaterial color="#06090d" emissive={accent} emissiveIntensity={0.55} roughness={1} />
          </mesh>
        </group>
        <group position={[-1.95, 0.78, -0.5]} rotation={[0, d2r(32), 0]}>
          <mesh position={[0, 0.16, -0.06]} rotation={[d2r(-14), 0, 0]}>
            <planeGeometry args={[0.26, 0.15]} />
            <meshStandardMaterial color="#06090d" emissive={accent} emissiveIntensity={0.45} roughness={1} />
          </mesh>
        </group>
        <Model name="officechair" height={1.05} position={[-1.55, 0, 0.45]} rotation={[0, d2r(168), 0]} />
        {/* the stack as racked hardware along the left wall */}
        <CapabilitiesRoom />
      </group>
  );
}
