"use client";

import { Model, SpinY } from "../ModelLoader";
import { Plinth, d2r, type BayProps } from "./shared";
import MilestonesRoom from "./MilestonesRoom";

/** Milestones bay — the complete room composition (installation + props).
 *  Milestones — podium hero fully LEFT of the hero card; sports cup centred on the gold mat */
export default function MilestonesBay({ accent, animate }: BayProps) {
  return (
      <group>
        {/* the whole podium lives left of the hero card's rays (at x −0.5 the
            cup covered the end of the card's title from the dwell camera) */}
        <group position={[-2.8, 0, -0.7]}>
          {/* wide flat step under the main plinth for a podium feel */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[1.6, 0.12, 1.6]} />
            <meshStandardMaterial color="#2c2f38" roughness={0.4} metalness={0.6} />
          </mesh>
          <group position={[0, 0.12, 0]}>
            <Plinth h={1.15} accent={accent}>
              <SpinY speed={0.2} animate={animate}>
                <Model name="trophy" height={0.95} />
              </SpinY>
            </Plinth>
          </group>
        </group>
        {/* 1st/2nd/3rd mini-podium ON the gold mat — fills the circle with a
            real "wins" motif while staying LOW: anything on this centre disc
            taller than ~0.9 world units crosses the hero card (left) or info
            panel (right) in screen space from the dwell camera */}
        <group position={[-0.2, 0, 0.55]} rotation={[0, d2r(12), 0]}>
          {([[0, 0.26, 0], [-0.62, 0.17, 1], [0.62, 0.1, 2]] as const).map(([px, h, i]) => (
            <mesh key={i} position={[px, h / 2, 0]}>
              <boxGeometry args={[0.58, h, 0.58]} />
              <meshStandardMaterial color={i === 0 ? "#3a3325" : "#2c2f38"} roughness={0.45} metalness={0.6} />
            </mesh>
          ))}
          <group position={[0, 0.26, 0]}>
            <SpinY speed={0.3} animate={animate}>
              <Model name="sportstrophy" height={0.62} rotation={[0, d2r(24), 0]} />
            </SpinY>
          </group>
        </group>
        <MilestonesRoom accent={accent} />
      </group>
  );
}
