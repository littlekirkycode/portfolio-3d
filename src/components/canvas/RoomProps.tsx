"use client";

import { useMemo, type ReactNode } from "react";
import type * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { RoomTheme } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import { Bob, Model, SpinY } from "./ModelLoader";

/**
 * Each bay is composed (not just dressed) with a small set of low-poly props that
 * evoke its specific app, with deliberate art direction:
 *  - large objects (treadmill, desk, tower) are ANCHORED to the back/sides,
 *    angled so their profile faces the opening — never floating mid-floor;
 *  - small "showcase" objects (globe, ring, gem, trophy, drone) sit ELEVATED on a
 *    display plinth; a room uses ONE display language (e.g. jewellery = every piece
 *    on its own plinth, never some on the floor);
 *  - flat floating objects BOB (they'd vanish edge-on if spun);
 *  - everything rests cleanly on the now-flush accent mat.
 * Local origin = niche floor 1.55 in front of the back wall; +Z = toward the
 * opening/camera; back wall at z ≈ -1.55.
 * OCCLUSION BAND: the floating info panel (x=1.55, local z≈+0.95, 3.2×2.62) covers
 * x∈[0, 3.15] from the head-on camera — props taller than ~0.5 there hide behind it
 * (z < +0.9) or block its text (z > +0.9). Tall props live at x<0 or x>3.3, small
 * floor items (≤~0.5) may sit under its bottom edge. The hero screen spans
 * x∈[-3.1, 0] on the back wall — nothing taller than ~1.0 directly in front of it.
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

/** The drone GLB is a fully SKINNED rig (every mesh is armature-driven), and
 *  <Model>'s scene.clone(true) detaches skinned meshes from their skeleton — the
 *  clone renders collapsed/invisible (the "empty pedestal" bug). The drone is
 *  used exactly once in the app, so mount the cached scene directly (no clone)
 *  and normalise by hand from its measured rest-pose bounds:
 *  size 1.29 × 0.77 × 0.67, min-y 0.105, centre-z 0.103. */
function DroneShowcase() {
  const { scene } = useGLTF(withBase("/models/drone.glb"));
  const s = 0.95 / 1.29; // largest dim → 0.95, hero-but-not-oversized
  // hover: bottom edge floats 0.35 above the plinth top; recentre x/z drift
  return (
    <group scale={s} position={[0, 0.35 - 0.105 * s, -0.103 * s]}>
      <primitive object={scene} />
    </group>
  );
}

/** Experience hero: company tower on its pedestal. The kit tower ships an UNLIT
 *  "window" material, so under the moody corridor light it reads as a featureless
 *  slab — give the shared material a soft emissive (the clone inside <Model>
 *  reuses the same material instance) so the facade reads as occupied floors,
 *  plus an accent base plate + roof beacon for silhouette interest as it spins. */
function TowerShowcase({ accent, animate }: { accent: string; animate: boolean }) {
  const { scene } = useGLTF(withBase("/models/skyscraper.glb"));
  useMemo(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.name === "window" && std.emissive) {
          std.emissive.set("#7fb0e8");
          std.emissiveIntensity = 0.55;
        }
      }
    });
  }, [scene]);
  return (
    <Plinth h={0.9} x={-2.7} z={1.1}>
      <SpinY speed={0.25} animate={animate}>
        <Model name="skyscraper" height={1.1} rotation={[0, d2r(18), 0]} />
      </SpinY>
      {/* accent base plate under the tower + tiny roof beacon */}
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.03, 24]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.14, 0]}>
        <sphereGeometry args={[0.022, 12, 12]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </Plinth>
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
    case "gym": // SelfQuest — hero treadmill anchored LEFT (clear of the info panel), weights corner front-right
      return (
        <group>
          {/* left of the panel band, near-profile: at 38°/3.2 the tall console
              arm crossed the phone's left bezel from the dwell camera, so it is
              slightly smaller, more side-on and pulled further left/forward */}
          <Model name="treadmill" maxDim={2.7} position={[-2.75, 0, 0.5]} rotation={[0, d2r(20), 0]} />
          {/* deliberate "weights corner": short items grouped under the panel's
              bottom edge, all pulled fully INSIDE the mat rim (x ≤ 2.2, z ≤ 1.95)
              so nothing straddles the glowing edge */}
          <Model name="kettlebell" height={0.6} position={[1.1, 0, 1.7]} rotation={[0, d2r(28), 0]} />
          <Model name="dumbbell" maxDim={0.7} position={[1.7, 0, 1.55]} rotation={[0, d2r(74), 0]} />
          <Model name="dumbbell" maxDim={0.5} position={[1.45, 0, 1.15]} rotation={[0, d2r(-12), 0]} />
        </group>
      );

    case "skills": // Capabilities — a real workstation, back-left so the code terminal + panel stay clear
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
          <Model name="plant" height={0.7} position={[-3.0, 0, 0.1]} rotation={[0, d2r(-40), 0]} />
        </group>
      );

    case "lifeos": // SelfAware — tidy workstation in the back-left corner; robot greets from the front-left corner
      return (
        <group>
          <Model name="deskq" height={0.78} position={[-2.5, 0, -0.7]} rotation={[0, d2r(30), 0]} />
          <Model name="monitor" height={0.36} position={[-2.55, 0.78, -0.8]} rotation={[0, d2r(30), 0]} />
          {/* this room's phone runs floor-to-top, so the robot must clear the
              WHOLE phone band in screen space AND the desk cluster behind it —
              it stands well left + forward, turned toward the centre */}
          <Model name="robot" height={1.3} position={[-2.95, 0, 1.9]} rotation={[0, d2r(-25), 0]} />
          {/* small floor plant fills the otherwise-dead strip between the phone
              and the info panel (short enough to duck under both) */}
          <Model name="plant" height={0.4} position={[-0.25, 0, 1.05]} rotation={[0, d2r(70), 0]} />
        </group>
      );

    case "experience": // founder workstation hugging the RIGHT wall (peeks past the timeline panel) + company tower left-front
      return (
        <group>
          <Model name="deskq" height={0.78} position={[3.3, 0, 0.55]} rotation={[0, d2r(-64), 0]} />
          <Model name="monitor" height={0.34} position={[3.36, 0.78, 0.5]} rotation={[0, d2r(-64), 0]} />
          <Model name="officechair" height={1.05} position={[3.5, 0, 1.35]} rotation={[0, d2r(-128), 0]} />
          {/* left-FRONT, away from the screen light + accent hotspot so the tower
              reads as lit steel with glowing windows, not a blown-out column */}
          <TowerShowcase accent={accent} animate={animate} />
        </group>
      );

    case "map": // Nuremi — hero-scale globe beside the phone + compass raised to a low plinth
      return (
        <group>
          {/* as big as the lane between the phone's right bezel and the glass
              panel's left edge allows from the dwell camera — wider would clip
              one or the other. Pulled left+forward so the panel's left border
              grazes the sphere's edge instead of slicing the pedestal (border
              at world x=0; globe right edge lands ≈ screen-x 0 from the dwell). */}
          <Plinth h={0.9} x={-0.35} z={-0.85}>
            <SpinY speed={0.25} animate={animate}>
              <Model name="globe" height={1.35} />
            </SpinY>
          </Plinth>
          {/* on a low plinth so it reads (invisible flat on the floor); centre
              floor stays clear for the map mat */}
          <Plinth h={0.5} x={-1.9} z={1.5}>
            <Model name="compass" maxDim={0.5} rotation={[0, d2r(-28), 0]} />
          </Plinth>
        </group>
      );

    case "trophy": // Milestones — podium hero fully LEFT of the hero card; sports cup centred on the gold mat
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
              <Plinth h={1.15}>
                <Model name="trophy" height={0.95} />
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
            <Model name="sportstrophy" height={0.62} position={[0, 0.26, 0]} rotation={[0, d2r(24), 0]} />
          </group>
        </group>
      );

    case "defence": // Allied — hovering drone patrol over the cargo corner + CAD bench on the right wall
      return (
        <group>
          {/* drone showcase LEFT of the blueprint screen's rays — a visible
              drone at the old room-centre spot would clip the screen's right
              edge from the dwell camera (hover offset is baked into
              DroneShowcase; slow bob so it reads as flying) */}
          <Plinth h={1.05} x={-2.65} z={0.95}>
            <Bob amp={0.06} speed={1.2} animate={animate}>
              <SpinY speed={0.3} animate={animate}>
                <DroneShowcase />
              </SpinY>
            </Bob>
          </Plinth>
          <Model name="deskq" height={0.78} position={[3.3, 0, 0.2]} rotation={[0, d2r(-70), 0]} />
          <Model name="monitor" height={0.36} position={[3.36, 0.78, 0.15]} rotation={[0, d2r(-70), 0]} />
          {/* small accent indicator light sitting on the desk */}
          <mesh position={[3.35, 0.82, 0.55]}>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          {/* stacked cargo corner — now the BACKDROP behind the drone showcase;
              varied sizes/rotations, lifted a few steps brighter so the crates
              and the accent edge strips actually read against the dark wall */}
          <group position={[-3.35, 0, -0.3]} rotation={[0, 0.12, 0]}>
            <mesh position={[0, 0.39, 0]}>
              <boxGeometry args={[0.78, 0.78, 0.78]} />
              <meshStandardMaterial color="#756b60" roughness={0.8} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.7, 0.4]}>
              <boxGeometry args={[0.8, 0.035, 0.035]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
            <mesh position={[0.4, 0.45, 0.4]}>
              <boxGeometry args={[0.035, 0.55, 0.035]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          </group>
          <mesh position={[-3.25, 1.06, -0.4]} rotation={[0, 0.5, 0]}>
            <boxGeometry args={[0.55, 0.55, 0.55]} />
            <meshStandardMaterial color="#695f55" roughness={0.8} metalness={0.2} />
          </mesh>
          <mesh position={[-2.7, 0.21, -0.85]} rotation={[0, -0.35, 0]}>
            <boxGeometry args={[0.42, 0.42, 0.42]} />
            <meshStandardMaterial color="#7a6f62" roughness={0.8} metalness={0.2} />
          </mesh>
        </group>
      );

    case "habit": // SelfGrow — plants arc left-to-centre (tallest back-left) + one far-right so no dead third
      return (
        <group>
          <Model name="plant" height={1.45} position={[-3.3, 0, -0.9]} rotation={[0, d2r(25), 0]} />
          {/* pulled left + trimmed so its top leaf clears the phone's
              bottom-left corner from the dwell camera */}
          <Model name="plant" height={0.85} position={[-2.4, 0, 0.35]} rotation={[0, d2r(-60), 0]} />
          <Model name="plant" height={0.5} position={[-0.6, 0, 0.95]} rotation={[0, d2r(140), 0]} />
          <Model name="wateringcan" height={0.36} position={[-1.2, 0, 1.45]} rotation={[0, d2r(55), 0]} />
          {/* beyond the panel's right edge so the right third isn't empty */}
          <Model name="plant" height={0.45} position={[3.4, 0, 1.2]} rotation={[0, d2r(80), 0]} />
        </group>
      );

    case "jewellery": // Xuabelle — three-plinth boutique triangle; hero ring spins, necklace drapes flat
      return (
        <group>
          <Plinth h={1.2} x={0} z={-0.85}>
            <SpinY speed={0.7} animate={animate}>
              <Model name="ring" maxDim={0.5} />
            </SpinY>
          </Plinth>
          {/* upZ lays the flat model face-up BEFORE the bbox pass, so it floors
              cleanly on the plinth top instead of standing edge-on mid-air */}
          <Plinth h={0.85} x={-1.35} z={0.35}>
            <Model name="necklace" maxDim={0.5} upZ rotation={[0, d2r(30), 0]} />
          </Plinth>
          {/* beyond the panel's right edge — pulled forward so even the panel's
              rounded border line clears the plinth silhouette */}
          <Plinth h={0.85} x={3.55} z={1.75}>
            <SpinY speed={0.35} animate={animate}>
              <Model name="gem" maxDim={0.4} rotation={[0, d2r(-32), 0]} />
            </SpinY>
          </Plinth>
        </group>
      );

    default:
      return null;
  }
}
