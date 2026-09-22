"use client";

import { type ReactNode } from "react";
import * as THREE from "three";
import type { RoomTheme } from "@/lib/constants";
import { Bob, Model, SpinY } from "./ModelLoader";
import { FloorStory, GymDeck } from "./bayFloors";
import SelfQuestRoom from "./rooms/SelfQuestRoom";
import SelfAwareRoom from "./rooms/SelfAwareRoom";
import SelfGrowRoom from "./rooms/SelfGrowRoom";
import NuremiRoom from "./rooms/NuremiRoom";
import XuabelleRoom, { Vitrine } from "./rooms/XuabelleRoom";
import CapabilitiesRoom from "./rooms/CapabilitiesRoom";
import ExperienceRoom from "./rooms/ExperienceRoom";
import AlliedRoom from "./rooms/AlliedRoom";
import MilestonesRoom from "./rooms/MilestonesRoom";

/** Shared soft radial gradient for the plinth under-glow pucks — one canvas
 *  texture for every showcase in every bay (module cache; client-only, this
 *  file only ever renders inside the ssr:false Canvas). */
let _puckTex: THREE.CanvasTexture | null = null;
function getPuckTex(): THREE.CanvasTexture {
  if (!_puckTex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.6, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    _puckTex = new THREE.CanvasTexture(c);
  }
  return _puckTex;
}

/**
 * Each bay is composed around a bespoke INSTALLATION that visualises its project
 * (./rooms/* — quest board, AI core + memory graph, streak wall, city hologram,
 * boutique vitrines, skill racks, career staircase, inspection cell, hall of
 * fame), supported by low-poly props, with deliberate art direction:
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

/* The per-theme FLOOR_ART deck markings + FloorStory/GymDeck renderers live in
 * ./bayFloors with the rest of the painted-floor system (finding 34). */


/** A display pedestal (height `h`); its child sits on top. With `accent` it
 *  gets the museum-showcase treatment: a thin emissive rim ring just under
 *  the top flare + a soft additive glow puck on the floor around the base —
 *  the bays' "this one's an exhibit" language, no extra lights. */
function Plinth({
  h = 1.1,
  x = 0,
  z = 0,
  accent,
  children,
}: {
  h?: number;
  x?: number;
  z?: number;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <group position={[x, 0, z]}>
      <Model name="pedestal" height={h} />
      {accent && (
        <>
          <mesh position={[0, h - 0.07, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.27, 0.012, 8, 40]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.15, 1.15]} />
            <meshBasicMaterial
              map={getPuckTex()}
              color={accent}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <group position={[0, h + 0.02, 0]}>{children}</group>
    </group>
  );
}

export default function RoomProps({
  theme,
  accent,
  animate,
  mobile = false,
}: {
  theme: RoomTheme;
  accent: string;
  animate: boolean;
  mobile?: boolean;
}) {
  return (
    <group>
      <FloorStory theme={theme} accent={accent} />
      <ThemeProps theme={theme} accent={accent} animate={animate} mobile={mobile} />
    </group>
  );
}

function ThemeProps({
  theme,
  accent,
  animate,
  mobile,
}: {
  theme: RoomTheme;
  accent: string;
  animate: boolean;
  mobile: boolean;
}) {
  switch (theme) {
    case "gym": // SelfQuest — a FITTED-OUT ship gym, not a bay with weights in it:
      // rubber-tile deck bordering the mat, mirrored wall + light rail on the
      // right side wall, wall rack with parked dumbbells, bench in the training
      // ring, suspension rings at the frame edge. (First room = the fit-out bar.)
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
          {/* the stack as racked hardware along the left wall */}
          <CapabilitiesRoom />
        </group>
      );

    case "lifeos": // SelfAware — the assistant itself: AI core + memory graph streaming into the phone
      return (
        <group>
          <SelfAwareRoom accent={accent} animate={animate} />
          {/* small floor plant between the phone and the info panel */}
          <Model name="plant" height={0.4} position={[-0.25, 0, 1.05]} rotation={[0, d2r(70), 0]} />
        </group>
      );

    case "experience": // the career as a rising staircase, the founder's ship circling above it
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

    case "map": // Nuremi — the product's own view as a hologram: city, picks, route + the chat that asked
      return (
        <group>
          <NuremiRoom accent={accent} animate={animate} />
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

    case "defence": // Allied — an inspection cell: machined part on a turntable + the engineer's CAD bench
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

    case "habit": // SelfGrow — plants arc left-to-centre (tallest back-left) + one far-right so no dead third
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

    case "jewellery": // Xuabelle — the boutique: every piece in its own vitrine + the storefront's lightbox
      return (
        <group>
          <XuabelleRoom accent={accent} />
          <Plinth h={1.2} x={0} z={-0.85} accent={accent}>
            <Vitrine label="N°01 · SOLITAIRE">
              <SpinY speed={0.5} animate={animate}>
                <Model name="ring" maxDim={0.42} position={[0, 0.06, 0]} />
              </SpinY>
            </Vitrine>
          </Plinth>
          {/* upZ lays the flat model face-up BEFORE the bbox pass */}
          <Plinth h={0.9} x={-2.6} z={1.5} accent={accent}>
            <Vitrine label="N°02 · RIVIÈRE">
              <Model name="necklace" maxDim={0.46} upZ rotation={[0, d2r(30), 0]} />
            </Vitrine>
          </Plinth>
          <Plinth h={0.85} x={3.5} z={1.75} accent={accent}>
            <Vitrine label="N°03 · EMERALD">
              <SpinY speed={0.35} animate={animate}>
                <Model name="gem" maxDim={0.34} position={[0, 0.08, 0]} rotation={[0, d2r(-32), 0]} />
              </SpinY>
            </Vitrine>
          </Plinth>
          <Plinth h={1.0} x={3.45} z={0.5} accent={accent}>
            <Vitrine label="N°04 · TIARA">
              <SpinY speed={0.25} animate={animate}>
                <Model name="crown" maxDim={0.38} rotation={[0, d2r(15), 0]} />
              </SpinY>
            </Vitrine>
          </Plinth>
        </group>
      );

    default:
      return null;
  }
}
