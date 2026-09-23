import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { stripForMerge } from "./geo";

/* ── SelfQuest hero avatar ────────────────────────────────────────────────────
 * The player's character from the app — an armoured knight — at the moment
 * of LEVEL-UP: greatsword thrust straight up in one gauntlet, a kite shield
 * braced on the other forearm, feet planted. The body underneath is an
 * athlete (V-taper, quads, calves): the workouts built this hero. Hologram
 * detail only reads at the OUTLINE, so the armour is exaggerated there: a
 * flat-topped great helm with a cross visor and a tall comb crest, flared
 * layered pauldrons, a breastplate, a plated skirt + tabard that breaks the
 * leg line, winged knee cops, greaves, sabatons.
 *
 * The figure is ONE continuous sculpted surface: a signed-distance field of
 * tapered limb segments, torso masses and armour plates combined with smooth
 * unions (muscle blends softly; armour blends with small radii so the plates
 * read as plates), meshed once with surface nets. Built lazily off the
 * critical path and cached for the session. The sword is a separate hard
 * object with its own material (see buildSwordGeometry). Units: a 1.8 m
 * adult; origin between the feet on the floor, +z = facing. */

type V3 = [number, number, number];

/* primitives: 0 = round cone (a, b, ra, rb), 1 = ellipsoid (c, r),
 * 2 = vertical capped cone / cylinder (c, half-height h, bottom radius r1,
 * top radius r2, depth scale zs, edge rounding rnd). `neg` primitives are
 * CARVED out of everything before them (visor slits) — keep them last. */
type Prim =
  | { t: 0; a: V3; b: V3; ra: number; rb: number; k: number; neg?: boolean }
  | { t: 1; c: V3; r: V3; k: number; neg?: boolean }
  | { t: 2; c: V3; h: number; r1: number; r2: number; zs: number; rnd: number; k: number; neg?: boolean };

const cone = (a: V3, b: V3, ra: number, rb: number, k = 0.03): Prim => ({ t: 0, a, b, ra, rb, k });
const ell = (c: V3, r: V3, k = 0.05): Prim => ({ t: 1, c, r, k });
const frustum = (c: V3, h: number, r1: number, r2: number, zs = 1, rnd = 0.01, k = 0.012): Prim => ({
  t: 2, c, h, r1, r2, zs, rnd, k,
});
const carve = (c: V3, r: V3): Prim => ({ t: 1, c, r, k: 0.004, neg: true });
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ── the pose (metres) ── */
const R_SH: V3 = [0.2, 1.44, -0.012]; // raised (right, +x) shoulder
const R_EL: V3 = [0.225, 1.725, -0.024];
const R_WR: V3 = [0.232, 1.98, -0.006];
const R_FIST: V3 = [0.234, 2.03, 0.0];
const L_SH: V3 = [-0.2, 1.415, -0.012];
const L_EL: V3 = [-0.315, 1.16, -0.004]; // forearm brought forward under the shield
const L_WR: V3 = [-0.3, 1.035, 0.125];
const SHIELD: V3 = [-0.305, 0.975, 0.168]; // kite shield centre, on the forearm

function limbArm(sh: V3, el: V3, wr: V3): Prim[] {
  const mid = lerp3(sh, el, 0.45);
  const fa = lerp3(el, wr, 0.28);
  return [
    ell(lerp3(sh, el, 0.1), [0.074, 0.072, 0.07], 0.05), // deltoid cap
    cone(sh, mid, 0.062, 0.055, 0.03), // upper arm
    cone(mid, el, 0.055, 0.039, 0.012),
    cone(el, fa, 0.039, 0.046, 0.012), // forearm swell
    cone(fa, wr, 0.046, 0.028, 0.01),
  ];
}

function limbLeg(s: 1 | -1): Prim[] {
  const hip: V3 = [0.095 * s, 0.94, 0.0];
  const knee: V3 = [0.13 * s, 0.5, 0.03];
  const ankle: V3 = [0.15 * s, 0.085, -0.012];
  // one tapered bone per segment (no creases) + muscle masses blended over it
  const quad = lerp3(hip, knee, 0.38);
  const calf = lerp3(knee, ankle, 0.3);
  return [
    cone(hip, knee, 0.082, 0.052, 0.04),
    ell([quad[0] + 0.004 * s, quad[1], quad[2] + 0.012], [0.078, 0.17, 0.082], 0.05), // quads
    cone(knee, ankle, 0.052, 0.034, 0.02),
    ell([calf[0], calf[1], calf[2] - 0.016], [0.056, 0.115, 0.06], 0.04), // calf
    // foot: heel → toe, turned out a little
    cone([0.148 * s, 0.045, -0.045], [0.172 * s, 0.032, 0.14], 0.042, 0.03, 0.03),
  ];
}

/** Knee cop (with a side wing), greave, boot cuff and sabaton on each leg. */
function armourLeg(s: 1 | -1): Prim[] {
  return [
    ell([0.132 * s, 0.505, 0.066], [0.062, 0.056, 0.044], 0.01), // knee cop
    ell([0.176 * s, 0.505, 0.05], [0.022, 0.05, 0.04], 0.008), // cop wing
    ell([0.143 * s, 0.3, 0.03], [0.058, 0.142, 0.05], 0.012), // greave
    ell([0.15 * s, 0.13, -0.004], [0.06, 0.066, 0.064], 0.012), // boot cuff
    cone([0.15 * s, 0.07, 0.0], [0.176 * s, 0.045, 0.16], 0.05, 0.034, 0.02), // sabaton
  ];
}

const PRIMS: Prim[] = [
  // trunk masses, smooth-unioned into one torso
  ell([0, 0.955, -0.01], [0.146, 0.105, 0.1], 0.06), // pelvis
  ell([0.064, 0.93, -0.048], [0.074, 0.088, 0.064], 0.05), // glutes
  ell([-0.064, 0.93, -0.048], [0.074, 0.088, 0.064], 0.05),
  ell([0, 1.1, 0.0], [0.128, 0.12, 0.092], 0.07), // waist / abdomen
  ell([0, 1.27, 0.008], [0.172, 0.15, 0.114], 0.07), // ribcage
  ell([0.078, 1.31, 0.052], [0.09, 0.072, 0.06], 0.04), // pecs
  ell([-0.078, 1.31, 0.052], [0.09, 0.072, 0.06], 0.04),
  ell([0, 1.33, -0.028], [0.205, 0.125, 0.098], 0.06), // lats / upper back (V-taper)
  ell([0, 1.43, -0.014], [0.212, 0.06, 0.086], 0.05), // shoulder girdle + traps
  cone([0, 1.44, -0.014], [0, 1.6, 0.01], 0.07, 0.056, 0.04), // neck
  // ── the ARMOUR (the app's knight): crisp small blends so plates read as
  // plates over the body, not as more muscle
  // great helm: a flat-topped drum, a nasal/breath ridge, a gorget lip and a
  // tall comb crest
  frustum([0, 1.695, 0.014], 0.1, 0.1, 0.092, 1.08, 0.014, 0.012),
  ell([0, 1.672, 0.112], [0.013, 0.085, 0.014], 0.008),
  ell([0, 1.598, 0.02], [0.112, 0.022, 0.108], 0.012),
  ell([0, 1.872, -0.012], [0.017, 0.074, 0.128], 0.014),
  // flared, layered pauldrons — big enough to hold the silhouette
  ell([-0.25, 1.476, -0.01], [0.128, 0.064, 0.12], 0.012), // left
  ell([-0.286, 1.414, -0.01], [0.114, 0.046, 0.112], 0.01),
  ell([-0.312, 1.362, -0.01], [0.1, 0.04, 0.102], 0.01),
  ell([-0.192, 1.53, -0.01], [0.022, 0.052, 0.1], 0.008), // raised haute-piece
  ell([0.248, 1.5, -0.012], [0.118, 0.072, 0.12], 0.012), // right (sword arm)
  ell([0.274, 1.438, -0.012], [0.104, 0.046, 0.108], 0.01),
  ell([0.19, 1.556, -0.012], [0.022, 0.05, 0.1], 0.008),
  ell([0, 1.27, 0.034], [0.166, 0.142, 0.1], 0.018), // breastplate
  ell([0, 1.3, 0.132], [0.012, 0.11, 0.012], 0.01), // breastplate keel
  ell([0, 1.0, -0.004], [0.162, 0.032, 0.12], 0.008), // belt
  // plated skirt flaring over the thighs + a tabard panel down the front:
  // this is what turns "a figure in a bodysuit" into "a knight"
  frustum([0, 0.862, -0.004], 0.125, 0.212, 0.158, 0.78, 0.012, 0.02),
  ell([0, 0.78, 0.13], [0.084, 0.2, 0.018], 0.012),
  ...limbArm(R_SH, R_EL, R_WR),
  ell(lerp3(R_EL, R_WR, 0.62), [0.058, 0.098, 0.058], 0.01), // bracer
  ell(R_FIST, [0.046, 0.056, 0.05], 0.012), // gauntlet
  ...limbArm(L_SH, L_EL, L_WR),
  ell(lerp3(L_EL, L_WR, 0.6), [0.054, 0.06, 0.056], 0.01), // bracer
  // kite shield braced on the forearm: broad top lobe, tapering point, boss
  ell([SHIELD[0], SHIELD[1] + 0.07, SHIELD[2]], [0.158, 0.122, 0.02], 0.05),
  ell([SHIELD[0], SHIELD[1] - 0.11, SHIELD[2]], [0.096, 0.172, 0.02], 0.06),
  ell([SHIELD[0], SHIELD[1] + 0.03, SHIELD[2] + 0.02], [0.034, 0.034, 0.018], 0.01),
  ...limbLeg(1),
  ...limbLeg(-1),
  ...armourLeg(1),
  ...armourLeg(-1),
  // carved last: the great helm's visor — eye slit + two breaths
  carve([0, 1.722, 0.118], [0.078, 0.0095, 0.05]),
  carve([0.045, 1.655, 0.118], [0.006, 0.028, 0.05]),
  carve([-0.045, 1.655, 0.118], [0.006, 0.028, 0.05]),
];

/* ── field ── */
type Compiled = {
  t: number;
  k: number;
  // bounding sphere for early-out
  bx: number; by: number; bz: number; br: number;
  // cone
  ax: number; ay: number; az: number; bax: number; bay: number; baz: number;
  l2: number; rr: number; a2: number; il2: number; r1: number; r2: number;
  // ellipsoid (+ frustum centre)
  cx: number; cy: number; cz: number; rx: number; ry: number; rz: number;
  // frustum
  fh: number; f1: number; f2: number; fzs: number; frnd: number;
  neg: boolean;
};

function compile(p: Prim): Compiled {
  const z = {
    ax: 0, ay: 0, az: 0, bax: 0, bay: 0, baz: 0, l2: 1, rr: 0, a2: 1, il2: 1, r1: 0, r2: 0,
    cx: 0, cy: 0, cz: 0, rx: 1, ry: 1, rz: 1, fh: 0, f1: 0, f2: 0, fzs: 1, frnd: 0, neg: !!p.neg,
  };
  if (p.t === 2) {
    const rm = Math.max(p.r1, p.r2) * Math.max(1, p.zs);
    return {
      ...z, t: 2, k: p.k,
      bx: p.c[0], by: p.c[1], bz: p.c[2], br: Math.hypot(p.h, rm) + p.rnd,
      cx: p.c[0], cy: p.c[1], cz: p.c[2],
      fh: p.h - p.rnd, f1: p.r1 - p.rnd, f2: p.r2 - p.rnd, fzs: p.zs, frnd: p.rnd,
    };
  }
  if (p.t === 0) {
    const bax = p.b[0] - p.a[0];
    const bay = p.b[1] - p.a[1];
    const baz = p.b[2] - p.a[2];
    const l2 = bax * bax + bay * bay + baz * baz;
    const rr = p.ra - p.rb;
    const half = Math.sqrt(l2) / 2;
    return {
      ...z, t: 0, k: p.k,
      bx: p.a[0] + bax / 2, by: p.a[1] + bay / 2, bz: p.a[2] + baz / 2, br: half + Math.max(p.ra, p.rb),
      ax: p.a[0], ay: p.a[1], az: p.a[2], bax, bay, baz, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, r1: p.ra, r2: p.rb,
    };
  }
  return {
    ...z, t: 1, k: p.k,
    bx: p.c[0], by: p.c[1], bz: p.c[2], br: Math.max(p.r[0], p.r[1], p.r[2]),
    cx: p.c[0], cy: p.c[1], cz: p.c[2], rx: p.r[0], ry: p.r[1], rz: p.r[2],
  };
}

function primDist(q: Compiled, x: number, y: number, z: number): number {
  if (q.t === 2) {
    // iq's capped cone (vertical), elliptical in depth, rounded edges
    const px = x - q.cx;
    const pz = (z - q.cz) / q.fzs;
    const qx = Math.sqrt(px * px + pz * pz);
    const qy = y - q.cy;
    const h = q.fh;
    const k2x = q.f2 - q.f1;
    const k2y = 2 * h;
    const cax = qx - Math.min(qx, qy < 0 ? q.f1 : q.f2);
    const cay = Math.abs(qy) - h;
    const t = Math.min(Math.max(((q.f2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y), 0), 1);
    const cbx = qx - q.f2 + k2x * t;
    const cby = qy - h + k2y * t;
    const s = cbx < 0 && cay < 0 ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby)) - q.frnd;
  }
  if (q.t === 1) {
    const px = (x - q.cx) / q.rx;
    const py = (y - q.cy) / q.ry;
    const pz = (z - q.cz) / q.rz;
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const k1 = Math.sqrt((px / q.rx) ** 2 + (py / q.ry) ** 2 + (pz / q.rz) ** 2);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(q.rx, q.ry, q.rz);
  }
  // iq's exact round cone
  const pax = x - q.ax;
  const pay = y - q.ay;
  const paz = z - q.az;
  const yv = pax * q.bax + pay * q.bay + paz * q.baz;
  const zv = yv - q.l2;
  const xx = pax * q.l2 - q.bax * yv;
  const xy = pay * q.l2 - q.bay * yv;
  const xz = paz * q.l2 - q.baz * yv;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = yv * yv * q.l2;
  const z2 = zv * zv * q.l2;
  const k = Math.sign(q.rr) * q.rr * q.rr * x2;
  if (Math.sign(zv) * q.a2 * z2 > k) return Math.sqrt(x2 + z2) * q.il2 - q.r2;
  if (Math.sign(yv) * q.a2 * y2 < k) return Math.sqrt(x2 + y2) * q.il2 - q.r1;
  return (Math.sqrt(x2 * q.a2 * q.il2) + yv * q.rr) * q.il2 - q.r1;
}

type Field = {
  /** exact field over the primitive subset `ids[0..n)` (all when ids is null) */
  f: (x: number, y: number, z: number, ids?: Int32Array | null, n?: number) => number;
  /** fill `out` with the primitives that can affect points within `rad` of
   *  (x, y, z), given the field there is ≤ `dUp`; returns the count */
  cull: (x: number, y: number, z: number, rad: number, dUp: number, out: Int32Array) => number;
  count: number;
};

function makeField(prims: Prim[]): Field {
  const C = prims.map(compile);
  const f = (x: number, y: number, z: number, ids: Int32Array | null = null, n = C.length) => {
    let d = 1e9;
    for (let m = 0; m < n; m++) {
      const q = C[ids ? ids[m] : m];
      const dx = x - q.bx;
      const dy = y - q.by;
      const dz = z - q.bz;
      // early out: this primitive can't affect the running min (+ its blend)
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - q.br;
      if (q.neg) {
        // carve: only changes d where the carved volume is nearer than -d
        if (lb >= -d) continue;
        d = Math.max(d, -primDist(q, x, y, z));
        continue;
      }
      if (lb > d + q.k) continue;
      const e = primDist(q, x, y, z);
      // polynomial smooth min
      const h = Math.max(q.k - Math.abs(d - e), 0) / q.k;
      d = Math.min(d, e) - h * h * q.k * 0.25;
    }
    return d;
  };
  const cull = (x: number, y: number, z: number, rad: number, dUp: number, out: Int32Array) => {
    let n = 0;
    for (let m = 0; m < C.length; m++) {
      const q = C[m];
      const lb = Math.hypot(x - q.bx, y - q.by, z - q.bz) - q.br - rad;
      if (lb <= dUp + rad + q.k) out[n++] = m;
    }
    return n;
  };
  return { f, cull, count: C.length };
}

/* ── naive surface nets ── */
/** Generator: yields between small slices of work so the caller can spread
 *  the meshing over idle time (see getAthleteGeometry). */
function* surfaceNets(field: Field, min: V3, max: V3, h: number): Generator<void, THREE.BufferGeometry> {
  const f = field.f;
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  // narrow band: sample a coarse grid (step S·h) first; a fine sample is only
  // evaluated exactly when some coarse corner of its block is near the surface
  const S = 4;
  const cx = Math.ceil((nx - 1) / S) + 1;
  const cy = Math.ceil((ny - 1) / S) + 1;
  const cz = Math.ceil((nz - 1) / S) + 1;
  const C = new Float32Array(cx * cy * cz);
  const cid = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++) C[cid(i, j, k)] = f(min[0] + i * S * h, min[1] + j * S * h, min[2] + k * S * h);
    yield;
  }
  const band = S * h * 1.8;
  const ids = new Int32Array(field.count);
  const rad = S * h * 0.9; // block half-diagonal
  for (let kb = 0; kb < cz - 1; kb++)
    for (let jb = 0; jb < cy - 1; jb++) {
      yield;
      for (let ib = 0; ib < cx - 1; ib++) {
        let far = true;
        let sgn = 0;
        let dMax = -1e9;
        for (let c = 0; c < 8; c++) {
          const d = C[cid(ib + (c & 1), jb + ((c >> 1) & 1), kb + ((c >> 2) & 1))];
          if (Math.abs(d) < band || (sgn !== 0 && Math.sign(d) !== sgn)) far = false;
          sgn = Math.sign(d);
          dMax = Math.max(dMax, d);
        }
        const i1 = Math.min((ib + 1) * S, nx - 1);
        const j1 = Math.min((jb + 1) * S, ny - 1);
        const k1 = Math.min((kb + 1) * S, nz - 1);
        let n = 0;
        if (!far) {
          const bx = min[0] + (ib + 0.5) * S * h;
          const by = min[1] + (jb + 0.5) * S * h;
          const bz = min[2] + (kb + 0.5) * S * h;
          n = field.cull(bx, by, bz, rad, dMax + rad, ids);
        }
        for (let k = kb * S; k <= k1; k++)
          for (let j = jb * S; j <= j1; j++)
            for (let i = ib * S; i <= i1; i++)
              F[id(i, j, k)] = far ? sgn * band : f(min[0] + i * h, min[1] + j * h, min[2] + k * h, ids, n);
      }
    }

  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  // corner c = (c&1, c>>1&1, c>>2&1); 12 cube edges as corner pairs
  const OFF = new Int32Array(8);
  for (let c = 0; c < 8; c++) OFF[c] = (c & 1) + nx * (((c >> 1) & 1) + ny * ((c >> 2) & 1));
  const E0 = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3];
  const E1 = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const v = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      if (j % 40 === 0) yield;
      let base = nx * (j + ny * k);
      for (let i = 0; i < nx - 1; i++, base++) {
        let neg = 0;
        for (let c = 0; c < 8; c++) {
          const d = F[base + OFF[c]];
          v[c] = d;
          if (d < 0) neg++;
        }
        if (neg === 0 || neg === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 12; e++) {
          const c0 = E0[e];
          const c1 = E1[e];
          const a = v[c0];
          const b = v[c1];
          if (a < 0 === b < 0) continue;
          const t = a / (a - b);
          sx += (c0 & 1) + ((c1 & 1) - (c0 & 1)) * t;
          sy += ((c0 >> 1) & 1) + (((c1 >> 1) & 1) - ((c0 >> 1) & 1)) * t;
          sz += ((c0 >> 2) & 1) + (((c1 >> 2) & 1) - ((c0 >> 2) & 1)) * t;
          n++;
        }
        cellV[base] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
      }
    }
  }

  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      if (j % 40 === 1) yield;
      for (let i = 1; i < nx - 1; i++) {
        const inside = F[id(i, j, k)] < 0;
        // edge along +x
        if (inside !== F[id(i + 1, j, k)] < 0)
          quad(cellV[id(i, j - 1, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i, j - 1, k)], !inside);
        // edge along +y
        if (inside !== F[id(i, j + 1, k)] < 0)
          quad(cellV[id(i - 1, j, k - 1)], cellV[id(i - 1, j, k)], cellV[id(i, j, k)], cellV[id(i, j, k - 1)], !inside);
        // edge along +z
        if (inside !== F[id(i, j, k + 1)] < 0)
          quad(cellV[id(i - 1, j - 1, k)], cellV[id(i, j - 1, k)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)], !inside);
      }
    }
  }

  // smooth normals straight from the field gradient
  const nrm = new Float32Array(pos.length);
  const e = h * 0.5;
  for (let p = 0; p < pos.length; p += 3) {
    if (p % 750 === 0) yield;
    const x = pos[p];
    const y = pos[p + 1];
    const z = pos[p + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z);
    const gy = f(x, y + e, z) - f(x, y - e, z);
    const gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm[p] = gx / l;
    nrm[p + 1] = gy / l;
    nrm[p + 2] = gz / l;
  }
  yield;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Blade geometry (figure units): the guard's top edge, the blade length,
 *  the half-widths at the ricasso and where the point begins. The sword
 *  material reads these to draw the fuller + the warm-white edges. */
export const BLADE = { base: 2.16, len: 0.58, w0: 0.066, w1: 0.056, tip: 0.16, x: R_FIST[0], z: R_FIST[2] + 0.03 };
export const SWORD_TIP_Y = BLADE.base + BLADE.len;

/** The greatsword held aloft: grip through the raised gauntlet, a broad
 *  crossguard with round finials, and a wide flat blade (extruded with a
 *  bevel so both edges catch light) — shaded by its own material so it is
 *  the brightest line in the figure. Cheap: built synchronously. */
export function buildSwordGeometry(): THREE.BufferGeometry {
  const { x, z, base, len, w0, w1, tip } = BLADE;
  const parts: THREE.BufferGeometry[] = [];
  const pommel = new THREE.SphereGeometry(0.03, 12, 8);
  pommel.translate(x, 1.962, z);
  parts.push(stripForMerge(pommel));
  const grip = new THREE.CylinderGeometry(0.017, 0.019, 0.17, 10);
  grip.translate(x, 2.05, z);
  parts.push(stripForMerge(grip));
  const guard = new THREE.BoxGeometry(0.32, 0.03, 0.04);
  guard.translate(x, base - 0.015, z);
  parts.push(stripForMerge(guard));
  for (const sd of [-1, 1]) {
    const fin = new THREE.SphereGeometry(0.024, 10, 8);
    fin.translate(x + sd * 0.16, base - 0.015, z);
    parts.push(stripForMerge(fin));
  }
  const shape = new THREE.Shape();
  shape.moveTo(-w0, 0);
  shape.lineTo(w0, 0);
  shape.lineTo(w1, len - tip);
  shape.lineTo(0, len);
  shape.lineTo(-w1, len - tip);
  shape.closePath();
  const bev = 0.007;
  const blade = new THREE.ExtrudeGeometry(shape, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: bev,
    bevelSize: bev,
    bevelSegments: 1,
    curveSegments: 1,
  });
  blade.translate(x, base, z - 0.005);
  parts.push(stripForMerge(blade));
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}

function* athleteSteps(h: number): Generator<void, THREE.BufferGeometry> {
  const body = yield* surfaceNets(makeField(PRIMS), [-0.5, -0.02, -0.2], [0.4, 1.98, 0.25], h);
  body.computeBoundingSphere();
  return body;
}

/** Synchronous build (tests / tooling). The scene uses getAthleteGeometry. */
export function buildAthleteGeometry(h = 0.014): THREE.BufferGeometry {
  const it = athleteSteps(h);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/* session cache: meshed ONCE, sliced across idle callbacks (each slice stops
 * when the frame's idle budget runs out), so it never costs a scroll frame.
 * Kicked off as soon as this module loads — long before the camera reaches
 * the bay (SelfQuest is the first exhibit, the airlock intro covers it). */
type IdleDeadline = { timeRemaining: () => number; didTimeout: boolean };
type IdleWin = typeof globalThis & { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number };
let _geo: THREE.BufferGeometry | null = null;
let _pending: Promise<THREE.BufferGeometry> | null = null;
export function getAthleteGeometry(): Promise<THREE.BufferGeometry> {
  if (_geo) return Promise.resolve(_geo);
  if (!_pending) {
    _pending = new Promise((resolve) => {
      const it = athleteSteps(0.014);
      const w = globalThis as IdleWin;
      const schedule = () => {
        if (w.requestIdleCallback) w.requestIdleCallback(slice, { timeout: 100 });
        else setTimeout(() => slice(null), 16);
      };
      const slice = (dl: IdleDeadline | null) => {
        const t0 = performance.now();
        // at least ~3 ms of progress per slice (the render loop leaves little
        // idle time), more when the browser reports genuine idle time
        const budget = () => performance.now() - t0 < 3 || (!!dl && !dl.didTimeout && dl.timeRemaining() > 4);
        do {
          const r = it.next();
          if (r.done) {
            _geo = r.value;
            resolve(_geo);
            return;
          }
        } while (budget());
        schedule();
      };
      schedule();
    });
  }
  return _pending;
}
if (typeof window !== "undefined") void getAthleteGeometry();

/** Hologram shading: a saturated accent body with fine STATIC scanlines,
 *  and a fresnel rim pushed toward warm white so the hero is the brightest,
 *  most distinct thing in the bay (no travelling bands — comfort rules). */
export function makeHoloMaterial(accent: string): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(accent) },
      uRim: { value: new THREE.Color(accent).lerp(new THREE.Color("#fff1e4"), 0.55) },
      uWhite: { value: new THREE.Color("#fff4ea") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uRim;
      uniform vec3 uWhite;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec3 n = normalize(vN);
        float f = 1.0 - abs(dot(n, normalize(vV)));
        float rim = pow(f, 1.8);
        float edge = pow(f, 5.0);
        // top light so the sculpted form reads (helm, pauldrons, chest, quads)
        float top = 0.5 + 0.5 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
        float scan = 0.7 + 0.3 * smoothstep(0.3, 0.55, abs(fract(vY * 110.0) - 0.5) * 2.0);
        // rise out of the lens: feet fade into the projector's light
        float foot = smoothstep(0.0, 0.2, vY);
        vec3 col = uColor * (0.55 * top) * scan + uRim * rim * 1.15 + uWhite * edge * 0.9;
        float a = (0.2 + 0.8 * rim) * foot;
        gl_FragColor = vec4(col * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.toneMapped = false;
  return m;
}

/** The greatsword's own shading: a clear accent body with a bright fuller
 *  line down the centre and STATIC warm-white edges — the brightest line in
 *  the figure, so the story ("raising the sword at level-up") reads even at
 *  the dwell distance. Hilt (below the blade base) in warm brass-white.
 *  Reads BLADE for the blade's taper. No motion. */
export function makeSwordMaterial(accent: string): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(accent) },
      uWarm: { value: new THREE.Color("#fff1e2") },
      uB: { value: new THREE.Vector4(BLADE.x, BLADE.base, BLADE.len, BLADE.tip) },
      uW: { value: new THREE.Vector2(BLADE.w0, BLADE.w1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vP = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWarm;
      uniform vec4 uB;
      uniform vec2 uW;
      varying vec3 vP;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float y = vP.y - uB.y;
        vec3 col;
        if (y < 0.0) {
          // hilt: warm, solid, rim-lit
          col = mix(uColor, uWarm, 0.55) * (0.42 + 0.6 * pow(f, 1.5));
        } else {
          float yt = uB.z - uB.w;
          float hw = y < yt ? mix(uW.x, uW.y, y / yt) : uW.y * (1.0 - (y - yt) / uB.w);
          float u = clamp(abs(vP.x - uB.x) / max(hw, 1e-3), 0.0, 1.0);
          float edge = smoothstep(0.72, 0.98, u);
          float fuller = 1.0 - smoothstep(0.04, 0.16, u);
          col = uColor * 0.34 + uWarm * (edge * 1.05 + fuller * 0.55) + uWarm * pow(f, 2.0) * 0.6;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.toneMapped = false;
  return m;
}
