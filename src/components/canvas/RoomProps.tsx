"use client";

import type { ReactNode } from "react";
import type { RoomTheme } from "@/lib/constants";
import { Model, SpinY } from "./ModelLoader";

/**
 * Each bay is composed (not just dressed) with a small set of low-poly props that
 * evoke its specific app, with deliberate art direction:
 *  - large objects (treadmill, server rack, desk) are ANCHORED to the back/sides,
 *    angled so their profile faces the opening — never floating mid-floor;
 *  - small "showcase" objects (globe, ring, gem, trophy, laptop) sit ELEVATED on a
 *    display plinth; a room uses ONE display language (e.g. jewellery = every piece
 *    on its own plinth, never some on the floor);
 *  - flat floating objects (stars, map pins) BOB (they'd vanish edge-on if spun);
 *  - everything rests cleanly on the now-flush accent mat.
 * Local origin = niche floor centre; +Z = toward the opening/camera; back wall at
 * z ≈ -1.55. The back-left hero screen and front-right floating info stay clear.
 */

const d2r = (deg: number) => (deg * Math.PI) / 180;

/** A display pedestal (height `h`); its child sits on top. */
function Plinth({
  h = 1.1,
  x = 0,
  z = 0,
  children,
}: {
  h?: number;
  x?: number;
  z?: number;
  children: ReactNode;
}) {
  return (
    <group position={[x, 0, z]}>
      <Model name="pedestal" height={h} />
      <group position={[0, h + 0.02, 0]}>{children}</group>
    </group>
  );
}

export default function RoomProps({
  theme,
  accent,
  animate,
}: {
  theme: RoomTheme;
  accent: string;
  animate: boolean;
}) {
  switch (theme) {
    case "gym": // SelfQuest — treadmill hero anchored back-right, weights grounded front-left
      return (
        <group>
          <Model name="treadmill" maxDim={3.0} position={[1.55, 0, -0.95]} rotation={[0, d2r(-52), 0]} />
          <Model name="kettlebell" height={0.6} position={[-1.45, 0, 0.55]} rotation={[0, d2r(28), 0]} />
          <Model name="dumbbell" maxDim={0.7} position={[-0.65, 0, 1.05]} rotation={[0, d2r(74), 0]} />
        </group>
      );

    case "skills": // Capabilities — a developer's desk under the big code terminal
      return (
        <group>
          <Model name="deskq" height={0.78} position={[-0.1, 0, -0.45]} rotation={[0, d2r(4), 0]} />
          <Model name="laptop" maxDim={0.44} position={[-0.5, 0.78, -0.5]} rotation={[0, d2r(22), 0]} />
          <Model name="monitor" height={0.36} position={[0.4, 0.78, -0.55]} rotation={[0, d2r(-18), 0]} />
        </group>
      );

    case "lifeos": // SelfAware — workstation: desk on left wall, monitor ON desk, robot beside it
      return (
        <group>
          <Model name="deskq" height={0.78} position={[-2.35, 0, 0.25]} rotation={[0, d2r(62), 0]} />
          <Model name="monitor" height={0.36} position={[-2.45, 0.78, 0.05]} rotation={[0, d2r(62), 0]} />
          <Model name="robot" height={1.5} position={[-0.55, 0, -0.35]} rotation={[0, d2r(-38), 0]} />
        </group>
      );

    case "experience": // tidy founder workstation right-back + elevated company tower (timeline is the hero)
      return (
        <group>
          <Model name="deskq" height={0.78} position={[2.45, 0, -0.65]} rotation={[0, d2r(-58), 0]} />
          <Model name="monitor" height={0.34} position={[2.55, 0.78, -0.8]} rotation={[0, d2r(-58), 0]} />
          <Model name="officechair" height={1.05} position={[2.2, 0, 0.2]} rotation={[0, d2r(122), 0]} />
          <Plinth h={0.9} x={-1.5} z={-0.85}>
            <SpinY speed={0.25} animate={animate}>
              <Model name="skyscraper" height={0.95} rotation={[0, d2r(18), 0]} />
            </SpinY>
          </Plinth>
        </group>
      );

    case "map": // Nuremi — globe hero on a plinth over the map floor + grounded compass
      return (
        <group>
          <Plinth h={1.1} x={0.2} z={-0.6}>
            <SpinY speed={0.25} animate={animate}>
              <Model name="globe" height={0.82} />
            </SpinY>
          </Plinth>
          <Model name="compass" maxDim={0.44} position={[-1.55, 0, 1.2]} rotation={[0, d2r(-28), 0]} />
        </group>
      );

    case "trophy": // Milestones — both cups elevated on plinths (varied heights)
      return (
        <group>
          <Plinth h={1.15} x={-0.3} z={-0.65}>
            <Model name="trophy" height={0.95} />
          </Plinth>
          <Plinth h={0.75} x={1.4} z={-0.4}>
            <Model name="sportstrophy" height={0.62} rotation={[0, d2r(-24), 0]} />
          </Plinth>
        </group>
      );

    case "defence": // Allied — slow-spinning drone hero on a plinth + a CAD bench + crates
      return (
        <group>
          <Plinth h={1.0} x={-0.1} z={-0.45}>
            <SpinY speed={0.3} animate={animate}>
              <Model name="drone" maxDim={1.05} onFloor={false} />
            </SpinY>
          </Plinth>
          <Model name="deskq" height={0.78} position={[1.75, 0, -0.4]} rotation={[0, d2r(-34), 0]} />
          <Model name="monitor" height={0.36} position={[1.75, 0.78, -0.55]} rotation={[0, d2r(-34), 0]} />
          <mesh position={[-2.35, 0.31, -0.2]}>
            <boxGeometry args={[0.72, 0.62, 0.72]} />
            <meshStandardMaterial color="#565660" roughness={0.8} metalness={0.35} />
          </mesh>
          <mesh position={[-2.25, 0.87, 0.05]} rotation={[0, 0.3, 0]}>
            <boxGeometry args={[0.56, 0.5, 0.56]} />
            <meshStandardMaterial color="#5e5e68" roughness={0.8} metalness={0.35} />
          </mesh>
          <mesh position={[1.45, 1.05, -0.2]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        </group>
      );

    case "habit": // SelfGrow — three plants stair-stepped (sprout → grown) + watering can
      return (
        <group>
          <Model name="plant" height={1.45} position={[0.55, 0, -0.95]} rotation={[0, d2r(25), 0]} />
          <Model name="plant" height={0.95} position={[-0.95, 0, 0.25]} rotation={[0, d2r(-60), 0]} />
          <Model name="plant" height={0.5} position={[0.2, 0, 0.95]} rotation={[0, d2r(140), 0]} />
          <Model name="wateringcan" height={0.36} position={[-0.45, 0, 1.0]} rotation={[0, d2r(55), 0]} />
        </group>
      );

    case "jewellery": // Xuabelle — three-plinth boutique triangle; hero ring spins under glass
      return (
        <group>
          <Plinth h={1.2} x={0} z={-0.85}>
            <SpinY speed={0.7} animate={animate}>
              <Model name="ring" maxDim={0.34} />
            </SpinY>
            <mesh position={[0, 0.34, 0]}>
              <boxGeometry args={[0.62, 0.8, 0.62]} />
              <meshStandardMaterial color={accent} transparent opacity={0.07} roughness={0.1} metalness={0.9} />
            </mesh>
          </Plinth>
          <Plinth h={0.85} x={-1.35} z={0.35}>
            <Model name="necklace" maxDim={0.46} rotation={[0, d2r(32), 0]} />
          </Plinth>
          <Plinth h={0.85} x={1.35} z={0.35}>
            <Model name="gem" maxDim={0.4} rotation={[0, d2r(-32), 0]} />
          </Plinth>
        </group>
      );

    default:
      return null;
  }
}
