"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { TILE, HALF_W, WALL_H, START_X, FEATURE_X, FEATURE_RECESS_DEPTH } from "./hallConfig";
import { GLOW, WARM } from "./theme";
import { useStudioEnv } from "./studioEnv";
import { box, rbox, ni, merge, doorSurface, shadeDoor, type G } from "./Airlock";

/** Half-width of the showreel recess cut — mirrors KitShell's FEATURE_CUT_HALF
 *  (3 wall-tile columns), so the jambs land exactly on the raw cut edges. */
const RECESS_HALF = TILE * 1.5;
/** Inner face of the recess back wall (kit slab at WALL_Z + depth, 0.3 thick). */
const RECESS_BACK = HALF_W + FEATURE_RECESS_DEPTH;

/** The sealed docking door sits BEHIND the camera start — looking back down the
 *  corridor reads "you just docked". (The OPENING airlock ahead is Airlock.tsx.) */
const DOOR_X = START_X - 6;

// showreel portal (same collar language as the airlock + deck gates)
const JW = 0.5; // pilaster width along the hall
const Z0 = HALF_W - 0.3; // corridor-facing face of the pilasters
const Z1 = RECESS_BACK + 0.4; // buried in the recess back wall
const CH = 0.1; // chamfer leg on the inner front edge

/* geometry helpers + the wear surface come from the shared pressure-door kit
 * (Airlock.tsx), so the showreel portal is the same authored family as the
 * airlock and the deck gates: box-projected UVs, one wear map for colour
 * variation + roughness, and the kit's vertical light falloff / worn edges. */

/** The two pilasters framing the showreel recess, the soffit hood and the sill.
 *  World-space, merged per material: paint · steel · recess. A QUIET frame:
 *  no emissive outline — continuous rim lines round the recess boxed the
 *  showreel like a UI selection rectangle and ran through the HUD rows
 *  (header at the top edge, the LOBBY label + control pill at the bottom). */
function buildPortal() {
  const paint: G[] = [];
  const steel: G[] = [];
  const recess: G[] = [];
  const DIAG = CH * Math.SQRT2;
  for (const e of [-1, 1] as const) {
    const ix = -e; // toward the recess centre
    const jx = FEATURE_X + e * RECESS_HALF;
    const xIn = jx + ix * (JW / 2);
    const xOut = jx - ix * (JW / 2);
    // body: main block + a front block stopped short of the chamfer
    paint.push(box(JW, WALL_H, Z1 - (Z0 + CH), jx, WALL_H / 2, (Z0 + CH + Z1) / 2));
    const fw = JW - CH;
    paint.push(box(fw, WALL_H, CH, (xOut + (xIn - ix * CH)) / 2, WALL_H / 2, Z0 + CH / 2));
    // 45° chamfer: a satin plate with a dark shadow channel down its middle
    // (the door family's chamfer, unlit)
    const theta = ix > 0 ? -Math.PI / 4 : (-3 * Math.PI) / 4;
    const mx = xIn - (ix * CH) / 2;
    const mz = Z0 + CH / 2;
    const inX = -ix * 0.0042; // into the solid
    const inZ = 0.0042;
    steel.push(box(DIAG, WALL_H - 0.02, 0.02, mx + inX, WALL_H / 2, mz + inZ, theta));
    recess.push(box(0.04, WALL_H - 0.6, 0.012, mx - inX * 1.2, WALL_H / 2 - 0.1, mz - inZ * 1.2, theta));
    // inner face (what frames the screen): an inset service panel with
    // fasteners, and a steel kick guard
    const faceX = xIn + ix * 0.012;
    recess.push(rbox(0.024, 2.9, Z1 - Z0 - 0.9, 0.01, faceX, 1.75, (Z0 + 0.35 + Z1 - 0.55) / 2));
    for (const y of [0.42, 3.08]) {
      for (const z of [Z0 + 0.5, Z1 - 0.7]) {
        const g = new THREE.CylinderGeometry(0.018, 0.018, 0.014, 12);
        g.rotateZ(Math.PI / 2);
        g.translate(faceX + ix * 0.012, y, z);
        steel.push(ni(g));
      }
    }
    steel.push(box(0.03, 0.18, Z1 - Z0 - 0.3, xIn + ix * 0.015, 0.09, (Z0 + Z1) / 2 - 0.15));
    // corridor face: a slim recessed channel (echoes the gate jambs)
    recess.push(rbox(fw - 0.18, 3.1, 0.02, 0.008, (xOut + (xIn - ix * CH)) / 2, 1.85, Z0 - 0.008));
  }
  // dark ribbed sill across the recess mouth (no threshold line — it sat
  // right on the LOBBY label / control pill row at the dwell)
  recess.push(box(RECESS_HALF * 2 - JW, 0.04, 0.34, FEATURE_X, 0.02, Z0 + 0.14));
  for (let i = 0; i < 3; i++) recess.push(rbox(RECESS_HALF * 2 - JW - 0.1, 0.01, 0.04, 0.004, FEATURE_X, 0.043, Z0 + 0.04 + i * 0.1));
  return { paint: merge(paint), steel: merge(steel), recess: merge(recess) };
}

const MONO = "ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace";

/** Chevron-striped sealed airlock face: hull plating, a double-door seam, hazard
 *  chevron band, KIRKHAM·01 stencil and a SEALED status tag — baked once to a
 *  CanvasTexture (static, never repainted). */
function makeDoorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 576;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#12151e";
  ctx.fillRect(0, 0, 1024, 576);
  ctx.strokeStyle = "rgba(140,160,200,0.08)";
  ctx.lineWidth = 2;
  for (const x of [128, 256, 384, 640, 768, 896]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 576);
    ctx.stroke();
  }

  const bandY = 330;
  const bandH = 74;
  ctx.save();
  ctx.beginPath();
  ctx.rect(40, bandY, 944, bandH);
  ctx.clip();
  ctx.fillStyle = "#15171d";
  ctx.fillRect(40, bandY, 944, bandH);
  ctx.fillStyle = "#b08a42";
  for (let x = -80; x < 1064; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, bandY + bandH);
    ctx.lineTo(x + 48, bandY);
    ctx.lineTo(x + 96, bandY);
    ctx.lineTo(x + 48, bandY + bandH);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(20,22,30,0.9)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(512, 0);
  ctx.lineTo(512, 576);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(236,232,222,0.85)";
  ctx.font = `700 92px ${MONO}`;
  ctx.fillText("KIRKHAM·01", 512, 160);
  ctx.fillStyle = "rgba(236,232,222,0.5)";
  ctx.font = `500 30px ${MONO}`;
  ctx.fillText("DOCKING PORT A — UMBILICAL RETRACTED", 512, 228);
  ctx.fillStyle = "#c96a4a";
  ctx.font = `700 34px ${MONO}`;
  ctx.fillText("· AIRLOCK SEALED ·", 512, 290);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Docking-lobby architecture (all static — the per-slide accent light rig
 * lives in FeatureScreen): the showreel recess is framed as a PORTAL in the
 * ship's collar language — chamfered gunmetal pilasters with a steel chamfer
 * and one warm rim line, inset service panels on the faces that flank the
 * screen, an angled soffit with a warm diffuser, and a steel sill with a warm
 * threshold line. Warm (the ship's only secondary hue) because the showreel
 * cycles every project accent: a neutral-warm frame sits under all of them
 * instead of fighting the green/violet slides. Behind the camera start, the
 * big SEALED docking door. No lights added — emitters stay at GLOW.trim.
 */
export default function Lobby() {
  const env = useStudioEnv();
  const doorTex = useMemo(() => makeDoorTexture(), []);
  const portal = useMemo(() => buildPortal(), []);

  const mats = useMemo(() => {
    const surf = doorSurface();
    const worn = (o: THREE.MeshStandardMaterialParameters, lo: number, edge: number) => {
      const m = new THREE.MeshStandardMaterial({ map: surf, roughnessMap: surf, ...o });
      shadeDoor(m, lo, edge, 3.2);
      return m;
    };
    return {
      paint: worn({ color: "#252d40", roughness: 0.66, metalness: 0.55 }, 0.55, 0.06),
      // satin, not polished: FeatureScreen's key light sits right in front of
      // the recess, and mirror steel on the chamfers/sill threw white glare
      // bands (bloom) straight back at the lens
      steel: worn({ color: "#4a5264", roughness: 0.7, metalness: 0.55 }, 0.6, 0),
      recess: worn({ color: "#151a26", roughness: 0.72, metalness: 0.45 }, 0.6, 0.03),
      // soft warm diffuser, well under trim: it sits at the top frame edge
      // at the dwell, so it must read as a glow in the soffit, not a line
      diffuser: new THREE.MeshBasicMaterial({
        color: new THREE.Color(WARM).multiplyScalar(GLOW.trim * 0.38),
        toneMapped: false,
      }),
      // plain satin: the hood is a declarative box (stretched default UVs),
      // and it sits in FeatureScreen's key light — keep it a quiet dark lid
      hood: new THREE.MeshStandardMaterial({ color: "#1b2131", roughness: 0.66, metalness: 0.5 }),
    };
  }, []);
  useEffect(() => {
    for (const [m, k] of [
      [mats.paint, 0.7],
      [mats.steel, 0.55],
      [mats.recess, 0.6],
      [mats.hood, 0.6],
    ] as const) {
      m.envMap = env;
      m.envMapIntensity = env ? k : 1;
      m.needsUpdate = true;
    }
  }, [env, mats]);
  useEffect(
    () => () => {
      // geometry + own texture only: materials disposed under StrictMode's
      // effect replay can crash an in-flight compileAsync (see Airlock)
      Object.values(portal).forEach((g) => g.dispose());
      doorTex.dispose();
    },
    [portal, doorTex],
  );

  return (
    <group>
      {/* ── showreel recess portal (+z wall at FEATURE_X) ────────────────── */}
      <mesh geometry={portal.paint} material={mats.paint} />
      <mesh geometry={portal.steel} material={mats.steel} />
      <mesh geometry={portal.recess} material={mats.recess} />

      {/* angled soffit over the recess mouth with a warm diffuser strip */}
      <group position={[FEATURE_X, 3.58, HALF_W - 0.12]} rotation={[-0.3, 0, 0]}>
        <mesh material={mats.hood}>
          <boxGeometry args={[RECESS_HALF * 2 + 0.7, 0.16, 1.35]} />
        </mesh>
        <mesh position={[0, -0.084, -0.3]} rotation-x={Math.PI / 2} material={mats.diffuser}>
          <planeGeometry args={[RECESS_HALF * 2 - 0.6, 0.07]} />
        </mesh>
      </group>

      {/* ── sealed docking door behind the camera start ───────────────────── */}
      <group position={[DOOR_X, 0, 0]}>
        <mesh position={[0, WALL_H / 2, 0]} material={mats.paint}>
          <boxGeometry args={[0.5, WALL_H + 0.8, HALF_W * 2 + 1.4]} />
        </mesh>
        <mesh position={[0.26, WALL_H / 2, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[HALF_W * 2, WALL_H]} />
          <meshBasicMaterial map={doorTex} />
        </mesh>
      </group>
    </group>
  );
}
