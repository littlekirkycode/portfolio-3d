"use client";

import { Model, SpinY } from "../ModelLoader";
import { d2r, type BayProps } from "./shared";
import AlliedRoom from "./AlliedRoom";

/** Allied bay — the complete room composition (installation + props).
 *  Allied — an inspection cell: machined part on a turntable + the engineer's CAD bench */
export default function AlliedBay({ accent, animate }: BayProps) {
  return (
      <group>
        <AlliedRoom accent={accent} animate={animate} />
        <Model name="deskq" height={0.78} position={[3.3, 0, 0.2]} rotation={[0, d2r(-70), 0]} />
        <Model name="monitor" height={0.36} position={[3.36, 0.78, 0.15]} rotation={[0, d2r(-70), 0]} />
        <mesh position={[3.35, 0.82, 0.55]}>
          <boxGeometry args={[0.07, 0.07, 0.07]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        {/* field radar unit beside the bench — a test article mid-inspection */}
        <group position={[3.55, 0, 1.75]}>
          <SpinY speed={0.5} animate={animate}>
            <Model name="radar" maxDim={0.85} rotation={[0, d2r(-110), 0]} />
          </SpinY>
        </group>
      </group>
  );
}
