"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ── Allied geometry kit ─────────────────────────────────────────────────────
 * Small builders that make the inspection cell read as MACHINED hardware:
 *  - `turned`  — a lathe profile built from true cylinders/cones/rings, so every
 *                shoulder and chamfer is a crisp edge while round faces stay
 *                smooth (LatheGeometry averages normals across corners and
 *                goes mushy on metal).
 *  - `plate`   — an extruded outline with holes and a small cap chamfer.
 *  - `merge`   — bake many transformed pieces into ONE geometry per material,
 *                which keeps the whole bay inside its draw-call budget.
 * ──────────────────────────────────────────────────────────────────────── */

export type V3 = [number, number, number];
export type Piece = { g: THREE.BufferGeometry; p?: V3; r?: V3; s?: V3 };

const KEEP = new Set(["position", "normal", "uv"]);

/** Bake transformed pieces into one non-indexed geometry (consumes inputs). */
export function merge(pieces: Piece[]): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const parts = pieces.map(({ g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    for (const k of Object.keys(c.attributes)) if (!KEEP.has(k)) c.deleteAttribute(k);
    if (!c.getAttribute("uv")) {
      const n = c.getAttribute("position").count;
      c.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    c.clearGroups();
    c.applyMatrix4(m.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...s)));
    return c;
  });
  const out = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  parts.forEach((c) => c.dispose());
  return out;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Reverse winding + negate normals (for inward-facing surfaces like bores). */
function flip(g: THREE.BufferGeometry) {
  const idx = g.index;
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  const n = g.getAttribute("normal");
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  n.needsUpdate = true;
}

/**
 * A turned (lathe) part from an (r, y) profile. Traverse the profile so the
 * solid is on the RIGHT of travel — e.g. bore-bottom → outer-bottom → up the
 * outside → across the top → down the bore. Horizontal steps become rings,
 * everything else a true frustum with correct normals and sharp shoulders.
 */
export function turned(profile: [number, number][], seg = 48): THREE.BufferGeometry {
  const pieces: Piece[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [ra, ya] = profile[i];
    const [rb, yb] = profile[i + 1];
    if (Math.abs(ya - yb) < 1e-6) {
      if (Math.abs(ra - rb) < 1e-6) continue;
      const g = new THREE.RingGeometry(Math.min(ra, rb), Math.max(ra, rb), seg, 1);
      // moving outward along a face = the face looks DOWN; inward = UP
      const up = rb < ra;
      pieces.push({ g, p: [0, ya, 0], r: [up ? -Math.PI / 2 : Math.PI / 2, 0, 0] });
    } else {
      const top = ya > yb ? ra : rb;
      const bot = ya > yb ? rb : ra;
      const g = new THREE.CylinderGeometry(top, bot, Math.abs(yb - ya), seg, 1, true);
      if (yb < ya) flip(g); // travelling down = an inward-facing (bore) surface
      pieces.push({ g, p: [0, (ya + yb) / 2, 0] });
    }
  }
  return merge(pieces);
}

/** Chamfered-corner rectangle outline centred on the origin. */
export function chamferRect(w: number, h: number, c: number): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + c, y0);
  s.lineTo(x1 - c, y0);
  s.lineTo(x1, y0 + c);
  s.lineTo(x1, y1 - c);
  s.lineTo(x1 - c, y1);
  s.lineTo(x0 + c, y1);
  s.lineTo(x0, y1 - c);
  s.lineTo(x0, y0 + c);
  s.closePath();
  return s;
}

export function hole(x: number, y: number, r: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(x, y, r, 0, Math.PI * 2, true);
  return p;
}

/**
 * Extrude an outline `thick` deep with a small cap chamfer, keeping the
 * outline's exact size at the mid-plane. Result spans z ∈ [0, thick].
 * `flat` lays it down: extrusion → +y, outline y → −z.
 */
export function plate(shape: THREE.Shape, thick: number, chamfer = 0.003, flat = false): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick - chamfer * 2,
    bevelEnabled: chamfer > 0,
    bevelThickness: chamfer,
    bevelSize: chamfer,
    bevelOffset: -chamfer,
    bevelSegments: 1,
    curveSegments: 40,
  });
  g.translate(0, 0, chamfer);
  if (flat) g.rotateX(-Math.PI / 2);
  return g;
}

/** Crisp-shaded box with a rounded look: use for chassis where a plain box
 *  reads as a primitive (tiny radius, few segments). */
export function softBox(w: number, h: number, d: number, r = 0.008): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const x0 = -w / 2 + r, x1 = w / 2 - r, y0 = -h / 2 + r, y1 = h / 2 - r;
  s.moveTo(x0, -h / 2);
  s.lineTo(x1, -h / 2);
  s.absarc(x1, y0, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, y1);
  s.absarc(x1, y1, r, 0, Math.PI / 2, false);
  s.lineTo(x0, h / 2);
  s.absarc(x0, y1, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, y0);
  s.absarc(x0, y0, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - r * 2,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r * 0.6,
    bevelOffset: -r * 0.6,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -(d - r * 2) / 2);
  return g;
}

/** Plane with a sub-rectangle of an atlas mapped onto it (u0,v0 → u1,v1). */
export function atlasPlane(w: number, h: number, [u0, v0, u1, v1]: [number, number, number, number]) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

/** Upright rounded block: footprint w (x) × d (z), height h (y), centred on
 *  the origin, rounded VERTICAL edges (so the environment catches a specular
 *  line down every corner — reads as a painted casting, not a CAD box).
 *  `tx`/`tz` taper the top footprint (1 = straight). */
export function vbox(w: number, h: number, d: number, r = 0.008, tx = 1, tz = 1): THREE.BufferGeometry {
  const g = softBox(w, d, h, r);
  g.rotateX(-Math.PI / 2);
  if (tx !== 1 || tz !== 1) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + h / 2) / h;
      p.setX(i, p.getX(i) * (1 + (tx - 1) * t));
      p.setZ(i, p.getZ(i) * (1 + (tz - 1) * t));
    }
    p.needsUpdate = true;
  }
  return g;
}

/** Horizontal rounded bar along x: length l, height h, depth d. */
export function xbar(l: number, h: number, d: number, r = 0.008): THREE.BufferGeometry {
  const g = softBox(d, h, l, r);
  g.rotateY(Math.PI / 2);
  return g;
}
