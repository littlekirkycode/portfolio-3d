"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { contactGeo } from "./contact";
import { box, chamferRect, hole, merge, plate, turned, vbox, xbar, type Piece } from "./geo";
import { useGeoSet, type AlliedMats } from "./mats";

/* ── the hero: a bridge-type CMM inspecting part AK-01 ───────────────────────
 * Speckled granite surface plate on an isolated steel stand; a light-grey
 * portal gantry (tapered cast legs with rounded edges) rides a chromed Y-guide;
 * the carriage runs the beam and an anodised Z-ram
 * carries a touch-trigger probe with a ruby tip (the only accent emitter on the
 * machine besides its brand stripe). On the fixture: a 7075 bracket that is
 * genuinely machined geometry — chamfered plate, turned boss, clevis lug with a
 * bronze bushing, black-oxide cap screws. The probe slowly visits four points
 * on the boss face and lug crown
 * (travel → descend → touch → lift, 20 s loop, all eased). Local origin = the
 * station's floor centre. */

/* Height budget: the whole machine tops out at eye level (≈1.61) so, from the
 * dwell camera, it sits entirely below the horizon line and the controller
 * display hung above it never overlaps it. */
export const G = 0.7; // granite top
const GT = 0.15; // granite thickness
const GW = 1.3; // granite x
const GD = 0.96; // granite z
const FIX = 0.018; // fixture plate
const K = 1.5; // part scale
const PT = 0.05; // part plate thickness
const Y0 = G + FIX; // part base
const BEAM_Y = 1.4;
const HB = 1.32; // Z-housing bottom
const HT = 1.6; // Z-housing top
const RAM_Z = 0.105; // ram axis in front of the beam
const RAM_L = 0.3;
const PROBE = 0.18; // ram bottom → tip centre
const TIP_R = 0.012;
const SAFE = 1.1; // tip travel height (clears the lug crown)

/* touch points (station-local x, z, surface y) */
const BOSS_X = 0.06 * K;
const BOSS_R = 0.0515 * K; // mid-annulus of the boss face
const BOSS_Y = Y0 + (PT - 0.001 + 0.058) * K;
const LUG_Y = Y0 + (PT - 0.001 + 0.18) * K;
const POINTS: [number, number, number][] = [
  [BOSS_X + BOSS_R, 0.0, BOSS_Y], // boss face, right
  [-0.12 * K, 0.0, LUG_Y], // lug crown
  [BOSS_X, BOSS_R, BOSS_Y], // boss face, front
  [BOSS_X, -BOSS_R, BOSS_Y], // boss face, rear
];
const SEG = 5; // seconds per point

const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

function Part({ m }: { m: AlliedMats }) {
  const g = useGeoSet(() => {
    const base = chamferRect(0.4, 0.27, 0.032);
    for (const [x, y] of [[0.16, 0.095], [-0.16, 0.095], [0.16, -0.095], [-0.16, -0.095]] as const) base.holes.push(hole(x, y, 0.0125));
    base.holes.push(hole(0.06, 0, 0.03));
    const lug = new THREE.Shape();
    lug.moveTo(-0.08, 0);
    lug.lineTo(0.08, 0);
    lug.lineTo(0.08, 0.1);
    lug.absarc(0, 0.1, 0.08, 0, Math.PI, false);
    lug.lineTo(-0.08, 0);
    lug.holes.push(hole(0, 0.1, 0.034));
    const lugGeo = plate(lug, 0.046, 0.003);
    lugGeo.translate(0, 0, -0.023);
    // web gusset behind the lug
    const web = new THREE.Shape();
    web.moveTo(0, 0);
    web.lineTo(0.07, 0);
    web.lineTo(0, 0.1);
    web.closePath();
    const webGeo = plate(web, 0.018, 0.002);
    webGeo.translate(0, 0, -0.009);
    webGeo.rotateY(Math.PI / 2); // outline x → −z: a gusset behind the lug
    const boss = turned([
      [0.03, 0],
      [0.072, 0],
      [0.072, 0.022],
      [0.068, 0.026],
      [0.068, 0.031],
      [0.072, 0.035],
      [0.072, 0.052],
      [0.066, 0.058],
      [0.037, 0.058],
      [0.03, 0.051],
      [0.03, 0],
    ]);
    const metal = merge([
      { g: plate(base, PT, 0.0035, true) },
      { g: lugGeo, p: [-0.12, PT - 0.001, 0] },
      { g: webGeo, p: [-0.12, PT - 0.001, -0.022] },
      { g: boss, p: [0.06, PT - 0.001, 0] },
    ]);
    // black-oxide socket-head cap screws in the four bolt holes
    const screws: Piece[] = [];
    const sockets: Piece[] = [];
    for (const [x, z] of [[0.16, 0.095], [-0.16, 0.095], [0.16, -0.095], [-0.16, -0.095]] as const) {
      screws.push({
        g: turned([
          [0.0, 0.0],
          [0.0118, 0.0],
          [0.0118, 0.012],
          [0.0098, 0.0142],
          [0.0, 0.0142],
        ], 24),
        p: [x, PT - 0.004, -z],
      });
      sockets.push({ g: new THREE.CircleGeometry(0.0052, 6), p: [x, PT + 0.0103, -z], r: [-Math.PI / 2, 0, 0] });
    }
    const bush = turned([
      [0.026, -0.026],
      [0.0345, -0.026],
      [0.0345, 0.026],
      [0.026, 0.026],
      [0.026, -0.026],
    ], 32);
    bush.rotateX(Math.PI / 2);
    bush.translate(-0.12, PT + 0.1, 0);
    return { metal, screws: merge(screws), sockets: merge(sockets), bush };
  });
  return (
    <group scale={K}>
      <mesh geometry={g.metal} material={m.alu} />
      <mesh geometry={g.screws} material={m.oxide} />
      <mesh geometry={g.sockets} material={m.shadow} />
      <mesh geometry={g.bush} material={m.bronze} />
    </group>
  );
}

export default function Cmm({ m, animate, position }: { m: AlliedMats; animate: boolean; position: [number, number, number] }) {
  const g = useGeoSet(() => {
    /* ─ stand (painted steel box-section) ─ */
    const FRAME_TOP = G - GT - 0.02; // isolator pads sit between frame and granite
    const stand: Piece[] = [];
    const lx = GW / 2 - 0.09, lz = GD / 2 - 0.08;
    const legH = FRAME_TOP - 0.055;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) stand.push({ g: vbox(0.07, legH, 0.07, 0.01), p: [sx * lx, 0.055 + legH / 2, sz * lz] });
    for (const sz of [-1, 1]) stand.push({ g: xbar(GW - 0.18 + 0.07, 0.07, 0.06, 0.008), p: [0, FRAME_TOP - 0.035, sz * lz] }, { g: xbar(GW - 0.18, 0.045, 0.045, 0.006), p: [0, 0.17, sz * lz] });
    for (const sx of [-1, 1]) stand.push({ g: box(0.06, 0.07, GD - 0.16 - 0.07), p: [sx * lx, FRAME_TOP - 0.035, 0] });
    // lower shelf on the stretchers
    stand.push({ g: box(GW - 0.24, 0.018, GD - 0.22), p: [0, 0.2, 0] });
    /* ─ isolator feet (rubber) ─ */
    const feet: Piece[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      feet.push({ g: turned([[0, 0], [0.05, 0], [0.05, 0.035], [0.032, 0.055], [0, 0.055]], 24), p: [sx * lx, 0, sz * lz] });
      feet.push({ g: turned([[0, 0], [0.045, 0], [0.045, 0.02], [0, 0.02]], 24), p: [sx * lx, FRAME_TOP, sz * lz] });
    }
    /* ─ granite (bevelled) ─ */
    const granite = plate(chamferRect(GW, GD, 0.014), GT, 0.007, true);
    granite.translate(0, G - GT, 0);
    /* ─ chrome: Y-guide on the granite (drive side) ─ */
    const guide = merge([
      { g: box(0.04, 0.026, GD - 0.04), p: [-GW / 2 + 0.075, G + 0.013, 0] },
      { g: box(0.014, 0.006, GD - 0.06), p: [-GW / 2 + 0.075, G + 0.029, 0] },
    ]);
    /* ─ fixture plate + toe clamps (tool steel) ─ */
    const fixShape = chamferRect(0.86, 0.6, 0.012);
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) if (Math.abs(i) === 2 || Math.abs(j) === 1) fixShape.holes.push(hole(i * 0.18, j * 0.24, 0.01));
    const top = Y0 + PT * K;
    const clamps: Piece[] = [];
    const edge = 0.135 * K; // part's front/back edge
    for (const sz of [-1, 1]) {
      const x = -0.08 * K;
      clamps.push(
        { g: box(0.036, 0.022, 0.1), p: [x, top + 0.011, sz * (edge + 0.016)] },
        { g: box(0.036, PT * K, 0.026), p: [x, Y0 + (PT * K) / 2, sz * (edge + 0.055)] },
        { g: turned([[0, 0], [0.0065, 0], [0.0065, top - Y0 + 0.036], [0, top - Y0 + 0.038]], 12), p: [x, Y0, sz * (edge + 0.032)] },
        { g: new THREE.CylinderGeometry(0.013, 0.013, 0.012, 6), p: [x, top + 0.028, sz * (edge + 0.032)] },
      );
    }
    const fixture = merge([{ g: plate(fixShape, FIX, 0.002, true), p: [0, G, 0] }, ...clamps]);
    /* ─ bridge: tapered cast legs (enamel), beam (anodised) ─ */
    const PAD = 0.03;
    const LEG_B = G + PAD; // leg foot
    const LEG_T = BEAM_Y - 0.065; // beam underside
    const LEG_H = LEG_T - LEG_B;
    const legs = merge([
      // drive-side leg: deep tapered casting riding the Y-guide
      { g: vbox(0.13, LEG_H, 0.26, 0.016, 0.7, 0.68), p: [-GW / 2 + 0.075, LEG_B + LEG_H / 2 + 0.026, 0] },
      // outboard leg: slimmer, on an air-bearing pad
      { g: vbox(0.1, LEG_H, 0.2, 0.014, 0.7, 0.66), p: [GW / 2 - 0.1, LEG_B + LEG_H / 2, 0] },
    ]);
    const pads = merge([
      { g: vbox(0.17, PAD, 0.3, 0.006), p: [-GW / 2 + 0.075, G + PAD / 2 + 0.026, 0] },
      { g: vbox(0.14, PAD, 0.22, 0.006), p: [GW / 2 - 0.1, G + PAD / 2, 0] },
    ]);
    const beam = xbar(GW - 0.06, 0.13, 0.15, 0.012);
    beam.translate(0, BEAM_Y, 0);
    // enamel end caps (rougher than the anodised beam — no hot specular)
    const caps = merge([
      { g: vbox(0.04, 0.15, 0.17, 0.01), p: [-GW / 2 + 0.01, BEAM_Y, 0] },
      { g: vbox(0.04, 0.15, 0.17, 0.01), p: [GW / 2 - 0.01, BEAM_Y, 0] },
    ]);
    const beamRail = box(GW - 0.12, 0.018, 0.012);
    const stripe = box(GW - 0.16, 0.008, 0.004);
    /* ─ carriage (enamel) + Z-housing + ram (anodised) + probe ─ */
    const carriage = merge([
      { g: vbox(0.2, 0.17, 0.21, 0.014), p: [0, BEAM_Y, 0.01] },
      { g: vbox(0.12, HT - HB, 0.11, 0.012), p: [0, (HB + HT) / 2, RAM_Z] },
    ]);
    const housingCap = vbox(0.128, 0.014, 0.118, 0.006);
    housingCap.translate(0, HT + 0.003, RAM_Z);
    const ram = box(0.052, RAM_L, 0.052);
    ram.translate(0, RAM_L / 2, 0);
    const probeBody = merge([
      // probe head (indexing knuckle) + touch-trigger module
      { g: turned([[0, 0], [0.026, 0], [0.031, 0.007], [0.031, 0.052], [0.024, 0.06], [0, 0.06]], 32), p: [0, -0.06, 0] },
      { g: turned([[0, 0], [0.015, 0], [0.015, 0.05], [0, 0.05]], 24), p: [0, -0.11, 0] },
    ]);
    const stylus = turned([[0, 0], [0.0036, 0], [0.0036, 0.058], [0.0075, 0.066], [0, 0.066]], 12);
    stylus.translate(0, -0.11 - 0.066, 0);
    const tip = new THREE.SphereGeometry(TIP_R, 20, 14);
    tip.translate(0, -PROBE, 0);
    // contact shadows: a broad soft pool under the stand + a tight one per foot
    const shadow = contactGeo([
      { x: 0, z: 0, w: GW + 0.45, d: GD + 0.4 },
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * lx, z: sz * lz, w: 0.2, d: 0.2 }))),
    ], 0.014);
    return {
      shadow,
      stand: merge(stand),
      feet: merge(feet),
      granite,
      guide,
      fixture,
      legs,
      pads,
      beam,
      caps,
      beamRail,
      stripe,
      carriage,
      housingCap,
      ram,
      probeBody,
      stylus,
      tip,
    };
  });

  const bridge = useRef<THREE.Group>(null);
  const carriage = useRef<THREE.Group>(null);
  const ramRef = useRef<THREE.Group>(null);
  const t = useRef(SEG * 0.6); // start mid-touch on the boss (reduced-motion pose)
  useFrame((_, dt) => {
    if (animate) t.current += Math.min(dt, 1 / 30);
    const cyc = t.current % (SEG * POINTS.length);
    const i = Math.floor(cyc / SEG);
    const s = cyc - i * SEG;
    const P = POINTS[(i + POINTS.length - 1) % POINTS.length];
    const Q = POINTS[i];
    const k = ease(s / 1.7);
    const x = P[0] + (Q[0] - P[0]) * k;
    const z = P[1] + (Q[1] - P[1]) * k;
    const down = ease((s - 1.8) / 1.1) * (1 - ease((s - 3.4) / 1.1));
    const touch = Q[2] + TIP_R;
    const tipY = SAFE + (touch - SAFE) * down;
    if (bridge.current) bridge.current.position.z = z - RAM_Z;
    if (carriage.current) carriage.current.position.x = x;
    if (ramRef.current) ramRef.current.position.y = tipY + PROBE;
  });

  return (
    <group position={position}>
      <mesh geometry={g.shadow} material={m.contact} renderOrder={-1} />
      <mesh geometry={g.stand} material={m.paint} />
      <mesh geometry={g.feet} material={m.rubber} />
      <mesh geometry={g.granite} material={m.granite} />
      <mesh geometry={g.guide} material={m.chrome} />
      <mesh geometry={g.fixture} material={m.steel} />
      <group position={[0, Y0, 0]}>
        <Part m={m} />
      </group>
      <group ref={bridge}>
        <mesh geometry={g.legs} material={m.enamel} />
        <mesh geometry={g.pads} material={m.anod} />
        <mesh geometry={g.beam} material={m.anod} />
        <mesh geometry={g.caps} material={m.enamel} />
        <mesh geometry={g.beamRail} material={m.chrome} position={[0, BEAM_Y - 0.03, 0.081]} />
        {/* the machine's brand stripe — the accent as trim */}
        <mesh geometry={g.stripe} material={m.trim} position={[0, BEAM_Y + 0.035, 0.077]} />
        <group ref={carriage}>
          <mesh geometry={g.carriage} material={m.enamel} />
          <mesh geometry={g.housingCap} material={m.anod} />
          <group ref={ramRef} position={[0, SAFE + PROBE, RAM_Z]}>
            <mesh geometry={g.ram} material={m.anod} />
            <mesh geometry={g.probeBody} material={m.shadow} />
            <mesh geometry={g.stylus} material={m.steel} />
            <mesh geometry={g.tip} material={m.line} />
          </group>
        </group>
      </group>
    </group>
  );
}
