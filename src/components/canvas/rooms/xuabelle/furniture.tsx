"use client";

import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { ThreeElements } from "@react-three/fiber";
import { PLAQUES, PLQ_ROW, PLQ_W, box, brilliantGeo, cyl, merge, rbox, reeds, useBoutique, useDisposeAll, xf, Contact } from "./kit";

/* ── boutique display furniture ──────────────────────────────────────────────
 * Column vitrine: a lacquered column floating on a shadow-gap toe with a brass
 * hairline, brass top plate, velvet deck, frameless glass case under a
 * lacquer cap whose concealed downlight throws a soft static beam + a warm
 * pool onto the piece. Counter case: the same language, low and long, with a
 * raked velvet deck under a brass-railed glass lid. */

/** A small brass plaque showing row `row` of the shared plaque texture. */
export function Plaque({ row, w = 0.22, ...rest }: { row: number; w?: number } & Omit<ThreeElements["group"], "children">) {
  const m = useBoutique();
  const h = (w * PLQ_ROW) / PLQ_W;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const n = PLAQUES.length;
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i); // 0 bottom / 1 top
      uv.setY(i, 1 - (row + (1 - v)) / n);
    }
    uv.needsUpdate = true;
    return g;
  }, [w, h, row]);
  useDisposeAll(useMemo(() => ({ geo }), [geo]));
  return (
    <group {...rest}>
      <mesh geometry={geo} material={m.plaque} />
    </group>
  );
}

/* ── column vitrine ── */

export function ColumnVitrine({
  h,
  w,
  gw,
  gh,
  plaque,
  reeded = false,
  hero = false,
  children,
}: {
  /** reeded lacquer on the front + side faces */
  reeded?: boolean;
  /** the room's focal piece: a brighter (static) downlight + pool */
  hero?: boolean;
  /** plinth height (top of the brass plate) */
  h: number;
  /** plinth width/depth */
  w: number;
  /** glass case width/depth + height */
  gw: number;
  gh: number;
  plaque?: number;
  children?: ReactNode;
}) {
  const m = useBoutique();
  const geos = useMemo(() => {
    const toe = 0.07;
    const bodyH = h - toe - 0.03;
    const capY = h + gh;
    const flutes: THREE.BufferGeometry[] = [];
    if (reeded) {
      // front + both sides, stopping short of the plaque band at the top
      for (const ry of [0, Math.PI / 2, -Math.PI / 2]) {
        for (const g of reeds(w - 0.05, toe + 0.05, h - 0.2, w / 2)) flutes.push(xf(g, { r: [0, ry, 0] }));
      }
    }
    const lacquer = merge([
      rbox(w, bodyH, w, 0.014, { p: [0, toe + bodyH / 2, 0] }),
      rbox(gw + 0.03, 0.03, gw + 0.03, 0.008, { p: [0, capY + 0.027, 0] }), // slim cap
      ...flutes,
    ]);
    const brass = merge([
      box(w + 0.006, 0.012, w + 0.006, { p: [0, toe + 0.006, 0] }), // hairline above the toe
      rbox(w + 0.036, 0.03, w + 0.036, 0.008, { p: [0, h - 0.015, 0] }), // top plate
      box(gw + 0.036, 0.012, gw + 0.036, { p: [0, capY + 0.006, 0] }), // cap lip (brass edge)
      box(gw + 0.012, 0.018, gw + 0.012, { p: [0, h + 0.009, 0] }), // glass shoe
    ]);
    const gap = box(w - 0.07, toe, w - 0.07, { p: [0, toe / 2, 0] });
    const deck = rbox(gw - 0.04, 0.036, gw - 0.04, 0.012, { p: [0, h + 0.018, 0] });
    const glass = box(gw, gh, gw, { p: [0, h + gh / 2, 0] });
    const edges = new THREE.EdgesGeometry(glass);
    const beam = cyl(0.028, gw * 0.36, gh - 0.06, 28, { p: [0, h + 0.04 + (gh - 0.06) / 2, 0] });
    return { lacquer, brass, gap, deck, glass, edges, beam };
  }, [h, w, gw, gh, reeded]);
  useDisposeAll(geos);
  return (
    <group>
      <Contact w={w * 2.4} d={w * 2.4} />
      <mesh geometry={geos.gap} material={m.gap} />
      <mesh geometry={geos.lacquer} material={m.lacquer} />
      <mesh geometry={geos.brass} material={m.brass} />
      <mesh geometry={geos.deck} material={m.velvet} />
      <mesh material={hero ? m.heroPool : m.pool} position={[0, h + 0.037, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[gw * 0.95, gw * 0.95]} />
      </mesh>
      <group position={[0, h + 0.036, 0]}>{children}</group>
      <mesh geometry={geos.beam} material={hero ? m.heroBeam : m.beam} renderOrder={2} />
      <mesh geometry={geos.glass} material={m.glass} renderOrder={3} />
      <lineSegments geometry={geos.edges} material={m.glassEdge} renderOrder={3} />
      {plaque !== undefined && <Plaque row={plaque} w={Math.min(0.24, w * 0.62)} position={[0, h - 0.12, w / 2 + 0.002]} />}
    </group>
  );
}

/* ── low counter case (front floor strip, ≤ 0.6 tall) ── */

export function CounterCase({
  len = 1.5,
  dep = 0.5,
  bodyH = 0.36,
  gh = 0.22,
  rake = 0.5,
  plaque,
  onMat = false,
  children,
}: {
  /** standing on the bay mat: lift the contact shadow above its top face */
  onMat?: boolean;
  len?: number;
  dep?: number;
  bodyH?: number;
  gh?: number;
  /** deck tilt toward the viewer (rad) */
  rake?: number;
  plaque?: number;
  children?: ReactNode;
}) {
  const m = useBoutique();
  const deckD = dep - 0.08;
  const geos = useMemo(() => {
    const toe = 0.06;
    const top = bodyH;
    const lacquer = rbox(len, bodyH - toe - 0.02, dep, 0.014, { p: [0, toe + (bodyH - toe - 0.02) / 2, 0] });
    const rail = 0.014;
    const gy = top + gh;
    const brass = merge([
      box(len + 0.006, 0.01, dep + 0.006, { p: [0, toe + 0.005, 0] }),
      rbox(len + 0.03, 0.022, dep + 0.03, 0.006, { p: [0, top - 0.011, 0] }),
      // glass-lid rails: long front/back + short ends at the top edge, plus corner posts
      box(len, rail, rail, { p: [0, gy, dep / 2 - rail / 2] }),
      box(len, rail, rail, { p: [0, gy, -dep / 2 + rail / 2] }),
      box(rail, rail, dep, { p: [len / 2 - rail / 2, gy, 0] }),
      box(rail, rail, dep, { p: [-len / 2 + rail / 2, gy, 0] }),
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => box(0.008, gh, 0.008, { p: [sx * (len / 2 - 0.004), top + gh / 2, sz * (dep / 2 - 0.004)] })),
      ),
    ]);
    const gap = box(len - 0.07, toe, dep - 0.07, { p: [0, toe / 2, 0] });
    const glass = box(len - 0.004, gh, dep - 0.004, { p: [0, top + gh / 2, 0] });
    const deck = rbox(len - 0.06, 0.03, deckD, 0.01);
    return { lacquer, brass, gap, glass, deck };
  }, [len, dep, bodyH, gh, deckD]);
  useDisposeAll(geos);
  // deck: hinged at the front edge, raked up toward the back
  const deckY = bodyH + 0.015 + Math.sin(rake) * (deckD / 2);
  return (
    <group>
      <Contact w={len * 1.5} d={dep * 2.6} y={onMat ? 0.016 : 0.006} />
      <mesh geometry={geos.gap} material={m.gap} />
      <mesh geometry={geos.lacquer} material={m.lacquer} />
      <mesh geometry={geos.brass} material={m.brass} />
      <group position={[0, deckY, 0.01]} rotation-x={rake}>
        <mesh geometry={geos.deck} material={m.velvet} />
        <mesh material={m.pool} position={[0, 0.016, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[len * 0.75, deckD * 1.1]} />
        </mesh>
        <group position={[0, 0.015, 0]}>{children}</group>
      </group>
      <mesh geometry={geos.glass} material={m.glass} renderOrder={3} />
      {plaque !== undefined && <Plaque row={plaque} w={0.24} position={[len / 2 - 0.2, bodyH * 0.55, dep / 2 + 0.002]} />}
    </group>
  );
}

/* ── try-on bench (front strip, right of centre) ─────────────────────────────
 * The boutique's seat: a deep button-tufted velvet cushion on a slim
 * lacquered apron, carried on four tapered brass legs with a side stretcher each,
 * and an open lacquer ring box resting on one end. Light on the floor, so it
 * reads as furniture rather than a block. Four draw calls + one stone. */

export function Bench({ len = 1.0, dep = 0.38, seatH = 0.44, onMat = false }: { len?: number; dep?: number; seatH?: number; onMat?: boolean }) {
  const m = useBoutique();
  const cushH = 0.1;
  const baseTop = seatH - cushH;
  // ring box sits on the cushion's right end, turned toward the corridor
  const bx = len / 2 - 0.17;
  const bRot = -0.35;
  const geos = useMemo(() => {
    const apronH = 0.075;
    const legTop = baseTop - apronH;
    const lx = len / 2 - 0.07;
    const lz = dep / 2 - 0.06;
    const box0 = { bw: 0.13, bh: 0.055, bd: 0.1 };
    // ring box, in its own frame then turned + placed on the cushion
    const boxAt = (g: THREE.BufferGeometry) => xf(g, { r: [0, bRot, 0], p: [bx, seatH - 0.008, 0.02] });
    const lidHinge = (g: THREE.BufferGeometry) => {
      // lid opened ~105°, hinged at the box's back top edge
      g.rotateX(-1.83);
      g.translate(0, box0.bh, -box0.bd / 2);
      return boxAt(g);
    };
    const lacquer = merge([
      rbox(len - 0.02, apronH, dep - 0.02, 0.012, { p: [0, legTop + apronH / 2, 0] }),
      boxAt(rbox(box0.bw, box0.bh, box0.bd, 0.008, { p: [0, box0.bh / 2, 0] })),
      lidHinge(rbox(box0.bw, 0.02, box0.bd, 0.006, { p: [0, 0.01, box0.bd / 2] })),
    ]);
    const brass = merge([
      // hairline under the apron + the seat's brass lip
      box(len + 0.004, 0.01, dep + 0.004, { p: [0, legTop + 0.005, 0] }),
      rbox(len + 0.01, 0.014, dep + 0.01, 0.004, { p: [0, baseTop - 0.007, 0] }),
      // tapered legs with sabots, and a stretcher along each side
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].flatMap((sz) => [
          cyl(0.013, 0.008, legTop - 0.02, 12, { p: [sx * lx, 0.02 + (legTop - 0.02) / 2, sz * lz] }),
          cyl(0.011, 0.011, 0.02, 12, { p: [sx * lx, 0.01, sz * lz] }),
        ]),
      ),
      ...[-1, 1].map((sz) => cyl(0.005, 0.005, lx * 2, 8, { r: [0, 0, Math.PI / 2], p: [0, 0.1, sz * lz] })),
      // tufting buttons, two staggered rows
      ...[-2, -1, 0, 1, 2].flatMap((i) => [
        xf(new THREE.SphereGeometry(0.009, 10, 6), { s: [1, 0.5, 1], p: [i * (len / 5.6), seatH - 0.004, -dep * 0.2] }),
        ...(i < 2 ? [xf(new THREE.SphereGeometry(0.009, 10, 6), { s: [1, 0.5, 1], p: [(i + 0.5) * (len / 5.6), seatH - 0.004, dep * 0.2] })] : []),
      ]),
      // box clasp + the ring standing in the insert slit
      boxAt(box(0.018, 0.012, 0.004, { p: [0, box0.bh - 0.01, box0.bd / 2 + 0.002] })),
      boxAt(xf(new THREE.TorusGeometry(0.026, 0.004, 10, 40), { p: [0, box0.bh + 0.024, 0.008] })),
    ]);
    const velvet = merge([
      rbox(len, cushH, dep, 0.04, { p: [0, baseTop + cushH / 2, 0] }),
      boxAt(rbox(box0.bw - 0.016, 0.01, box0.bd - 0.016, 0.004, { p: [0, box0.bh + 0.001, 0] })),
      lidHinge(rbox(box0.bw - 0.016, 0.004, box0.bd - 0.016, 0.002, { p: [0, -0.001, box0.bd / 2] })),
    ]);
    return { lacquer, brass, velvet };
  }, [len, dep, seatH, baseTop, bx, bRot]);
  useDisposeAll(geos);
  const stone = useMemo(() => {
    const p = new THREE.Vector3(0, 0.055 + 0.06, 0.008).applyAxisAngle(new THREE.Vector3(0, 1, 0), bRot);
    p.add(new THREE.Vector3(bx, seatH - 0.008, 0.02));
    return [{ p, n: new THREE.Vector3(0, 1, 0), s: 0.014 }];
  }, [bx, bRot, seatH]);
  return (
    <group>
      <Contact w={len * 1.4} d={dep * 2.4} y={onMat ? 0.016 : 0.006} />
      <mesh geometry={geos.lacquer} material={m.lacquer} />
      <mesh geometry={geos.brass} material={m.brass} />
      <mesh geometry={geos.velvet} material={m.upholstery} />
      <BenchStone items={stone} />
    </group>
  );
}

function BenchStone({ items }: { items: { p: THREE.Vector3; n: THREE.Vector3; s: number }[] }) {
  const m = useBoutique();
  const geo = useMemo(() => {
    const g = brilliantGeo(12);
    const it = items[0];
    g.scale(it.s, it.s, it.s);
    g.translate(it.p.x, it.p.y, it.p.z);
    return g;
  }, [items]);
  useDisposeAll(useMemo(() => ({ geo }), [geo]));
  return <mesh geometry={geo} material={m.stoneBright} />;
}
