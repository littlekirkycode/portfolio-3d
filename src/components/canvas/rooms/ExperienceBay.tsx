"use client";

import { Bob, Model, SpinY } from "../ModelLoader";
import { d2r, type BayProps } from "./shared";
import ExperienceRoom from "./ExperienceRoom";

/** Experience bay — the complete room composition (installation + props).
 *  the career as a rising staircase, the founder's ship circling above it */
export default function ExperienceBay({ accent, animate, mobile }: BayProps) {
  return (
      <group>
        {/* portrait stacks the timeline panel over the front floor, where
            the staircase lives — it would cover the list it illustrates */}
        {!mobile && <ExperienceRoom accent={accent} animate={animate} />}
        <group position={[-2.7, 0, 1.0]}>
          <Bob amp={0.07} speed={1.1} animate={animate}>
            <group position={[0, 2.35, 0]}>
              <SpinY speed={0.35} animate={animate}>
                <Model name="spaceship" maxDim={0.62} onFloor={false} rotation={[0, 0, d2r(-6)]} />
                <mesh position={[0, 0.02, -0.27]}>
                  <sphereGeometry args={[0.035, 10, 10]} />
                  <meshBasicMaterial color={accent} toneMapped={false} />
                </mesh>
              </SpinY>
            </group>
          </Bob>
        </group>
      </group>
  );
}
