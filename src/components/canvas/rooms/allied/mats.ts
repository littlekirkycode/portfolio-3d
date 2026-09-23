"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLOW, MATERIALS, NEUTRAL, tintNeutral } from "../../theme";
import { getPuckTex } from "../shared";

/* One material set for the whole Allied cell — every surface is a theme.ts
 * preset or neutral, the accent only ever arrives as a small emitter/trim. */

/** 256² speckle for the granite (seeded → identical every mount; painted
 *  once, module-cached, never redrawn). */
let _granite: THREE.CanvasTexture | null = null;
function graniteTex(): THREE.CanvasTexture {
  if (_granite) return _granite;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3a3e46";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    ctx.fillStyle = v < 0.55 ? "rgba(22,24,29,0.85)" : v < 0.9 ? "rgba(96,101,112,0.8)" : "rgba(150,154,162,0.75)";
    const s = 0.6 + rnd() * (v < 0.55 ? 2.4 : 1.4);
    ctx.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.6, 1.6);
  t.anisotropy = 8;
  _granite = t;
  return t;
}

export type AlliedMats = ReturnType<typeof build>;

function build(accent: string) {
  return {
    /** bead-blasted 7075 aluminium — the machined part */
    alu: (() => {
      const m = MATERIALS.polished({ color: "#d9dee6" });
      m.roughness = 0.34; // blasted, not mirror — holds its light value
      m.metalness = 0.62;
      return m;
    })(),
    /** anodised machine aluminium (beam, guides) */
    anod: (() => {
      const m = MATERIALS.steel({ color: "#aeb6c3" });
      m.roughness = 0.42;
      m.metalness = 0.7;
      return m;
    })(),
    /** satin hard-anodised plate (shaker head expander, LRU flange + front
     *  panel) — a value step darker and rougher than `anod`, so the unit's
     *  flat faces never clip to white and the bright MIL connectors lead */
    anodDark: (() => {
      const m = MATERIALS.steel({ color: "#8d95a2" });
      m.roughness = 0.55;
      m.metalness = 0.55;
      return m;
    })(),
    /** hard-chromed ram, rails, latches */
    chrome: MATERIALS.polished(),
    /** tool steel — fixture plate, clamps */
    steel: MATERIALS.steel(),
    /** black-oxide fasteners */
    oxide: (() => {
      const m = MATERIALS.steel({ color: "#3a404c" });
      m.roughness = 0.4;
      return m;
    })(),
    /** machine enamel — light CMM grey */
    enamel: MATERIALS.paintLight({ color: "#b4bac5" }),
    /** structural paint (stand, shaker body) */
    paint: MATERIALS.paintLight({ color: "#566072" }),
    /** dark structural paint */
    paintDark: MATERIALS.paint({ color: NEUTRAL.hull }),
    /** transit-case shell — olive-drab rotomoulded polymer: the one
     *  unmistakably "defence" surface, a warm neutral that sits with the amber
     *  and carries white stencils at full contrast (a light slate washed out
     *  to aluminium under the bay light; a dark one sank into the corner). */
    slate: (() => {
      const m = MATERIALS.paintLight({ color: "#5d654a" });
      m.roughness = 0.62;
      return m;
    })(),
    /** ruggedised LRU chassis — mid grey powder coat, separates from the deck */
    chassis: (() => {
      const m = MATERIALS.paintLight({ color: `#${tintNeutral("#747d90", accent, 0.04).getHexString()}` });
      m.roughness = Math.max(m.roughness, 0.6); // powder coat: no hot fin-edge glints
      return m;
    })(),
    /** honed black granite surface plate — speckle map so it reads as stone */
    granite: new THREE.MeshStandardMaterial({ color: "#ffffff", map: graniteTex(), roughness: 0.32, metalness: 0.05 }),
    rubber: MATERIALS.rubber(),
    wood: MATERIALS.wood(),
    /** probe head / connector inserts — darkest authored surface */
    shadow: MATERIALS.paint({ color: NEUTRAL.hullShadow }),
    /** oil-impregnated bronze bushing (WARM is the one secondary hue) */
    bronze: (() => {
      const m = MATERIALS.polished({ color: "#b7925e" });
      m.roughness = 0.3;
      return m;
    })(),
    /** soft contact shadow (shared radial puck, multiplied dark) — grounds
     *  every floor prop without a light or a shadow map */
    contact: new THREE.MeshBasicMaterial({
      color: "#000000",
      map: getPuckTex(),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      toneMapped: false,
    }),
    trim: MATERIALS.emit(accent, GLOW.trim),
    line: MATERIALS.emit(accent, GLOW.line),
    hot: MATERIALS.emit(accent, GLOW.hot),
  };
}

export function useAlliedMats(accent: string): AlliedMats {
  const m = useMemo(() => build(accent), [accent]);
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}

/** Build a record of geometries once (rebuilt when `key` changes) and dispose
 *  them on unmount. `make` must be pure; `key` carries its inputs. */
export function useGeoSet<T extends Record<string, THREE.BufferGeometry>>(make: () => T, key = ""): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(() => make(), [key]);
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return g;
}
