"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roundRect, useTextTexture } from "../../canvas2d";
import { INK, accentInk, fonts, track } from "../holo";
import { Seedlings, useDeferredDispose, type NurseryMats, type Sprout } from "./kit";

/* ── HERO: the streak bed ─────────────────────────────────────────────────────
 * The streak made physical. A walnut display bed raked toward the visitor in
 * seven terraces — one terrace per week, seven cells per terrace, one
 * seedling planted for every clean day. Week one is the top terrace at the
 * back and fully grown; each step down is a week younger; today's seed sits
 * front-right under the only lit ring in the room's lower frame. Each
 * terrace has its own machined nosing, so the weeks read as seven distinct
 * bands of growth from the dwell camera (not a hedge). The fascia plaque
 * carries the count so the idea lands before anyone opens the panel.
 * ──────────────────────────────────────────────────────────────────────── */

export const DAYS = 49;
const COLS = 7;
const ROWS = 7;

export const BED = { w: 2.3, d: 1.34 } as const;
const PLINTH_H = 0.05;
const WALL = 0.055;
const FRONT_SOIL = 0.3; // soil height of the front (youngest) terrace
const RISE = 0.034; // each week back steps up by this
const LIP = 0.036; // walls stand this far proud of the soil they hold
const FRONT_LIP = 0.014; // …except the front wall, kept low so today's row shows
const INNER_W = BED.w - WALL * 2;
const INNER_D = BED.d - WALL * 2;
const PITCH_X = INNER_W / COLS;
const PITCH_Z = INNER_D / ROWS;
/** soil height of week row r (0 = week one, back). */
const soilY = (r: number) => FRONT_SOIL + (ROWS - 1 - r) * RISE;
const BACK_SOIL = soilY(0);

const PLAQUE_W = 1.44;
const PLAQUE_CW = 1024;
const PLAQUE_CH = 144;
const PLAQUE_H = PLAQUE_W * (PLAQUE_CH / PLAQUE_CW);

/** Cell centre for day d (0 = the first clean day, back-left). */
function cell(d: number) {
  const c = d % COLS;
  const r = Math.floor(d / COLS);
  return {
    x: -INNER_W / 2 + PITCH_X * (c + 0.5),
    z: -INNER_D / 2 + PITCH_Z * (r + 0.5),
    y: soilY(r),
  };
}

function usePlaquePainter(accent: string) {
  return useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { ser, mono } = fonts();
      // inlaid dark glass plaque with a hairline machined edge
      roundRect(ctx, 2, 2, w - 4, h - 4, 16);
      ctx.fillStyle = "#10141f";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.2)";
      ctx.stroke();
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `600 124px ${ser}`;
      ctx.fillText("49", 44, h - 26);
      const nx = 44 + ctx.measureText("49").width + 30;
      ctx.fillStyle = "rgba(244,241,234,0.16)";
      ctx.fillRect(nx - 16, 28, 2, h - 56);
      ctx.fillStyle = accentInk(accent, 0.2);
      ctx.font = `600 54px ${mono}`;
      track(ctx, 0.08, 54);
      ctx.fillText("DAYS CLEAN", nx + 10, 66);
      ctx.fillStyle = "rgba(244,241,234,0.86)";
      ctx.font = `500 50px ${mono}`;
      track(ctx, 0.04, 50);
      ctx.fillText("ONE SEEDLING A DAY", nx + 10, 124);
      track(ctx, 0);
    },
    [accent],
  );
}

/** Side panels: ONE continuous raked walnut cheek per side (a trapezoid that
 *  follows the terrace rise), so the bed's ends read as a single piece of
 *  joinery with a steel nosing along the slope — not a ladder of blocks. */
const CHEEK_FRONT = FRONT_SOIL + 0.03;
const CHEEK_BACK = BACK_SOIL + LIP + 0.016;
function makeCheekGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const z0 = -BED.d / 2;
  const z1 = BED.d / 2;
  s.moveTo(z1, PLINTH_H);
  s.lineTo(z1, CHEEK_FRONT);
  s.lineTo(z0, CHEEK_BACK);
  s.lineTo(z0, PLINTH_H);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: WALL, bevelEnabled: false });
  g.rotateY(-Math.PI / 2); // shape X → +z, extrusion → −x
  g.translate(WALL / 2, 0, 0);
  return g;
}
const SLOPE = Math.atan2(CHEEK_BACK - CHEEK_FRONT, BED.d);
const SLOPE_LEN = Math.hypot(BED.d, CHEEK_BACK - CHEEK_FRONT);

/** Brushed-steel irrigation manifold along the back wall: one header pipe
 *  with end brackets and a drip valve over each of the seven columns — the
 *  bed's one piece of ship hardware (no emitters). */
function Manifold({ mats }: { mats: NurseryMats }) {
  const valveRef = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.CylinderGeometry(0.011, 0.011, 0.032, 12), []);
  useDeferredDispose(geo);
  const y = CHEEK_BACK + 0.028;
  const z = -BED.d / 2 + WALL * 0.5;
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (let c = 0; c < COLS; c++) {
      o.position.set(-INNER_W / 2 + PITCH_X * (c + 0.5), y + 0.004, z + 0.016);
      o.rotation.set(Math.PI / 2 - 0.5, 0, 0);
      o.updateMatrix();
      valveRef.current?.setMatrixAt(c, o.matrix);
    }
    if (valveRef.current) {
      valveRef.current.instanceMatrix.needsUpdate = true;
      valveRef.current.computeBoundingSphere();
    }
  }, [y, z]);
  return (
    <group>
      <mesh position={[0, y, z]} rotation-z={Math.PI / 2} material={mats.steel}>
        <cylinderGeometry args={[0.012, 0.012, BED.w - 0.04, 16]} />
      </mesh>
      {/* end caps + brackets in satin steel (polished lip read as a stray white speck) */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (BED.w / 2 - 0.02), y, z]} rotation-z={Math.PI / 2} material={mats.steel}>
            <cylinderGeometry args={[0.016, 0.016, 0.03, 16]} />
          </mesh>
          <mesh position={[s * (BED.w / 2 - 0.02), (CHEEK_BACK + y) / 2, z]} material={mats.steel}>
            <boxGeometry args={[0.022, y - CHEEK_BACK, 0.014]} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={valveRef} args={[geo, mats.lip, COLS]} />
    </group>
  );
}

export function StreakBed({
  accent,
  mats,
  animate,
  plaque = true,
}: {
  accent: string;
  mats: NurseryMats;
  animate: boolean;
  plaque?: boolean;
}) {
  const terraceRef = useRef<THREE.InstancedMesh>(null);
  const soilRef = useRef<THREE.InstancedMesh>(null);
  const nosingRef = useRef<THREE.InstancedMesh>(null);
  const collarRef = useRef<THREE.InstancedMesh>(null);
  const sprouts = useMemo<Sprout[]>(
    () =>
      Array.from({ length: DAYS }, (_, d) => {
        const { x, y, z } = cell(d);
        return { x, y: y + 0.004, z, age: 1 - d / (DAYS - 1), seed: d * 3.7 + 1 };
      }),
    [],
  );
  const geos = useMemo(
    () => ({
      box: new THREE.BoxGeometry(1, 1, 1),
      collar: new THREE.CylinderGeometry(0.05, 0.046, 0.016, 24, 1, true),
      cheek: makeCheekGeometry(),
    }),
    [],
  );
  useDeferredDispose(geos);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (let r = 0; r < ROWS; r++) {
      const zc = -INNER_D / 2 + PITCH_Z * (r + 0.5);
      const top = soilY(r);
      // walnut terrace block (its front face is the week's riser)
      o.position.set(0, (PLINTH_H + top - 0.012) / 2, zc);
      o.scale.set(INNER_W, top - 0.012 - PLINTH_H, PITCH_Z);
      o.updateMatrix();
      terraceRef.current?.setMatrixAt(r, o.matrix);
      // soil, set just behind the machined nosing
      o.position.set(0, top - 0.006, zc - 0.006);
      o.scale.set(INNER_W, 0.012, PITCH_Z - 0.012);
      o.updateMatrix();
      soilRef.current?.setMatrixAt(r, o.matrix);
      // nosing along each terrace's front edge (the front row's is the wall cap)
      o.position.set(0, top - 0.004, zc + PITCH_Z / 2 - 0.006);
      o.scale.set(INNER_W, 0.016, 0.012);
      o.updateMatrix();
      nosingRef.current?.setMatrixAt(r, o.matrix);
    }
    for (let d = 0; d < DAYS; d++) {
      const { x, y, z } = cell(d);
      o.position.set(x, y + 0.004, z);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      collarRef.current?.setMatrixAt(d, o.matrix);
    }
    for (const ref of [terraceRef, soilRef, nosingRef, collarRef]) {
      if (!ref.current) continue;
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, []);

  const paint = usePlaquePainter(accent);
  const plaqueTex = useTextTexture(PLAQUE_CW, PLAQUE_CH, paint);
  const today = cell(DAYS - 1);
  const frontTop = FRONT_SOIL + FRONT_LIP;
  const backTop = BACK_SOIL + LIP;

  return (
    <group>
      {/* recessed dark plinth: a quiet shadow gap under the bed */}
      <mesh position={[0, PLINTH_H / 2, 0]} material={mats.plinth}>
        <boxGeometry args={[BED.w - 0.08, PLINTH_H, BED.d - 0.08]} />
      </mesh>
      {/* walnut shell: front + back walls and two continuous raked cheeks */}
      <mesh position={[0, (PLINTH_H + frontTop) / 2, BED.d / 2 - WALL / 2]} material={mats.walnut}>
        <boxGeometry args={[BED.w - WALL * 2, frontTop - PLINTH_H, WALL]} />
      </mesh>
      <mesh position={[0, (PLINTH_H + backTop) / 2, -BED.d / 2 + WALL / 2]} material={mats.walnut}>
        <boxGeometry args={[BED.w - WALL * 2, backTop - PLINTH_H, WALL]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (BED.w / 2 - WALL / 2), 0, 0]}>
          <mesh geometry={geos.cheek} material={mats.walnut} />
          {/* steel nosing following the rake */}
          <mesh position={[0, (CHEEK_FRONT + CHEEK_BACK) / 2 + 0.006, 0]} rotation-x={SLOPE} material={mats.body}>
            <boxGeometry args={[WALL + 0.012, 0.012, SLOPE_LEN + 0.004]} />
          </mesh>
        </group>
      ))}
      {/* machined steel caps on the front and back walls (between the cheeks) */}
      <mesh position={[0, frontTop + 0.006, BED.d / 2 - WALL / 2]} material={mats.lip}>
        <boxGeometry args={[BED.w - WALL * 2, 0.012, WALL + 0.012]} />
      </mesh>
      <mesh position={[0, backTop + 0.006, -BED.d / 2 + WALL / 2]} material={mats.lip}>
        <boxGeometry args={[BED.w - WALL * 2, 0.012, WALL + 0.012]} />
      </mesh>
      <Manifold mats={mats} />
      {/* seven week terraces */}
      <instancedMesh ref={terraceRef} args={[geos.box, mats.walnut, ROWS]} />
      <instancedMesh ref={soilRef} args={[geos.box, mats.soil, ROWS]} />
      <instancedMesh ref={nosingRef} args={[geos.box, mats.lip, ROWS]} />
      {/* 49 low glazed-ceramic cell collars */}
      <instancedMesh ref={collarRef} args={[geos.collar, mats.ceramic, DAYS]} />
      {/* today: the one lit ring on the bed */}
      <mesh position={[today.x, today.y + 0.014, today.z]} rotation-x={Math.PI / 2} material={mats.ledLine}>
        <torusGeometry args={[0.07, 0.005, 8, 48]} />
      </mesh>
      <Seedlings sprouts={sprouts} mats={mats} animate={animate} />
      {/* fascia plaque, an inset panel so the walnut still carries the bed */}
      {plaque && (
        <mesh position={[0, (PLINTH_H + frontTop) / 2 + 0.004, BED.d / 2 + 0.002]}>
          <planeGeometry args={[PLAQUE_W, PLAQUE_H]} />
          <meshBasicMaterial map={plaqueTex} color="#dedede" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
