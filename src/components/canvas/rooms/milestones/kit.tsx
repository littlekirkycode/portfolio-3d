"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { NEUTRAL, WARM, GLOW, MATERIALS, tintNeutral } from "../../theme";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getPuckTex } from "../shared";

/* ── Milestones kit: the hall of fame's material library + authored pieces ──
 * Gold is handled as METAL, never as paint: every gilt surface is a real
 * metallic PBR material that takes its colour from the studio environment's
 * reflections, so it reads as polished gold instead of a yellow plastic box.
 * Structure is lacquered ink-navy hull; the accent itself only arrives as
 * tiny light trims and the gilt lettering. */

export type FameMats = {
  gold: THREE.MeshStandardMaterial; // polished gilt (trophy, laurel, frame)
  brass: THREE.MeshStandardMaterial; // satin brass trims / nosings / posts
  lacquer: THREE.MeshStandardMaterial; // plinths, podium, monolith body
  lacquerDeep: THREE.MeshStandardMaterial; // shadow gaps, recesses, bases
  stone: THREE.MeshStandardMaterial; // black marble trophy foot / caps
  stoneTop: THREE.MeshStandardMaterial; // POLISHED black stone: step tops + plinth caps (one surface with the gilt nosing)
  honed: THREE.MeshStandardMaterial; // HONED warm-grey stone plinth shafts (vertex-colour AO toward the foot)
  dais: THREE.MeshStandardMaterial; // the round stone stage the podium stands on
  glass: THREE.MeshStandardMaterial; // vitrine panes
  warmLine: THREE.MeshBasicMaterial; // vitrine canopy light strip (true light)
  goldTrim: THREE.MeshBasicMaterial; // sub-bloom accent trim
  shadow: THREE.MeshBasicMaterial; // baked contact-shadow decal (dark radial alpha)
};

export function useFameMats(accent: string): FameMats {
  const m = useMemo<FameMats>(() => {
    const glass = MATERIALS.glass();
    glass.opacity = 0.14;
    glass.roughness = 0.04;
    return {
      gold: new THREE.MeshStandardMaterial({ color: "#f0c56a", roughness: 0.2, metalness: 1 }),
      brass: new THREE.MeshStandardMaterial({ color: "#c9a25a", roughness: 0.34, metalness: 0.95 }),
      // deep ink-navy lacquer: under the bay's gold light a warm-tinted
      // neutral went muddy brown; the ship's own hull blue keeps it crisp
      lacquer: new THREE.MeshStandardMaterial({
        color: tintNeutral(NEUTRAL.hull, "#3c5a9a", 0.12),
        roughness: 0.3,
        metalness: 0.25,
      }),
      lacquerDeep: new THREE.MeshStandardMaterial({
        color: NEUTRAL.hullShadow,
        roughness: 0.5,
        metalness: 0.3,
      }),
      stone: new THREE.MeshStandardMaterial({ color: "#1f2229", roughness: 0.18, metalness: 0.25, envMapIntensity: 0.8 }),
      // near-black polished stone, the same value as the dais, so a step top and
      // its riser read as one piece under the gilt nosing (not a grey lid)
      stoneTop: new THREE.MeshStandardMaterial({ color: "#15171d", roughness: 0.2, metalness: 0.3, envMapIntensity: 0.85 }),
      // the supports are a different object class from the hero: honed
      // warm-grey stone, darkening toward the foot via vertex colour (baked AO)
      honed: new THREE.MeshStandardMaterial({
        color: tintNeutral(NEUTRAL.hull, WARM, 0.1),
        roughness: 0.58,
        metalness: 0.04,
        vertexColors: true,
      }),
      dais: new THREE.MeshStandardMaterial({ color: "#1a1d26", roughness: 0.22, metalness: 0.2, envMapIntensity: 0.7 }),
      shadow: new THREE.MeshBasicMaterial({
        map: getPuckTex(),
        color: "#000000",
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        toneMapped: false,
      }),
      glass,
      warmLine: MATERIALS.emit(WARM, GLOW.line),
      goldTrim: MATERIALS.emit(accent, GLOW.trim),
    };
  }, [accent]);
  // NB: dispose() on a material never touches its map, so the shared puck
  // texture behind `shadow` survives.
  useEffect(() => () => Object.values(m).forEach((x) => x.dispose()), [m]);
  return m;
}

/** Remap any geometry's 0..1 UVs onto sub-rect [u0,v0]→[u1,v1] of an atlas
 *  (v measured from the TOP of the canvas). Works for circles as well as planes. */
export function remapUV<G extends THREE.BufferGeometry>(g: G, u0: number, v0: number, u1: number, v1: number): G {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, u0 + (u1 - u0) * u, 1 - (v0 + (v1 - v0) * (1 - v)));
  }
  uv.needsUpdate = true;
  return g;
}

/** A chamfered square bar (section s, chamfer c) of length `len` along X,
 *  centred on the origin — brass nosings / kick rails that catch a highlight
 *  on the bevel instead of reading as a flat box edge. */
export function chamferBar(len: number, s: number, c = s * 0.3) {
  const h = s / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-h + c, -h);
  sh.lineTo(h - c, -h);
  sh.lineTo(h, -h + c);
  sh.lineTo(h, h - c);
  sh.lineTo(h - c, h);
  sh.lineTo(-h + c, h);
  sh.lineTo(-h, h - c);
  sh.lineTo(-h, -h + c);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 1 });
  g.rotateY(Math.PI / 2);
  g.translate(-len / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** Baked contact shadow: a flat radial-alpha decal (one shared texture). */
export function ContactShadow({ m, w, d, y = 0.003, x = 0, z = 0 }: { m: FameMats; w: number; d: number; y?: number; x?: number; z?: number }) {
  return (
    <mesh position={[x, y, z]} rotation-x={-Math.PI / 2} material={m.shadow} renderOrder={1}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}

/** A PlaneGeometry whose UVs point at sub-rect [u0,v0]→[u1,v1] of an atlas
 *  texture (v measured from the TOP of the canvas, like canvas coordinates). */
export function atlasPlane(w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
  return remapUV(new THREE.PlaneGeometry(w, h), u0, v0, u1, v1);
}

/* ── the trophy: a turned (lathe) cup, not a low-poly prop ───────────────── */

// profile (radius, y) from the foot up — gilt part only; sits on the stone foot
const CUP_PROFILE: [number, number][] = [
  [0.0, 0.0],
  [0.1, 0.0],
  [0.104, 0.012],
  [0.098, 0.022],
  [0.07, 0.034],
  [0.05, 0.05],
  [0.03, 0.075],
  [0.022, 0.11],
  [0.038, 0.13], // knop
  [0.04, 0.142],
  [0.024, 0.156],
  [0.019, 0.2],
  [0.026, 0.228],
  [0.05, 0.25],
  [0.1, 0.285],
  [0.138, 0.33],
  [0.158, 0.39],
  [0.164, 0.445],
  [0.168, 0.475], // lip
  [0.176, 0.484],
  [0.17, 0.49],
  [0.154, 0.478], // inner wall
  [0.146, 0.41],
  [0.12, 0.34],
  [0.0, 0.3],
];

export function Trophy({ m }: { m: FameMats }) {
  const g = useMemo(() => {
    const cup = new THREE.LatheGeometry(
      CUP_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    );
    cup.computeVertexNormals();
    // handle: a 3/4 ring whose open side is buried in the cup wall
    const handle = new THREE.TorusGeometry(0.075, 0.011, 12, 40, Math.PI * 1.25);
    const foot = new THREE.BoxGeometry(0.3, 0.1, 0.3);
    const footCap = new THREE.BoxGeometry(0.24, 0.035, 0.24);
    const band = new THREE.BoxGeometry(0.305, 0.012, 0.305);
    return { cup, handle, foot, footCap, band };
  }, []);
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return (
    <group>
      {/* black-marble stepped foot with a gilt band */}
      <mesh geometry={g.foot} material={m.stone} position-y={0.05} />
      <mesh geometry={g.band} material={m.gold} position-y={0.082} />
      <mesh geometry={g.footCap} material={m.stone} position-y={0.1175} />
      <group position-y={0.135}>
        <mesh geometry={g.cup} material={m.gold} />
        {([1, -1] as const).map((s) => (
          <mesh
            key={s}
            geometry={g.handle}
            material={m.gold}
            position={[s * 0.18, 0.38, 0]}
            rotation={[0, 0, s === 1 ? -Math.PI * 0.62 : Math.PI * 0.38]}
          />
        ))}
      </group>
    </group>
  );
}

/* ── a gilt laurel wreath, instanced (one draw call for every leaf) ─────── */

export function Laurel({ m, r = 0.19 }: { m: FameMats; r?: number }) {
  const { leaf, mats, count, stem } = useMemo(() => {
    const leafG = new THREE.SphereGeometry(1, 10, 6);
    const list: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const per = 11;
    for (const side of [1, -1]) {
      for (let i = 0; i < per; i++) {
        const t = i / (per - 1);
        // right half: θ from just right of the bottom (-78°) up to +66°;
        // the left half mirrors it (x → -x, φ → π - φ)
        const th = THREE.MathUtils.degToRad(-78 + t * 144);
        const size = 0.036 - t * 0.013;
        for (const off of [1, -1]) {
          // leaf pairs splay outward / inward off the stem, tips pointing up the arc
          const rr = r + off * size * 0.62;
          const phi = th + Math.PI / 2 - off * 0.62;
          const x = Math.cos(th) * rr;
          const y = Math.sin(th) * rr;
          e.set(0, off * 0.3 * side, side === 1 ? phi : Math.PI - phi);
          q.setFromEuler(e);
          list.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x * side, y, 0),
              q,
              new THREE.Vector3(size * 1.1, size * 0.38, size * 0.18),
            ),
          );
        }
      }
    }
    // the stem the leaves grow from: two thin arcs meeting at the bottom tie
    const stemG = new THREE.TorusGeometry(r, 0.0055, 6, 48, THREE.MathUtils.degToRad(312));
    return { leaf: leafG, mats: list, count: list.length, stem: stemG };
  }, [r]);
  const inst = useMemo(() => {
    const im = new THREE.InstancedMesh(leaf, m.gold, count);
    mats.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return im;
  }, [leaf, m.gold, mats, count]);
  useEffect(
    () => () => {
      leaf.dispose();
      stem.dispose();
      inst.dispose();
    },
    [leaf, stem, inst],
  );
  return (
    <group>
      <primitive object={inst} />
      {/* open at the top, like a real wreath */}
      <mesh geometry={stem} material={m.gold} rotation-z={THREE.MathUtils.degToRad(114)} />
      {/* bottom tie */}
      <mesh material={m.gold} position={[0, -r, 0]}>
        <sphereGeometry args={[0.018, 12, 8]} />
      </mesh>
    </group>
  );
}

/** Bake a vertical AO ramp into a geometry's vertex colours: `lo` at y0, 1 at y1. */
function aoRamp(g: THREE.BufferGeometry, y0: number, y1: number, lo: number) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getY(i), y0, y1);
    const v = lo + (1 - lo) * t;
    col.set([v, v, v], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/* ── a museum plinth with a real profile ─────────────────────────────────────
 * Not a box, and not the podium's navy lacquer either: a recessed shadow
 * reveal, a dark skirting foot with a brass foot band, a HONED warm-grey stone
 * shaft (its value falls off toward the foot like real occlusion), a brass
 * neck band and an overhanging polished black-stone cap. Brass appears only at
 * the foot and the neck. Local origin = floor centre; the cap top sits at `h`. */
export function MuseumPlinth({ m, w, d, h }: { m: FameMats; w: number; d: number; h: number }) {
  const REV = 0.03; // shadow reveal
  const FOOT = 0.075; // skirting foot
  const CAP = 0.04;
  const shaftH = h - REV - FOOT - CAP;
  // merged per material: 4 draws + the contact shadow for the whole plinth
  const g = useMemo(() => {
    const shaftY = REV + FOOT + shaftH / 2;
    const dark = [
      new THREE.BoxGeometry(w - 0.04, REV, d - 0.04).translate(0, REV / 2, 0),
      new THREE.BoxGeometry(w + 0.03, FOOT, d + 0.03).translate(0, REV + FOOT / 2, 0),
    ];
    const brass = [
      new THREE.BoxGeometry(w + 0.034, 0.012, d + 0.034).translate(0, REV + FOOT - 0.006, 0),
      new THREE.BoxGeometry(w + 0.006, 0.016, d + 0.006).translate(0, h - CAP - 0.03, 0),
    ];
    const shaft = aoRamp(new THREE.BoxGeometry(w, shaftH, d, 1, 6, 1).translate(0, shaftY, 0), REV + FOOT, h - CAP, 0.55);
    const out = {
      dark: mergeGeometries(dark),
      shaft,
      brass: mergeGeometries(brass),
      cap: new THREE.BoxGeometry(w + 0.05, CAP, d + 0.05).translate(0, h - CAP / 2, 0),
    };
    [...dark, ...brass].forEach((x) => x.dispose());
    return out;
  }, [w, d, h, shaftH]);
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  return (
    <group>
      <ContactShadow m={m} w={w + 0.6} d={d + 0.6} />
      <mesh geometry={g.dark} material={m.lacquerDeep} />
      <mesh geometry={g.shaft} material={m.honed} />
      <mesh geometry={g.brass} material={m.brass} />
      <mesh geometry={g.cap} material={m.stoneTop} />
    </group>
  );
}
