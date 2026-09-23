"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GALLERY_X, GATES, GATE_BEATS, gateOpenAt, HALF_W, ROOMS, WALL_H } from "./hallConfig";
import { scrollRefs } from "@/lib/scrollStore";
import { familyVar, hexA } from "./canvas2d";
import { GLOW } from "./theme";
import {
  box,
  buildLeaf,
  C_FRAME,
  C_RECESS,
  C_TRIM,
  cyl,
  decalMat,
  disposeLeaf,
  dogGeometry,
  type G,
  hazardDecal,
  type LeafGeo,
  type LeafSpec,
  makeDoorMats,
  merge,
  placeDogs,
  rbox,
  slitTexture,
  smoothstep,
  tint,
  useDoorEnv,
  wear,
  type DoorMats,
} from "./Airlock";

/* ── deck bulkhead gates — the airlock's pressure-door family ──────────────
 * Each gate marks a deck boundary mid-corridor (hallConfig GATES) as a HEAVY
 * bulkhead, not a shopfront: the collar fills the corridor profile wall to
 * wall and floor to ceiling around a narrower, taller opening (4.1 × 3.1 m);
 * hazard bands and service channels on the jambs, a lintel with the deck
 * plate set into it and a downlight lip, a ribbed tread sill. The leaves are
 * the airlock's telescoping pair built from the same kit (seal dogs, radial-
 * dog lock hub, kick plates, louvres, actuators, grab rails) with the deck
 * number stencilled across the seam. The rim line and the hub lamp take the
 * NEXT deck's accent — the far-hall wayfinding read.
 *
 * Opening is a pure function of the camera PLAYHEAD through the gate's own
 * beat (hallConfig GATE_BEATS / gateOpenAt): the head settles to straight
 * down the hall, the camera parks GATE_VIEW in front of the gate, the seals
 * release and the leaves part as the visitor scrolls, then the camera glides
 * through. It scrubs both ways, needs no timers and is identical with
 * reduced motion.
 * Leaves hide only once the lens has passed the gate plane (they are behind
 * it then). No lights. ── */

const FRONT = -0.35; // approach face (camera side, −x); collar spans ±0.35 so
const BACK = 0.35; //  it stays inside corridorFx's ±0.4 cove cut
const CH = 0.1;
const O = 2.05; // clear opening half-width
const JAMB_OUT = HALF_W + 0.15;
const TOP = 3.1;
const SILL = 0.06;

const LT = 0.14;
const GAP = 0.02;
// seam leaf's hub/dogs (0.125 proud) stay behind the pocket-mouth plane
// (FRONT + CH) so a parked leaf never pokes through the jamb face
const IX = FRONT + CH + 0.125 + LT / 2;
const OX = IX + LT + 0.12;
const IW = 1.1;
const OW = 1.1;
const I_Z = GAP / 2 + IW / 2;
const O_Z = 0.98 + OW / 2;
const I_TRAVEL = O + 0.03 + IW / 2 - I_Z;
const O_TRAVEL = O + 0.05 - 0.98;
const LY0 = SILL;
const LY1 = TOP + 0.05;
const BANDS = {
  kick: [0.1, 0.34] as const,
  low: [0.4, 1.22] as const,
  lock: [1.28, 2.02] as const,
  up: [2.08, 3.0] as const,
};
const HUB_Y = 1.65;
const PLATE_W = 2.4; // deck plate (4:1, matches its 1024×256 canvas row)
const PLATE_Y = TOP + CH + 0.42;
const HUB_R = 0.34;
const DOGS = [0.56, 0.84, 1.1] as const;
const F = -LT / 2;

/** True while a SHUT gate stands between the camera and world x `targetX`
 *  (camera on the approach side, before the gate's beat opens it — see
 *  hallConfig GATE_BEATS). The collar fills the corridor wall to wall
 *  and floor to ceiling, so anything past it is invisible — Walls uses this
 *  to skip submitting the draws of bays behind a sealed deck door. Pure
 *  function of camera x, like the gate itself, so it scrubs both ways. */
export function sealedOff(camX: number, targetX: number, p: number): boolean {
  for (let k = 0; k < GATE_BEATS.length; k++) {
    const b = GATE_BEATS[k];
    // leaves stay fully shut until the gate's beat is under way; small
    // margin so the bay beyond is already drawn when they start to part
    if (camX < b.x && targetX > b.x && p < b.lo - 0.004) return true;
  }
  return false;
}

/** What lies beyond each gate — derived from the room data (never typed in):
 *  the rooms between this gate and the next, plus the observation gallery if
 *  it falls in that span. The accent is the first room past the gate. */
const DECKS = GATES.map((g, i) => {
  const hi = GATES[i + 1]?.x ?? Infinity;
  const rooms = ROOMS.filter((r) => r.x > g.x && r.x < hi);
  const gallery = GALLERY_X > g.x && GALLERY_X < hi;
  const n = String(i + 2).padStart(2, "0");
  const sub = rooms.length
    ? `EXHIBITS ${rooms[0].index}–${rooms[rooms.length - 1].index}${gallery ? " · OBSERVATION" : ""}`
    : "";
  return { n, label: `DECK ${n}`, sub, accent: rooms[0]?.accent ?? g.accent };
});

/** One 1024×1024 canvas: rows 0–1 lintel plates, rows 2–3 leaf stencils. */
function drawGateArt(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const mono = familyVar("--ff-mono", "ui-monospace, monospace");
  ctx.clearRect(0, 0, c.width, c.height);
  /** Set `font` at `px`, shrunk until `text` fits `maxW`. */
  const fit = (text: string, weight: number, px: number, maxW: number) => {
    ctx.font = `${weight} ${px}px ${mono}`;
    const w = ctx.measureText(text).width;
    if (w > maxW) ctx.font = `${weight} ${Math.floor((px * maxW) / w)}px ${mono}`;
  };
  DECKS.slice(0, 2).forEach((deck, i) => {
    // lintel plate: "DECK 02" left, an accent rule, then what lies beyond in
    // a right column at a size that reads from the approach (was one 36 px
    // line nobody could read from any view)
    const y0 = i * 256;
    ctx.fillStyle = "rgba(10,12,18,0.9)";
    ctx.fillRect(8, y0 + 8, 1008, 240);
    ctx.strokeStyle = "rgba(236,232,222,0.22)";
    ctx.lineWidth = 3;
    ctx.strokeRect(10, y0 + 10, 1004, 236);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(242,238,230,0.97)";
    fit(deck.label, 700, 116, 470);
    ctx.fillText(deck.label, 44, y0 + 130);
    ctx.fillStyle = deck.accent;
    ctx.fillRect(548, y0 + 52, 6, 152);
    const lines = deck.sub.split(" · ");
    ctx.fillStyle = hexA(deck.accent, 0.95);
    lines.forEach((ln, k) => {
      fit(ln, 700, 50, 430);
      const yy = lines.length === 1 ? y0 + 130 : y0 + 96 + k * 68;
      ctx.fillText(ln, 580, yy);
    });
    // leaf stencil — one tall digit per seam leaf, each in a 256×512
    // portrait column of the bottom half (the fields are near-square, so a
    // landscape strip left the digit a third of the panel height)
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ([
      [deck.n[0], "DECK"],
      [deck.n[1], "PRESSURE DOOR"],
    ] as const).forEach(([digit, tag], h) => {
      const cx = (2 * i + h) * 256 + 128;
      ctx.fillStyle = "rgba(238,234,226,0.97)";
      fit(digit, 700, 400, 236);
      ctx.fillText(digit, cx, 512 + 380);
      ctx.fillStyle = "rgba(232,228,218,0.66)";
      fit(tag, 600, 26, 220);
      ctx.fillText(tag, cx, 512 + 462);
    });
  });
  // wear only the stencil rows (the plates stay crisp)
  const sub = document.createElement("canvas");
  sub.width = 1024;
  sub.height = 512;
  const sctx = sub.getContext("2d");
  if (sctx) {
    sctx.drawImage(c, 0, 512, 1024, 512, 0, 0, 1024, 512);
    wear(sctx, 1024, 512, 1400, 23);
    ctx.clearRect(0, 512, 1024, 512);
    ctx.drawImage(sub, 0, 512);
  }
}

/** Shared collar geometry (identical for every gate): paint · tread. The
 *  accent rim is separate (per gate colour). */
function buildCollar() {
  const paint: G[] = [];
  const steel: G[] = [];
  const hub: G[] = [];
  const tread: G[] = [];
  const rim: G[] = [];
  const DIAG = CH * Math.SQRT2;
  const stepX = (FRONT + CH + BACK) / 2;
  const outerW = JAMB_OUT - (O + CH);
  for (const s of [-1, 1] as const) {
    paint.push(tint(box(BACK - FRONT, WALL_H, outerW, 0, WALL_H / 2, s * (O + CH + outerW / 2)), C_FRAME));
    paint.push(tint(box(BACK - FRONT - CH, TOP + CH, CH, stepX, (TOP + CH) / 2, s * (O + CH / 2)), C_FRAME));
    const cx = FRONT + CH / 2 + 0.005;
    const cz = s * (O + CH / 2 + 0.005);
    paint.push(tint(box(DIAG, TOP, 0.018, cx, TOP / 2, cz, s * (Math.PI / 4)), C_TRIM));
    // accent lamp segments set into a dark channel down the chamfer — short
    // lit blocks, never one continuous neon outline round the opening
    paint.push(tint(box(0.05, TOP - 0.24, 0.008, cx - 0.008, TOP / 2 - 0.02, cz - s * 0.008, s * (Math.PI / 4)), C_RECESS));
    for (let y = 0.34; y + 0.24 <= TOP - 0.22; y += 0.44) {
      rim.push(box(0.026, 0.24, 0.01, cx - 0.011, y + 0.12, cz - s * 0.011, s * (Math.PI / 4)));
    }
    paint.push(tint(box(BACK - FRONT - CH - 0.1, TOP, 0.02, stepX + 0.05, TOP / 2, s * (O + 0.004)), C_RECESS));
    // jamb face (z from O+CH outward): hazard band (decal), then a recessed
    // service bay with a pressure gauge, then a conduit run to the ceiling
    const z0 = O + CH;
    const bayZ = s * (z0 + 0.72);
    paint.push(tint(rbox(0.024, 1.16, 0.62, 0.01, FRONT - 0.008, 0.95, bayZ), C_RECESS));
    steel.push(rbox(0.03, 0.03, 0.66, 0.01, FRONT - 0.018, 1.55, bayZ));
    steel.push(rbox(0.03, 0.03, 0.66, 0.01, FRONT - 0.018, 0.35, bayZ));
    hub.push(cyl(0.12, 0.04, FRONT - 0.03, 1.12, bayZ, "x", 28));
    paint.push(tint(cyl(0.095, 0.01, FRONT - 0.054, 1.12, bayZ, "x", 28), C_RECESS));
    for (let k = 0; k < 9; k++) {
      const a = (-135 + k * 33.75) * (Math.PI / 180);
      steel.push(box(0.008, 0.024, 0.006, FRONT - 0.062, 1.12 + 0.078 * Math.cos(a), bayZ + s * 0.078 * Math.sin(a), 0, 0, s * a));
    }
    for (const y of [0.62, 0.78]) {
      for (const dz of [-0.18, 0, 0.18]) hub.push(rbox(0.03, 0.1, 0.12, 0.01, FRONT - 0.022, y, bayZ + dz));
    }
    for (const [i, dz] of [0.5, 0.64, 0.78].entries()) {
      const z = s * (z0 + dz);
      const r = i === 1 ? 0.034 : 0.024;
      steel.push(cyl(r, WALL_H - 1.75, FRONT - 0.045, 1.75 + (WALL_H - 1.75) / 2, z, "y", 12));
    }
    for (const y of [1.9, 2.7, 3.5]) hub.push(rbox(0.05, 0.06, 0.4, 0.012, FRONT - 0.03, y, s * (z0 + 0.64)));
    steel.push(box(0.03, 0.18, outerW - 0.05, FRONT - 0.012, 0.09, s * (z0 + outerW / 2)));
  }
  // lintel + its step, chamfer and rim
  paint.push(tint(box(BACK - FRONT, WALL_H - TOP - CH, 2 * JAMB_OUT, 0, (TOP + CH + WALL_H) / 2, 0), C_FRAME));
  paint.push(tint(box(BACK - FRONT - CH, CH, 2 * (O + CH), stepX, TOP + CH / 2, 0), C_FRAME));
  paint.push(tint(box(DIAG, 0.018, 2 * O, FRONT + CH / 2 + 0.005, TOP + CH / 2 + 0.005, 0, 0, -Math.PI / 4), C_RECESS));
  // downlight lip + the deck-plate recess set into the lintel
  paint.push(tint(rbox(0.1, 0.06, 2 * O + 0.1, 0.012, FRONT - 0.05, TOP + CH + 0.03, 0), C_RECESS));
  paint.push(tint(rbox(0.03, 0.66, PLATE_W + 0.1, 0.01, FRONT - 0.01, PLATE_Y, 0), C_RECESS));
  for (const s of [-1, 1] as const) {
    steel.push(rbox(0.03, 0.7, 0.04, 0.01, FRONT - 0.02, PLATE_Y, s * (PLATE_W / 2 + 0.07)));
  }
  // ribbed tread sill + seal lip
  tread.push(box(BACK - FRONT, SILL, 2 * O, 0, SILL / 2, 0));
  for (let i = 0; i < 5; i++) tread.push(rbox(0.05, 0.012, 2 * O - 0.08, 0.005, FRONT + 0.08 + i * 0.13, SILL + 0.004, 0));
  tread.push(rbox(0.05, 0.03, 2 * O - 0.02, 0.012, IX - LT / 2 - 0.05, SILL + 0.012, 0));
  return { paint: merge(paint), steel: merge(steel), hub: merge(hub), tread: merge(tread), rim: merge(rim) };
}

const leafSpec = (kind: "inner" | "outer", s: 1 | -1): LeafSpec => ({
  kind,
  s,
  W: kind === "inner" ? IW : OW,
  LT,
  y0: LY0,
  y1: LY1,
  gap: GAP,
  ...BANDS,
  hubY: HUB_Y,
  hubR: HUB_R,
  dogs: DOGS,
});

/** The door family, a shade darker than the airlock's: the gates stand in
 *  the corridor's ceiling-light cones, which washed the stock paint out. */
function gateMats(): DoorMats {
  const m = makeDoorMats(2.6);
  m.paint.color.setScalar(0.78);
  m.steel.color.set("#6f7889");
  m.hub.color.set("#4a5467");
  return m;
}

type Shared = {
  mats: DoorMats;
  collar: ReturnType<typeof buildCollar>;
  dogGeo: G;
  downlight: THREE.MeshBasicMaterial;
  kick: THREE.MeshStandardMaterial;
  kickO: THREE.MeshStandardMaterial;
  jamb: THREE.MeshStandardMaterial;
};

function Gate({ k, x, deck, plate, stencilL, stencilR, sh }: {
  k: number;
  x: number;
  deck: (typeof DECKS)[number];
  plate: THREE.Texture;
  stencilL: THREE.Texture;
  stencilR: THREE.Texture;
  sh: Shared;
}) {
  const leaves = useMemo(
    () => ({
      il: buildLeaf(leafSpec("inner", -1)),
      ir: buildLeaf(leafSpec("inner", 1)),
      ol: buildLeaf(leafSpec("outer", -1)),
      or: buildLeaf(leafSpec("outer", 1)),
    }),
    [],
  );
  const local = useMemo(() => {
    const accentC = new THREE.Color(deck.accent);
    const rim = new THREE.MeshBasicMaterial({ color: accentC.clone().multiplyScalar(GLOW.trim), toneMapped: false });
    const ring = new THREE.MeshBasicMaterial({ color: accentC.clone().multiplyScalar(GLOW.trim), toneMapped: false });
    const plateMat = decalMat(plate, 0.42, 0.6);
    const stL = decalMat(stencilL, 0.42);
    const stR = decalMat(stencilR, 0.42);
    const blade = new THREE.MeshBasicMaterial({
      map: slitTexture(),
      color: accentC.clone().lerp(new THREE.Color("#ffe6cc"), 0.2).multiplyScalar(0.8),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { rim, ring, plateMat, stL, stR, blade, accentC };
  }, [deck.accent, plate, stencilL, stencilR]);

  useEffect(
    () => () => {
      // geometry only — see Airlock: materials disposed under StrictMode's
      // effect replay can crash an in-flight compileAsync
      Object.values(leaves).forEach(disposeLeaf);
    },
    [leaves],
  );

  const innerL = useRef<THREE.Group>(null);
  const innerR = useRef<THREE.Group>(null);
  const outerL = useRef<THREE.Group>(null);
  const outerR = useRef<THREE.Group>(null);
  const dogsL = useRef<THREE.InstancedMesh>(null);
  const dogsR = useRef<THREE.InstancedMesh>(null);
  const blade = useRef<THREE.Mesh>(null);
  const lastU = useRef(-1);

  useFrame((state) => {
    const cx = state.camera.position.x;
    const d = Math.abs(cx - x);
    if (d > 40 && lastU.current >= 0) return; // far down the hall: leave it shut
    // Door state is a pure function of the CAMERA playhead through this
    // gate's beat (hallConfig GATE_BEATS: camera parked facing the doors,
    // seals release, leaves part, then the glide through) — so it scrubs both
    // ways and the visitor gets a full beat of scroll to watch it open.
    const { unlock: u, part: e } = gateOpenAt(k, scrollRefs.cameraProgress);
    const show = cx < x + 0.9;
    const zi = I_Z + I_TRAVEL * e;
    const zo = O_Z + O_TRAVEL * e;
    const set = (g: THREE.Group | null, z: number) => {
      if (!g) return;
      g.position.z = z;
      g.visible = show;
    };
    set(innerL.current, -zi);
    set(innerR.current, zi);
    set(outerL.current, -zo);
    set(outerR.current, zo);
    if (u !== lastU.current) {
      lastU.current = u;
      if (dogsL.current) placeDogs(dogsL.current, -1, leaves.il.FACE, HUB_Y, leaves.il.seamZ, HUB_R, u);
      if (dogsR.current) placeDogs(dogsR.current, 1, leaves.ir.FACE, HUB_Y, leaves.ir.seamZ, HUB_R, u);
    }
    // lamp: steady accent trim while sealed, rising to a clean line on release
    // …and dims once the leaves are parked in the jamb (no lit ring glowing
    // out of the pocket reveal)
    local.ring.color.copy(local.accentC).multiplyScalar((GLOW.trim + (GLOW.line - GLOW.trim) * u) * (1 - 0.6 * e));
    const gapW = GAP + 2 * I_TRAVEL * e;
    if (blade.current) {
      blade.current.scale.x = gapW + 0.05;
      blade.current.visible = u > 0.01 && gapW < 0.9 && show;
    }
    // zero while sealed; only the release crack lets the next deck's light in
    local.blade.opacity = 0.22 * u * (1 - smoothstep(0.05, 0.7, gapW));
  });

  const { mats } = sh;
  const leafMeshes = (b: LeafGeo) => (
    <>
      <mesh geometry={b.paint} material={mats.paint} />
      <mesh geometry={b.steel} material={mats.steel} />
      {b.hub && <mesh geometry={b.hub} material={mats.hub} />}
      {b.lamp && <mesh geometry={b.lamp} material={local.ring} />}
      {b.glass && <mesh geometry={b.glass} material={mats.glass} renderOrder={2} />}
    </>
  );
  // one digit per seam leaf, centred on its recessed upper field
  const fl = leaves.il.upper!;
  const fr = leaves.ir.upper!;
  const SH = fl.fh; // portrait 256×512 column: plane height = field height
  const SW = SH / 2;

  return (
    <group position={[x, 0, 0]}>
      <mesh geometry={sh.collar.paint} material={mats.paint} />
      <mesh geometry={sh.collar.steel} material={mats.steel} />
      <mesh geometry={sh.collar.hub} material={mats.hub} />
      <mesh geometry={sh.collar.tread} material={mats.tread} />
      <mesh geometry={sh.collar.rim} material={local.rim} />
      <mesh position={[FRONT - 0.05, TOP + CH - 0.002, 0]} rotation-x={Math.PI / 2} material={sh.downlight}>
        <planeGeometry args={[0.018, 2 * O - 0.1]} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[FRONT - 0.003, TOP / 2 + 0.05, s * (O + CH + 0.11)]} rotation-y={-Math.PI / 2} material={sh.jamb}>
          <planeGeometry args={[0.16, TOP - 0.1]} />
        </mesh>
      ))}
      {/* deck plate set into the lintel */}
      <mesh position={[FRONT - 0.027, PLATE_Y, 0]} rotation-y={-Math.PI / 2} material={local.plateMat}>
        <planeGeometry args={[PLATE_W, PLATE_W / 4]} />
      </mesh>
      {/* the next deck's light through the seam slit */}
      <mesh ref={blade} position={[(IX + OX) / 2, LY0 + (LY1 - LY0) / 2, 0]} rotation-y={-Math.PI / 2} material={local.blade}>
        <planeGeometry args={[1, LY1 - LY0 - 0.4]} />
      </mesh>

      <group ref={outerL} position={[OX, 0, -O_Z]}>
        {leafMeshes(leaves.ol)}
        <mesh position={[F - 0.024, 0.22, 0.01]} rotation-y={-Math.PI / 2} material={sh.kickO}>
          <planeGeometry args={[OW - 0.08, 0.2]} />
        </mesh>
      </group>
      <group ref={outerR} position={[OX, 0, O_Z]}>
        {leafMeshes(leaves.or)}
        <mesh position={[F - 0.024, 0.22, -0.01]} rotation-y={-Math.PI / 2} material={sh.kickO}>
          <planeGeometry args={[OW - 0.08, 0.2]} />
        </mesh>
      </group>
      <group ref={innerL} position={[IX, 0, -I_Z]}>
        {leafMeshes(leaves.il)}
        <instancedMesh ref={dogsL} args={[sh.dogGeo, mats.hub, 4]} frustumCulled={false} />
        <mesh position={[F - 0.008, fl.fy, fl.pz]} rotation-y={-Math.PI / 2} material={local.stL}>
          <planeGeometry args={[SW, SH]} />
        </mesh>
        <mesh position={[F - 0.024, 0.22, 0]} rotation-y={-Math.PI / 2} material={sh.kick}>
          <planeGeometry args={[IW - 0.08, 0.2]} />
        </mesh>
      </group>
      <group ref={innerR} position={[IX, 0, I_Z]}>
        {leafMeshes(leaves.ir)}
        <instancedMesh ref={dogsR} args={[sh.dogGeo, mats.hub, 4]} frustumCulled={false} />
        <mesh position={[F - 0.008, fr.fy, fr.pz]} rotation-y={-Math.PI / 2} material={local.stR}>
          <planeGeometry args={[SW, SH]} />
        </mesh>
        <mesh position={[F - 0.024, 0.22, 0]} rotation-y={-Math.PI / 2} material={sh.kick}>
          <planeGeometry args={[IW - 0.08, 0.2]} />
        </mesh>
      </group>
    </group>
  );
}

/** Deck bulkhead gates with telescoping pocket doors (open on camera approach). */
export default function BulkheadGates() {
  const sh = useMemo<Shared>(
    () => ({
      mats: gateMats(),
      collar: buildCollar(),
      dogGeo: dogGeometry(HUB_R),
      downlight: new THREE.MeshBasicMaterial({
        color: new THREE.Color("#c9d6ee").multiplyScalar(GLOW.trim * 0.72),
        toneMapped: false,
      }),
      kick: hazardDecal((IW - 0.08) / 0.24, 1),
      kickO: hazardDecal((OW - 0.08) / 0.24, 1),
      jamb: hazardDecal(1, (TOP - 0.1) / 0.16),
    }),
    [],
  );
  useDoorEnv(sh.mats, 0.8);

  const art = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 1024;
    drawGateArt(c);
    const base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    base.anisotropy = 8;
    const view = (u0: number, v0: number, u1: number, v1: number) => {
      const t = base.clone();
      t.offset.set(u0, v0);
      t.repeat.set(u1 - u0, v1 - v0);
      t.needsUpdate = true;
      return t;
    };
    // rows top→bottom: plate0, plate1, stencil0, stencil1 (v = 1 at the top)
    return GATES.map((_, i) => {
      const r = Math.min(i, 1);
      return {
        plate: view(0, 1 - (r + 1) / 4, 1, 1 - r / 4),
        // stencil columns (bottom half): 256×512 portrait, one per leaf
        stL: view((2 * r) / 4, 0, (2 * r + 1) / 4, 0.5),
        stR: view((2 * r + 1) / 4, 0, (2 * r + 2) / 4, 0.5),
      };
    });
  }, []);
  // repaint once webfonts land (the plates must not keep the fallback mono)
  useEffect(() => {
    let cancelled = false;
    if ("fonts" in document) {
      document.fonts.ready
        .then(() => {
          if (cancelled || !art.length) return;
          drawGateArt(art[0].plate.image as HTMLCanvasElement);
          art.forEach((a) => Object.values(a).forEach((t) => (t.needsUpdate = true)));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [art]);
  useEffect(
    () => () => {
      Object.values(sh.collar).forEach((g) => g.dispose());
      sh.dogGeo.dispose();
    },
    [sh],
  );

  return (
    <group>
      {GATES.map((g, i) => (
        <Gate
          key={`gate${i}`}
          k={i}
          x={g.x}
          deck={DECKS[i]}
          plate={art[i].plate}
          stencilL={art[i].stL}
          stencilR={art[i].stR}
          sh={sh}
        />
      ))}
    </group>
  );
}
