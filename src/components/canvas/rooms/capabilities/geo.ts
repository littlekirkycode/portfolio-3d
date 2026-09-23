"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Tiny geometry kit for the Capabilities bay: build parts as transformed,
 * vertex-coloured primitives, then merge each material group into ONE mesh —
 * the whole rack row + workstation costs a couple dozen draw calls. */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

export type Xf = { p?: [number, number, number]; r?: [number, number, number] };

function place(g: THREE.BufferGeometry, { p = [0, 0, 0], r = [0, 0, 0] }: Xf) {
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  _m.compose(new THREE.Vector3(...p), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation, xf: Xf = {}) {
  return place(paint(new THREE.BoxGeometry(w, h, d), color), xf);
}

export function cyl(rTop: number, rBot: number, h: number, color: THREE.ColorRepresentation, xf: Xf = {}, seg = 20, open = false) {
  return place(paint(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), color), xf);
}

/** Cylinder spanning a → b (arms, posts). */
export function rod(a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, r: number, color: THREE.ColorRepresentation, seg = 10) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = paint(new THREE.CylinderGeometry(r, r, len, seg), color);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function tube(points: THREE.Vector3Tuple[], r: number, color: THREE.ColorRepresentation) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return paint(new THREE.TubeGeometry(curve, 28, r, 6, false), color);
}

export function plane(w: number, h: number, color: THREE.ColorRepresentation, xf: Xf = {}) {
  return place(paint(new THREE.PlaneGeometry(w, h), color), xf);
}

/** Apply an extra matrix (e.g. a rack's placement) to a list of parts. */
export function withMatrix(parts: THREE.BufferGeometry[], m: THREE.Matrix4) {
  parts.forEach((g) => g.applyMatrix4(m));
  return parts;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!out) throw new Error("capabilities: merge failed");
  return out;
}

export function matrixOf(p: [number, number, number], ry: number) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
}
