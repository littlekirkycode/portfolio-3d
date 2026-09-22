"use client";

import { Model } from "../ModelLoader";
import { GymDeck } from "../bayFloors";
import { d2r, type BayProps } from "./shared";
import SelfQuestRoom from "./SelfQuestRoom";

/** SelfQuest bay — the complete room composition (installation + props).
 *  SelfQuest — a FITTED-OUT ship gym, not a bay with weights in it: rubber-tile deck bordering the mat, mirrored wall + light rail on the right side wall, wall rack with parked dumbbells, bench in the training ring, suspension rings at the frame edge. (First room = the fit-out bar.) */
export default function SelfQuestBay({ accent, animate }: BayProps) {
  return (
      <group>
        {/* rubber-tile deck: grid ring AROUND the mat (centre cleared so the
            accent platform stays the hero) */}
        <GymDeck accent={accent} />

        {/* mirrored right side wall: glossy black slab + accent light rail.
            No env map — it reads as a mirror by catching the bay light. */}
        <group position={[3.96, 0, 0.45]} rotation-y={-Math.PI / 2}>
          <mesh position={[0, 1.55, 0]}>
            <planeGeometry args={[3.4, 1.9]} />
            <meshStandardMaterial color="#11141f" roughness={0.08} metalness={1} />
          </mesh>
          {/* sheen band so the slab reads as glass, not painted wall */}
          <mesh position={[-0.5, 1.7, 0.005]} rotation-z={d2r(18)}>
            <planeGeometry args={[0.5, 2.1]} />
            <meshBasicMaterial color="#3a4460" transparent opacity={0.35} toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh position={[0, 2.56, 0.02]}>
            <boxGeometry args={[3.4, 0.07, 0.05]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.56, 0.02]}>
            <boxGeometry args={[3.4, 0.04, 0.04]} />
            <meshBasicMaterial color={accent} transparent opacity={0.55} toneMapped={false} />
          </mesh>
        </group>

        {/* back-wall rack RIGHT of the hero screen — in the dwell camera's
            view beside the info panel's edge (the side wall reads as outside
            the frame: QA "these aren't inside the room") */}
        <group position={[3.35, 0, -1.38]}>
          {([1.04, 0.68] as const).map((y) => (
            <mesh key={y} position={[0, y, 0.08]}>
              <boxGeometry args={[1.5, 0.06, 0.14]} />
              <meshStandardMaterial color="#191d29" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
          <Model name="dumbbell" maxDim={0.5} position={[-0.32, 1.07, 0.1]} rotation={[0, d2r(4), 0]} />
          <Model name="dumbbell" maxDim={0.42} position={[0.3, 0.71, 0.1]} rotation={[0, d2r(-6), 0]} />
        </group>

        {/* heavy bag hanging in the back-right corner, clear of the panel's
            right edge */}
        <group position={[3.5, 0, -0.7]}>
          <mesh position={[0, 3.2, 0]}>
            <boxGeometry args={[0.05, 1.6, 0.05]} />
            <meshStandardMaterial color="#2b3040" roughness={0.6} />
          </mesh>
          <Model name="punchingbag" height={1.25} position={[0, 1.15, 0]} rotation={[0, d2r(30), 0]} />
        </group>

        {/* exercise bike right-front, in the clear lane past the panel band
            (the left flank belongs to the treadmill — parking it there
            interpenetrated the deck: QA "bike and treadmill overlap") */}
        <Model name="gymbike" height={1.15} position={[3.55, 0, 1.6]} rotation={[0, d2r(-55), 0]} />

        {/* real bench at the training ring's edge + barbell resting across
            the ring floor */}
        <Model name="gymbench" maxDim={1.15} position={[1.9, 0, 1.25]} rotation={[0, d2r(78), 0]} />
        <Model name="barbell" maxDim={1.6} position={[1.25, 0, 0.95]} rotation={[0, d2r(-18), 0]} />
        {/* left of the panel band, near-profile: at 38°/3.2 the tall console
            arm crossed the phone's left bezel from the dwell camera, so it is
            slightly smaller, more side-on and pulled further left/forward */}
        <Model name="treadmill" maxDim={2.7} position={[-2.75, 0, 0.5]} rotation={[0, d2r(20), 0]} />
        {/* powered-on console strip floating just over the treadmill's head
            unit — the machine read as a dead black slab under bay light
            (same trick as the skills desk screens: emissive quad, no light) */}
        <group position={[-3.3, 1.32, 0.35]} rotation={[d2r(-15), d2r(20), 0]}>
          <mesh>
            <planeGeometry args={[0.55, 0.13]} />
            <meshStandardMaterial color="#06090d" emissive={accent} emissiveIntensity={0.6} roughness={1} />
          </mesh>
        </group>
        {/* deliberate "weights corner": short items grouped under the panel's
            bottom edge, all pulled fully INSIDE the mat rim (x ≤ 2.2, z ≤ 1.95)
            so nothing straddles the glowing edge */}
        <Model name="kettlebell" height={0.6} position={[0.75, 0, 1.6]} rotation={[0, d2r(28), 0]} />
        <Model name="dumbbell" maxDim={0.7} position={[1.15, 0, 1.85]} rotation={[0, d2r(74), 0]} />
        {/* the game layer: quest board + XP payouts */}
        <SelfQuestRoom accent={accent} animate={animate} />
      </group>
  );
}
