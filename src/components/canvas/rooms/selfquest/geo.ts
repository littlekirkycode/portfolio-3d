import * as THREE from "three";

/** Keep only position + normal (non-indexed) so parts from different
 *  generators merge cleanly with mergeGeometries. */
export function stripForMerge(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", n.getAttribute("position"));
  out.setAttribute("normal", n.getAttribute("normal"));
  if (n !== g) n.dispose();
  return out;
}
