/* ── Nuremi holo-table: the city the concierge answers over ─────────────────
 * One deterministic layout shared by the painted street plate (canvas) and
 * the instanced building massing, so roads, river, picks, the search circle
 * and the route all line up exactly. Units = world units on the plate
 * (plate radius R). +x = viewer's right, +z = toward the viewer.
 *
 * Composition: "you" sits just in front of centre; the concierge's search
 * circle round you fits wholly on the map; inside it the city is a
 * flat lit plan (so the circle, the three picks and the route read);
 * outside it the massing rises toward a downtown at the back-right, with the
 * river closing the view behind. */

export const R = 0.58; // plate radius
export const MAP_R = R - 0.05; // inner edge of the bearing bezel band
export const P = 0.13; // block pitch (street grid)
export const ROAD = 0.011; // minor street half-width
export const BLVD = 0.017; // boulevard half-width (x = 0 and z = BLVD_Z)
export const BLVD_Z = P; // the cross boulevard you stand on

/** River centre line (back of the city) and half-width. */
export const riverZ = (x: number) => -0.4 + 0.035 * Math.sin(x * 5.2 + 0.8);
export const RIVER_HW = 0.034;

/** You-are-here + the three picks (map coords). Picks sit at block centres. */
export const YOU: [number, number] = [0, P];
export const PICKS: { at: [number, number]; hero?: boolean }[] = [
  { at: [1.5 * P, -0.5 * P], hero: true }, // 1 · the quiet café (pinned)
  { at: [-1.5 * P, 0.5 * P] }, // 2
  { at: [-0.5 * P, 2.5 * P] }, // 3
];
export const SEARCH_R = 0.3; // the concierge's "near you" search radius, drawn round YOU

/** Street route YOU → pick 1, along the grid. */
export const ROUTE: [number, number][] = [
  [0, P],
  [P, P],
  [P, -0.5 * P],
  [1.5 * P - 0.03, -0.5 * P],
];

/** Downtown cluster (towers) sits back-right, beside (not behind) the picks. */
const DOWNTOWN: [number, number] = [0.34, -0.26];

export type Building = { x: number; z: number; w: number; d: number; h: number; plan: boolean };

const isBlvdX = (v: number) => Math.abs(v) < 1e-6;
const isBlvdZ = (v: number) => Math.abs(v - BLVD_Z) < 1e-6;

/** Every lot on the map. Lots inside the search circle are `plan` — drawn
 *  flat on the plate as footprints (the searched district reads as a cleared,
 *  lit plan view with the pins standing in it); the rest are 3D massing. */
export function buildCity(): Building[] {
  let s = 20250917;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out: Building[] = [];
  const n = Math.ceil(MAP_R / P) + 1;
  for (let i = -n; i < n; i++) {
    for (let j = -n; j < n; j++) {
      const x0 = i * P + (isBlvdX(i * P) ? BLVD : ROAD);
      const x1 = (i + 1) * P - (isBlvdX((i + 1) * P) ? BLVD : ROAD);
      const z0 = j * P + (isBlvdZ(j * P) ? BLVD : ROAD);
      const z1 = (j + 1) * P - (isBlvdZ((j + 1) * P) ? BLVD : ROAD);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const inSearch = Math.hypot(cx - YOU[0], cz - YOU[1]) < SEARCH_R;
      const isPick = PICKS.some((p) => Math.abs(p.at[0] - cx) < 0.01 && Math.abs(p.at[1] - cz) < 0.01);
      // split the block into lots: 2×2, 2×1 or whole
      const r = rnd();
      const nx = r < 0.65 ? 2 : 1;
      const nz = r < 0.35 ? 2 : 1;
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          const lx0 = x0 + ((x1 - x0) * a) / nx;
          const lx1 = x0 + ((x1 - x0) * (a + 1)) / nx;
          const lz0 = z0 + ((z1 - z0) * b) / nz;
          const lz1 = z0 + ((z1 - z0) * (b + 1)) / nz;
          const set = 0.007;
          const w = lx1 - lx0 - set * 2;
          const d = lz1 - lz0 - set * 2;
          const x = (lx0 + lx1) / 2;
          const z = (lz0 + lz1) / 2;
          const hr = rnd();
          // keep inside the plate's map disc (whole footprint)
          if (Math.hypot(Math.abs(x) + w / 2, Math.abs(z) + d / 2) > MAP_R - 0.012) continue;
          // river channel + its embankment
          if (Math.abs(z - riverZ(x)) < RIVER_HW + d / 2 + 0.01) continue;
          // a pick's block is an open plaza — the pin stands in it
          if (isPick) continue;
          if (hr < 0.06) continue; // the odd empty lot
          let h = 0;
          const plan = inSearch || Math.hypot(x - YOU[0], z - YOU[1]) < SEARCH_R + 0.02;
          if (!plan) {
            const dd = (x - DOWNTOWN[0]) ** 2 + (z - DOWNTOWN[1]) ** 2;
            const tower = Math.exp(-dd / 0.03);
            const front = Math.max(0, z - 0.1) * 0.12; // lower toward the viewer
            h = Math.max(0.016, 0.028 + hr * 0.036 - front + tower * (0.06 + rnd() * 0.1));
          }
          out.push({ x, z, w, d, h, plan });
        }
      }
    }
  }
  return out;
}
