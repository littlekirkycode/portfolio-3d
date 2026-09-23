"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { MATERIALS, NEUTRAL, WARM } from "../../theme";
import { getPuckTex } from "../shared";
import { stripForMerge } from "./geo";
import { BRASS } from "./Gear";
import { useDisposable } from "./useDisposable";

/* ── SelfQuest LOOT CHEST ─────────────────────────────────────────────────────
 * The app's reward loop made physical: the in-app Diamond Chest as a real
 * object on the gym floor — a planked hardwood chest with a barrel lid, aged
 * brass straps + rim, satin steel corner guards (body AND lid ends) and skid,
 * and a raised bevelled brass escutcheon with a keyhole and hasp staple. The
 * lid is thrown right back on its hinge; inside, a mound of brass coins
 * (some stacked) cresting over the rim, the diamond on top, and a soft glow
 * only round the heap (static — the accent lives in the light, never in
 * paint). Parts are merged per material: ~11 draw calls. Origin = centre of the footprint on the floor;
 * +z = the lock side (face it at the camera). */

const W = 0.6; // along x
const D = 0.38; // along z
const BODY_H = 0.25;
const SKID = 0.03; // steel skid base under the body
const LID_R = D / 2;
const OPEN = 1.88; // lid thrown back just past vertical (rad)

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return stripForMerge(g);
}

/** Half-cylinder shell along x (the barrel lid / a lid strap). */
function halfDrum(r: number, len: number, x: number, closed: boolean) {
  const g = new THREE.CylinderGeometry(r, r, len, 28, 1, !closed, 0, Math.PI);
  g.rotateZ(Math.PI / 2); // axis along x, the arc on top
  g.translate(x, 0, 0);
  return stripForMerge(g);
}

function merged(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** The chest's mouth: dark wood interior between the coins, with a soft
 *  warm glow welling up round the heap (peak about half the old value). */
function makeMouth(accent: string) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(accent) },
      uWarm: { value: new THREE.Color(WARM) },
      uWood: { value: new THREE.Color(NEUTRAL.wood).multiplyScalar(0.22) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uWarm;
      uniform vec3 uWood;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - 0.5) * vec2(1.0, 1.6);
        float r = clamp(length(d) * 2.0, 0.0, 1.0);
        float k = pow(1.0 - r, 2.0);
        vec3 col = uWood + mix(uColor, uWarm, 0.55) * 0.5 * k;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  m.toneMapped = false;
  return m;
}

/** Soft vertical glow sheet (additive): strongest at the rim, gone by its top. */
function makeSpill(accent: string) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(accent) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float side = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float a = 0.1 * pow(1.0 - vUv.y, 2.6) * side;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.toneMapped = false;
  return m;
}

export function LootChest({ accent }: { accent: string }) {
  const wood = useDisposable(() => MATERIALS.wood());
  const seamMat = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: new THREE.Color(NEUTRAL.wood).multiplyScalar(0.45), roughness: 0.8 }),
  );
  const diamond = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#f2f6ff"),
        emissive: new THREE.Color(accent).lerp(new THREE.Color(WARM), 0.4),
        emissiveIntensity: 0.4,
        roughness: 0.08,
        metalness: 0.2,
        flatShading: true,
      }),
    accent,
  );
  const steel = useDisposable(() => MATERIALS.steel());
  const brass = useDisposable(() => new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.26, metalness: 0.9 }));
  // coins: the same aged brass, a touch brighter + smoother so the mound glints
  const coin = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(BRASS).lerp(new THREE.Color(WARM), 0.12),
        roughness: 0.22,
        metalness: 0.72,
      }),
  );
  const mouth = useDisposable(() => makeMouth(accent), accent);
  const spill = useDisposable(() => makeSpill(accent), accent);
  const shadow = useDisposable(
    () =>
      new THREE.MeshBasicMaterial({
        map: getPuckTex(),
        color: "#000000",
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
  );

  const geo = useDisposable(() => {
    const y0 = SKID;
    const top = y0 + BODY_H;
    // body: bevelled strongbox
    const body = new RoundedBoxGeometry(W, BODY_H, D, 3, 0.018);
    body.translate(0, y0 + BODY_H / 2, 0);
    // steel: skid base + four corner guards
    const steelParts = [box(W + 0.04, SKID, D + 0.04, 0, SKID / 2, 0)];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        steelParts.push(box(0.05, BODY_H - 0.01, 0.05, sx * (W / 2 - 0.014), y0 + BODY_H / 2, sz * (D / 2 - 0.014)));
    // brass: two straps wrapping the body, a rim band, a raised escutcheon
    const brassParts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) brassParts.push(box(0.045, BODY_H + 0.004, D + 0.012, sx * W * 0.28, y0 + BODY_H / 2, 0));
    brassParts.push(box(W + 0.008, 0.02, D + 0.008, 0, top - 0.012, 0));
    const esc = new RoundedBoxGeometry(0.088, 0.106, 0.018, 2, 0.006);
    esc.translate(0, top - 0.078, D / 2 + 0.008);
    brassParts.push(stripForMerge(esc));
    esc.dispose();
    // hasp staple standing proud of the escutcheon's top edge
    const staple = new THREE.TorusGeometry(0.014, 0.004, 6, 14, Math.PI);
    staple.translate(0, top - 0.03, D / 2 + 0.02);
    brassParts.push(stripForMerge(staple));
    // dark: plank seams (body front/back), the keyhole
    const seamParts: THREE.BufferGeometry[] = [];
    for (const f of [0.36, 0.68])
      for (const sz of [-1, 1]) seamParts.push(box(W - 0.06, 0.006, 0.004, 0, y0 + BODY_H * f, sz * (D / 2 + 0.001)));
    const keyO = new THREE.CylinderGeometry(0.009, 0.009, 0.004, 12);
    keyO.rotateX(Math.PI / 2);
    keyO.translate(0, top - 0.068, D / 2 + 0.0185);
    seamParts.push(stripForMerge(keyO));
    seamParts.push(box(0.007, 0.022, 0.004, 0, top - 0.084, D / 2 + 0.0185));
    // lid (pivot frame: hinge line at the origin, lid extends to +z)
    const lidShell = halfDrum(LID_R, W, 0, true);
    lidShell.translate(0, 0, LID_R);
    // flat underside so the open lid never shows its hollow back
    const lid = merged([lidShell, box(W, 0.01, D, 0, 0.005, LID_R)]);
    const lidBrass = [halfDrum(LID_R + 0.006, 0.045, -W * 0.28, false), halfDrum(LID_R + 0.006, 0.045, W * 0.28, false)];
    lidBrass.forEach((g) => g.translate(0, 0, LID_R));
    lidBrass.push(box(W + 0.008, 0.016, 0.02, 0, 0.008, D - 0.004)); // brass lip on the lid's front edge
    // steel guards over the lid's ends, matching the body's corner guards
    const lidSteel = [halfDrum(LID_R + 0.005, 0.034, -(W / 2 - 0.017), false), halfDrum(LID_R + 0.005, 0.034, W / 2 - 0.017, false)];
    lidSteel.forEach((g) => g.translate(0, 0, LID_R));
    // plank seams around the barrel, running the lid's length
    const lidSeams: THREE.BufferGeometry[] = [];
    for (const th of [0.62, 1.2, 1.94, 2.52]) {
      const sg = new THREE.BoxGeometry(W - 0.07, 0.004, 0.006);
      sg.rotateX(Math.PI / 2 - th);
      sg.translate(0, (LID_R + 0.001) * Math.sin(th), LID_R + (LID_R + 0.001) * Math.cos(th));
      lidSeams.push(stripForMerge(sg));
    }
    // dark inner panel on the lid's underside (it faces the viewer when open)
    lidSeams.push(box(W - 0.05, 0.003, D - 0.05, 0, -0.0015, LID_R));
    // the loot: a mound of brass coins cresting over the rim, plus a few stacks
    const coinParts: THREE.BufferGeometry[] = [];
    const rnd = (i: number) => {
      const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    const RX = W / 2 - 0.05;
    const RZ = D / 2 - 0.045;
    for (let i = 0; i < 54; i++) {
      const a = rnd(i) * Math.PI * 2;
      const rr = Math.sqrt(rnd(i + 40));
      const cx = Math.cos(a) * rr * RX;
      const cz = Math.sin(a) * rr * RZ;
      const hy = (1 - rr * rr) * 0.07 + rnd(i + 200) * 0.008; // dome
      const c = new THREE.CylinderGeometry(0.028, 0.028, 0.006, 16);
      // tilt with the mound's slope, plus a little scatter
      c.rotateX(-Math.sin(a) * rr * 0.55 + (rnd(i + 80) - 0.5) * 0.5);
      c.rotateZ(Math.cos(a) * rr * 0.55 + (rnd(i + 120) - 0.5) * 0.5);
      c.translate(cx, top + 0.003 + hy, cz);
      coinParts.push(stripForMerge(c));
    }
    // neat stacks near the front corners: counted, banked reward
    const stacks: [number, number, number][] = [
      [-0.19, 0.1, 6],
      [0.2, 0.09, 4],
      [0.13, 0.12, 3],
    ];
    for (const [sx, sz, n] of stacks) {
      for (let k = 0; k < n; k++) {
        const c = new THREE.CylinderGeometry(0.028, 0.028, 0.006, 16);
        c.translate(sx + (rnd(k + sx * 50) - 0.5) * 0.004, top + 0.006 + k * 0.0068, sz);
        coinParts.push(stripForMerge(c));
      }
    }
    // the diamond, sitting on the crest of the heap
    const stone = new THREE.OctahedronGeometry(0.052, 0);
    stone.scale(1, 1.25, 1);
    stone.rotateY(0.4);
    stone.translate(0.0, top + 0.07 + 0.065, 0.02);
    const g = {
      seams: merged(seamParts),
      coins: merged(coinParts),
      stone: stripForMerge(stone),
      body: stripForMerge(body),
      steel: merged(steelParts),
      brass: merged(brassParts),
      lid,
      lidBrass: merged(lidBrass),
      lidSteel: merged(lidSteel),
      lidSeams: merged(lidSeams),
      dispose() {
        [g.body, g.steel, g.brass, g.lid, g.lidBrass, g.lidSteel, g.lidSeams, g.seams, g.coins, g.stone].forEach((x) =>
          x.dispose(),
        );
      },
    };
    body.dispose();
    return g;
  });

  const top = SKID + BODY_H;
  return (
    <group>
      <mesh position-y={0.004} rotation-x={-Math.PI / 2} material={shadow} renderOrder={1}>
        <planeGeometry args={[W + 0.45, D + 0.45]} />
      </mesh>
      <mesh geometry={geo.body} material={wood} />
      <mesh geometry={geo.seams} material={seamMat} />
      <mesh geometry={geo.steel} material={steel} />
      <mesh geometry={geo.brass} material={brass} />
      {/* the open mouth lit from within, framed by the brass rim band */}
      <mesh position-y={top + 0.002} rotation-x={-Math.PI / 2} material={mouth}>
        <planeGeometry args={[W - 0.07, D - 0.07]} />
      </mesh>
      <mesh geometry={geo.coins} material={coin} />
      <mesh geometry={geo.stone} material={diamond} />
      {/* barrel lid thrown back on its hinge, inside face to the viewer */}
      <group position={[0, top, -D / 2]} rotation-x={-OPEN}>
        <mesh geometry={geo.lid} material={wood} />
        <mesh geometry={geo.lidSeams} material={seamMat} />
        <mesh geometry={geo.lidBrass} material={brass} />
        <mesh geometry={geo.lidSteel} material={steel} />
      </group>
      {/* light spilling out of the gap, rising and fading */}
      <mesh position={[0, top + 0.12, 0.02]} material={spill} renderOrder={2}>
        <planeGeometry args={[W - 0.04, 0.24]} />
      </mesh>
    </group>
  );
}
