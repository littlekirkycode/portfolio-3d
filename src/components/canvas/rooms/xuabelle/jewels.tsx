"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { brilliantGeo, cyl, merge, pearGeo, useBoutique, useDisposeAll, xf } from "./kit";

/* ── the pieces: procedural fine jewellery ───────────────────────────────────
 * Authored to scale for display (slightly oversized so they read from the
 * corridor): polished gold + round-brilliant stones whose flat facets catch
 * the studio environment. Local origin = where the piece rests. */

const UP = /* @__PURE__ */ new THREE.Vector3(0, 1, 0);

/** Instanced stones from [position, outward-normal, size] triples. */
function Stones({
  items,
  garnet = false,
  bright = false,
  pear = false,
  seg = 10,
}: {
  items: { p: THREE.Vector3; n: THREE.Vector3; s: number; stretch?: number }[];
  garnet?: boolean;
  /** whiter stone material (small pieces + the hero) */
  bright?: boolean;
  pear?: boolean;
  seg?: number;
}) {
  const m = useBoutique();
  const geo = useMemo(() => (pear ? pearGeo(seg) : brilliantGeo(seg)), [seg, pear]);
  useDisposeAll(useMemo(() => ({ geo }), [geo]));
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const im = ref.current;
    if (!im) return;
    const q = new THREE.Quaternion();
    const mtx = new THREE.Matrix4();
    items.forEach((it, i) => {
      q.setFromUnitVectors(UP, it.n.clone().normalize());
      mtx.compose(it.p, q, new THREE.Vector3(it.s, it.s, it.s * (it.stretch ?? 1)));
      im.setMatrixAt(i, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, garnet ? m.garnet : bright ? m.stoneBright : m.stone, items.length]} frustumCulled={false} />;
}

/* ── N°01 · the solitaire (hero) ── */

export const RING_R = 0.1; // band centreline radius
const BAND = 0.012;
/** Hero stone girdle radius — the brilliant is ~40% of the band's outer
 *  diameter so it keeps a silhouette from the corridor. */
const STONE_R = 0.046;

/** Upright solitaire: band in the XY plane, a tall cathedral setting rising
 *  from the shoulders into a six-claw basket that holds a big round
 *  brilliant. Origin = bottom of the band. */
export function Solitaire() {
  const m = useBoutique();
  const top = RING_R * 2 + BAND; // top of the band
  const basketY = top + 0.03; // basket base
  const girdleY = basketY + 0.028 + STONE_R * 0.82; // pavilion sits in the basket
  const geos = useMemo(() => {
    const cy = RING_R + BAND;
    const parts: THREE.BufferGeometry[] = [
      xf(new THREE.TorusGeometry(RING_R, BAND, 16, 96), { p: [0, cy, 0] }),
      // basket: a tapered collet + a gallery rail under the girdle
      cyl(0.03, 0.018, 0.03, 24, { p: [0, basketY + 0.015, 0] }),
      xf(new THREE.TorusGeometry(STONE_R * 0.78, 0.0035, 6, 32), { r: [Math.PI / 2, 0, 0], p: [0, girdleY - STONE_R * 0.45, 0] }),
    ];
    // cathedral shoulders: tapering arches from the band up into the basket
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const a0 = Math.PI / 2 - sx * 0.62; // band angle where the shoulder leaves
        const p0 = new THREE.Vector3(Math.cos(a0) * RING_R, cy + Math.sin(a0) * RING_R, sz * 0.004);
        const curve = new THREE.CatmullRomCurve3([
          p0,
          new THREE.Vector3(sx * 0.05, top + 0.005, sz * 0.012),
          new THREE.Vector3(sx * 0.03, basketY + 0.018, sz * 0.016),
        ]);
        parts.push(new THREE.TubeGeometry(curve, 18, 0.0048, 6, false));
      }
    }
    // six claws from the basket up over the girdle
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 6;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 0.026, basketY + 0.01, Math.sin(a) * 0.026),
        new THREE.Vector3(Math.cos(a) * (STONE_R + 0.004), girdleY, Math.sin(a) * (STONE_R + 0.004)),
        new THREE.Vector3(Math.cos(a) * (STONE_R * 0.86), girdleY + STONE_R * 0.3, Math.sin(a) * (STONE_R * 0.86)),
      ]);
      parts.push(new THREE.TubeGeometry(c, 10, 0.0036, 6, false));
    }
    return { gold: merge(parts) };
  }, [top, basketY, girdleY]);
  useDisposeAll(geos);
  const stone = useMemo(() => [{ p: new THREE.Vector3(0, girdleY, 0), n: UP.clone(), s: STONE_R }], [girdleY]);
  return (
    <group>
      <mesh geometry={geos.gold} material={m.gold} />
      <Stones items={stone} seg={16} bright />
    </group>
  );
}

/* ── N°02 · the rivière on a velvet neck form ── */

const NECK_DEPTH = 0.07;
const NECK_BEVEL = 0.016;
/** front face of the neck form (native units, height 0.5) */
const NECK_FRONT = NECK_DEPTH / 2 + NECK_BEVEL;

/** The classic jeweller's neck display: a bevelled, flat-backed extruded
 *  silhouette (waist → chest → shoulders → neck), tilted back a few degrees.
 *  Native height 0.5; origin = base centre. */
export function NeckForm({ height = 0.5 }: { height?: number }) {
  const m = useBoutique();
  const geos = useMemo(() => {
    const s = new THREE.Shape();
    // right half, bottom → top, then mirrored back down the left
    // slim bust: the shoulder curve peaks at x≈0.136 (+0.012 bevel), so at
    // height 0.52 the form's half-width is ≈0.154 — well inside a 0.38 case
    const R: [string, number[]][] = [
      ["L", [0.095, 0.03]],
      ["Q", [0.062, 0.1, 0.066, 0.18]],
      ["Q", [0.076, 0.265, 0.128, 0.298]],
      ["Q", [0.148, 0.322, 0.118, 0.34]],
      ["Q", [0.066, 0.352, 0.048, 0.39]],
      ["L", [0.044, 0.482]],
    ];
    s.moveTo(-0.095, 0);
    s.lineTo(0.095, 0);
    for (const [op, a] of R) {
      if (op === "L") s.lineTo(a[0], a[1]);
      else s.quadraticCurveTo(a[0], a[1], a[2], a[3]);
    }
    s.quadraticCurveTo(0, 0.496, -0.044, 0.482);
    for (let i = R.length - 1; i > 0; i--) {
      const [op, a] = R[i];
      const prev = R[i - 1][1];
      const end = prev.length === 2 ? prev : [prev[2], prev[3]];
      if (op === "L") s.lineTo(-end[0], end[1]);
      else s.quadraticCurveTo(-a[0], a[1], -end[0], end[1]);
    }
    s.lineTo(-0.095, 0);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: NECK_DEPTH,
      bevelEnabled: true,
      bevelThickness: NECK_BEVEL,
      bevelSize: 0.012,
      bevelSegments: 4,
      curveSegments: 14,
    });
    g.translate(0, 0.012, -NECK_DEPTH / 2);
    const k = height / 0.5;
    g.scale(k, k, k);
    return { g };
  }, [height]);
  useDisposeAll(geos);
  return <mesh geometry={geos.g} material={m.velvet} />;
}

/** Graduated rivière draped over the neck form's front (same `height`). */
export function Riviere({ height = 0.5 }: { height?: number }) {
  const m = useBoutique();
  const k = height / 0.5;
  const zf = NECK_FRONT + 0.004;
  const front = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        (
          [
            [-0.066, 0.392, zf - 0.012],
            [-0.078, 0.36, zf],
            [-0.06, 0.312, zf],
            [0, 0.284, zf],
            [0.06, 0.312, zf],
            [0.078, 0.36, zf],
            [0.066, 0.392, zf - 0.012],
          ] as const
        ).map(([x, y, z]) => new THREE.Vector3(x * k, y * k, z * k)),
      ),
    [k, zf],
  );
  const geos = useMemo(() => {
    const loop = new THREE.CatmullRomCurve3(
      [
        ...front.getPoints(24),
        new THREE.Vector3(0.062 * k, 0.405 * k, -0.02 * k),
        new THREE.Vector3(0, 0.41 * k, -NECK_FRONT * k),
        new THREE.Vector3(-0.062 * k, 0.405 * k, -0.02 * k),
      ],
      true,
    );
    return { chain: new THREE.TubeGeometry(loop, 160, 0.0032 * k, 6, true) };
  }, [front, k]);
  useDisposeAll(geos);
  const stones = useMemo(() => {
    const out: { p: THREE.Vector3; n: THREE.Vector3; s: number }[] = [];
    const N = 19;
    const fwd = new THREE.Vector3(0, 0.25, 1).normalize();
    for (let i = 0; i < N; i++) {
      const t = (i - (N - 1) / 2) / ((N - 1) / 2); // -1..1
      const p = front.getPointAt(0.5 + t * 0.36);
      const s = (0.0065 + 0.0085 * (1 - Math.abs(t) ** 1.3)) * k;
      out.push({ p: p.clone().add(new THREE.Vector3(0, 0, s * 0.3)), n: fwd, s });
    }
    return out;
  }, [front, k]);
  return (
    <group>
      <mesh geometry={geos.chain} material={m.gold} />
      <Stones items={stones} bright />
    </group>
  );
}

/* ── N°03 · the counter edit ──────────────────────────────────────────────
 * Three pieces, each on its own small display stand so it has a silhouette
 * from the corridor: drop earrings on a brass T-bar, a tennis bracelet round
 * an oval velvet bolster, and the garnet pendant (the room's one accent-
 * coloured object) on a mini neck form. Stations sit at x = -S, 0, +S on
 * the deck; `rake` counter-rotates the stands so they stand plumb. */

const STATION = 0.4;

export function CounterPieces({ rake = 0, scale = 1 }: { rake?: number; scale?: number }) {
  return (
    <group scale={scale}>
      <group position={[-STATION, 0, 0.02]} rotation-x={-rake}>
        <EarringStand />
      </group>
      <group position={[0, 0, 0.02]} rotation-x={-rake}>
        <BraceletEasel />
      </group>
      <group position={[STATION, 0, -0.02]} rotation-x={-rake}>
        <NeckForm height={0.22} />
        <Pendant height={0.22} />
      </group>
    </group>
  );
}

const FRONT = new THREE.Vector3(0, 0.12, 1).normalize();

/** Brass T-bar earring stand with a pair of drop earrings hanging from it. */
function EarringStand() {
  const m = useBoutique();
  const barY = 0.19;
  const ex = 0.05; // earring x
  const geos = useMemo(() => {
    const brass = merge([
      cyl(0.045, 0.05, 0.01, 32, { p: [0, 0.005, 0] }),
      cyl(0.0045, 0.0055, barY - 0.01, 10, { p: [0, 0.01 + (barY - 0.01) / 2, 0] }),
      cyl(0.0042, 0.0042, 0.15, 10, { r: [0, 0, Math.PI / 2], p: [0, barY, 0] }),
      ...[-1, 1].map((sx) => xf(new THREE.SphereGeometry(0.007, 12, 8), { p: [sx * 0.075, barY, 0] })),
    ]);
    const gold: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      // shepherd hook over the bar, a fine link, then a halo collet
      gold.push(xf(new THREE.TorusGeometry(0.0085, 0.0014, 5, 16, Math.PI * 1.3), { r: [0, Math.PI / 2, 0], p: [sx * ex, barY + 0.001, 0] }));
      gold.push(cyl(0.0012, 0.0012, 0.026, 5, { p: [sx * ex, barY - 0.022, 0.008] }));
      gold.push(xf(new THREE.TorusGeometry(0.014, 0.0022, 6, 20), { p: [sx * ex, barY - 0.05, 0.008] }));
    }
    return { brass, gold: merge(gold) };
  }, []);
  useDisposeAll(geos);
  const stones = useMemo(() => {
    const out: { p: THREE.Vector3; n: THREE.Vector3; s: number; stretch?: number }[] = [];
    for (const sx of [-1, 1]) out.push({ p: new THREE.Vector3(sx * ex, barY - 0.05, 0.012), n: FRONT, s: 0.012 });
    return out;
  }, []);
  // pear drops: point up into the halo, the wide end hanging
  const drops = useMemo(
    () => [-1, 1].map((sx) => ({ p: new THREE.Vector3(sx * ex, barY - 0.104, 0.012), n: FRONT, s: 0.024 })),
    [],
  );
  return (
    <group>
      <mesh geometry={geos.brass} material={m.brass} />
      <mesh geometry={geos.gold} material={m.gold} />
      <Stones items={stones} bright />
      <Stones items={drops} bright pear seg={14} />
    </group>
  );
}

/** Tennis bracelet laid on a velvet pad on a low brass easel, leaning back
 *  60° from vertical so the whole oval of stones faces up toward the
 *  corridor camera — it reads as a bracelet on a cushion, not a hoop on a
 *  post. Everything is baked into the tilted frame (no extra draw calls). */
const EASEL_TILT = -Math.PI / 3;
const EASEL_Y = 0.058; // ring centre height (pad's low back edge just clears the deck)
const tilted = (g: THREE.BufferGeometry) => xf(g, { r: [EASEL_TILT, 0, 0], p: [0, EASEL_Y, 0] });

function BraceletEasel() {
  const m = useBoutique();
  const rx = 0.07;
  const ry = 0.052;
  const geos = useMemo(() => {
    // brass kept to thin lines (a flat brass plate under the pool light
    // glared as a yellow block): a strut from the pad's back to a small foot
    // disc, and a slim ledge bar in front that the bracelet's lower edge rests on
    const top = new THREE.Vector3(0, 0.018, -0.032).applyAxisAngle(new THREE.Vector3(1, 0, 0), EASEL_TILT).add(new THREE.Vector3(0, EASEL_Y, 0));
    const strut = new THREE.TubeGeometry(new THREE.LineCurve3(top, new THREE.Vector3(0, 0.006, -0.075)), 1, 0.0032, 6, false);
    const brass = merge([
      strut,
      cyl(0.014, 0.016, 0.006, 20, { p: [0, 0.003, -0.075] }),
      cyl(0.0045, 0.0045, 0.14, 8, { r: [0, 0, Math.PI / 2], p: [0, 0.006, 0.07] }),
      ...[-1, 1].map((sx) => cyl(0.006, 0.007, 0.006, 12, { p: [sx * 0.07, 0.003, 0.07] })),
    ]);
    // a deep velvet pad (the bracelet's "wrist")
    const pad = cyl(1, 1, 0.04, 36, { r: [Math.PI / 2, 0, 0] });
    pad.scale(rx * 0.92, ry * 0.92, 1);
    pad.translate(0, 0, -0.012);
    const line = new THREE.TorusGeometry(1, 0.06, 6, 64);
    line.scale(rx + 0.004, ry + 0.004, 0.05);
    line.translate(0, 0, 0.006);
    return { brass, pad: tilted(pad), line: tilted(line) };
  }, []);
  useDisposeAll(geos);
  const stones = useMemo(() => {
    const out: { p: THREE.Vector3; n: THREE.Vector3; s: number }[] = [];
    const X = new THREE.Vector3(1, 0, 0);
    const N = 30;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const radial = new THREE.Vector3(Math.cos(a) * ry, Math.sin(a) * rx, 0).normalize();
      out.push({
        p: new THREE.Vector3(Math.cos(a) * (rx + 0.006), Math.sin(a) * (ry + 0.006), 0.012).applyAxisAngle(X, EASEL_TILT).add(new THREE.Vector3(0, EASEL_Y, 0)),
        n: radial.multiplyScalar(0.35).add(new THREE.Vector3(0, 0, 1)).normalize().applyAxisAngle(X, EASEL_TILT),
        s: 0.0095,
      });
    }
    return out;
  }, []);
  return (
    <group>
      <mesh geometry={geos.brass} material={m.brass} />
      <mesh geometry={geos.pad} material={m.velvet} />
      <mesh geometry={geos.line} material={m.gold} />
      <Stones items={stones} bright />
    </group>
  );
}

/** Garnet pendant on a fine chain, worn by a NeckForm of the same `height`. */
export function Pendant({ height = 0.5 }: { height?: number }) {
  const m = useBoutique();
  const k = height / 0.5;
  const zf = NECK_FRONT + 0.003;
  const geos = useMemo(() => {
    const loop = new THREE.CatmullRomCurve3(
      (
        [
          [-0.05, 0.43, zf - 0.02],
          [-0.07, 0.37, zf],
          [-0.035, 0.3, zf],
          [0, 0.268, zf],
          [0.035, 0.3, zf],
          [0.07, 0.37, zf],
          [0.05, 0.43, zf - 0.02],
          [0, 0.44, -NECK_FRONT],
        ] as const
      ).map(([x, y, z]) => new THREE.Vector3(x * k, y * k, z * k)),
      true,
    );
    const gold = merge([
      new THREE.TubeGeometry(loop, 120, 0.0045 * k, 5, true),
      xf(new THREE.TorusGeometry(0.014 * k, 0.0045 * k, 6, 16), { p: [0, 0.255 * k, (zf + 0.006) * k] }), // bail
      xf(new THREE.TorusGeometry(0.052 * k, 0.007 * k, 6, 28), { s: [1, 1.34, 1], p: [0, 0.18 * k, (zf + 0.012) * k] }), // bezel
    ]);
    return { gold };
  }, [k, zf]);
  useDisposeAll(geos);
  const stone = useMemo(
    () => [{ p: new THREE.Vector3(0, 0.18 * k, (zf + 0.026) * k), n: new THREE.Vector3(0, 0.1, 1).normalize(), s: 0.05 * k, stretch: 1.34 }],
    [k, zf],
  );
  return (
    <group>
      <mesh geometry={geos.gold} material={m.gold} />
      <Stones items={stone} garnet seg={12} />
    </group>
  );
}
