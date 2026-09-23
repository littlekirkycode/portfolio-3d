import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Tiny geometry-baking kit for the Experience installation: every repeated
 * part is transformed into room space and merged, so the whole stair costs a
 * handful of draw calls (DESIGN_SYSTEM §6). */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export type V3 = [number, number, number];

/** Local transform matrix (position + XYZ euler). */
export function mat(pos: V3, rot: V3 = [0, 0, 0]): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s);
}

/** Bake `pos/rot` (optionally inside a `parent` frame) into the geometry. */
export function place(g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], parent?: THREE.Matrix4) {
  _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s);
  if (parent) _m.premultiply(parent);
  g.applyMatrix4(_m);
  return g;
}

/** Solid per-vertex colour (linear) — or a gradient via `fn(vertexIndex)`. */
export function paint(g: THREE.BufferGeometry, c: THREE.Color | ((i: number, p: THREE.Vector3) => THREE.Color)) {
  const pos = g.attributes.position;
  const a = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const col = typeof c === "function" ? c(i, p) : c;
    a[i * 3] = col.r;
    a[i * 3 + 1] = col.g;
    a[i * 3 + 2] = col.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}

/** Remap a geometry's 0..1 UVs into an atlas cell (canvas px, y down). */
export function atlasUV(g: THREE.BufferGeometry, x: number, y: number, w: number, h: number, size: number) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (x + u * w) / size, 1 - (y + (1 - v) * h) / size);
  }
  return g;
}

/** Remap 0..1 UVs into a cell (canvas px, y down) of a W×H atlas. */
export function cellUV(g: THREE.BufferGeometry, x: number, y: number, w: number, h: number, W: number, H: number) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (x + u * w) / W, 1 - (y + (1 - v) * h) / H);
  }
  return g;
}

/** Merge (all parts must share the same attribute set) and free the parts. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!g) throw new Error("experience: merge failed");
  g.computeBoundingSphere();
  return g;
}

/** A cylinder spanning a → b (radius r). */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 12): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}
