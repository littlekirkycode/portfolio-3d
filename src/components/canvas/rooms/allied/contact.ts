import * as THREE from "three";
import { merge } from "./geo";

/** A footprint that gets a soft contact shadow: centre (x, z), size w × d,
 *  optional yaw. */
export type Spot = { x: number; z: number; w: number; d: number; ry?: number };

/** All contact-shadow planes for one prop group merged into ONE geometry
 *  (one draw call, shared `m.contact` material). `y` sits just above the
 *  surface the prop stands on. */
export function contactGeo(spots: Spot[], y = 0.004): THREE.BufferGeometry {
  return merge(
    spots.map((s) => {
      const g = new THREE.PlaneGeometry(s.w, s.d);
      g.rotateX(-Math.PI / 2);
      g.rotateY(s.ry ?? 0);
      g.translate(s.x, y, s.z);
      return { g };
    }),
  );
}
