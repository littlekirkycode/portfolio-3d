"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SITE } from "@/lib/constants";
import { damp } from "@/lib/math";
import { familyVar, roundRect } from "../canvas2d";
import { NEUTRAL } from "../theme";
import { BRIDGE_C, BRIDGE_ENTRY_X, BRIDGE_H, BRIDGE_R, HALF_W, ROOMS, WALL_H } from "../hallConfig";

/* ── the bridge: the ship's front, an open command room ──────────────────────
 * Layout (world units, x = heading):
 *   BRIDGE_ENTRY_X ── straight side walls at z = ±R ── BRIDGE_C ── window arc
 * The corridor mouth sits in the back wall; the camera parks just inside it,
 * behind the captain's chair, looking at a floor-to-ceiling panoramic window
 * (SpaceView renders what's outside). Three raked consoles face the chair:
 * GITHUB and LINKEDIN comms uplinks, and a central NAV console whose screen
 * is a clickable "set course" grid — every exhibit is a destination (hash
 * deep link → the camera glides back there) plus a HAIL (email) row.
 * Its one light lives in Corridor's CorridorLights (mounted at the scene
 * root so the light count is constant from the first frame).
 * ──────────────────────────────────────────────────────────────────────── */

const C = BRIDGE_C;
const R = BRIDGE_R;
const H = BRIDGE_H;
const X0 = BRIDGE_ENTRY_X;
const SILL = 0.72;
const HEAD = 5.45;
const ARC = (84 * Math.PI) / 180; // window spans ±84° around the heading
const PANES = 12;
const ACCENT = "#7fb0e8";
const CHAIR = new THREE.Vector3(C - 3.6, 0, 0);

/** y-rotation that turns a +z-facing plane / +x-tangent box to sit on the
 *  window circle at angle a, facing the room centre. */
const rotOnArc = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a));
const onArc = (a: number, r = R): [number, number] => [C + r * Math.cos(a), r * Math.sin(a)];

function setWorldHover(v: boolean) {
  window.dispatchEvent(new CustomEvent("world-hover", { detail: v }));
}

/* ── materials ───────────────────────────────────────────────────────────── */

function useBridgeMats() {
  const mats = useMemo(() => {
    const floorTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const g = c.getContext("2d")!;
      g.fillStyle = "#1b2130";
      g.fillRect(0, 0, 512, 512);
      // deck plates: 2×2 plates per tile with fine seams + a brushed grain
      let seed = 90210;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.018})`;
        g.fillRect(rnd() * 512, rnd() * 512, 40 + rnd() * 90, 1);
      }
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 3;
      for (const v of [0, 256, 512]) {
        g.beginPath();
        g.moveTo(v, 0);
        g.lineTo(v, 512);
        g.moveTo(0, v);
        g.lineTo(512, v);
        g.stroke();
      }
      g.strokeStyle = "rgba(255,255,255,0.05)";
      g.lineWidth = 1;
      for (const v of [2, 258]) {
        g.beginPath();
        g.moveTo(v, 0);
        g.lineTo(v, 512);
        g.moveTo(0, v);
        g.lineTo(512, v);
        g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / 4, 1 / 4); // one texture tile per 4 m
      t.anisotropy = 8;
      return t;
    })();
    return {
      floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.55 }),
      ceiling: new THREE.MeshStandardMaterial({ color: "#11151e", roughness: 0.7, metalness: 0.3 }),
      wall: new THREE.MeshStandardMaterial({ color: NEUTRAL.hull, roughness: 0.6, metalness: 0.25 }),
      wallDark: new THREE.MeshStandardMaterial({ color: NEUTRAL.hullShadow, roughness: 0.65, metalness: 0.3 }),
      frame: new THREE.MeshStandardMaterial({ color: "#2c3446", roughness: 0.32, metalness: 0.8 }),
      steel: new THREE.MeshStandardMaterial({ color: NEUTRAL.steel, roughness: 0.3, metalness: 0.85 }),
      leather: new THREE.MeshStandardMaterial({ color: "#2b303d", roughness: 0.62, metalness: 0.08 }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(1.1), toneMapped: false }),
      glowDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(0.55), toneMapped: false }),
      glowWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe3c4").multiplyScalar(1.3), toneMapped: false }),
      ring: new THREE.MeshBasicMaterial({ color: new THREE.Color("#dfe9ff").multiplyScalar(1.5), toneMapped: false }),
    };
  }, []);
  useEffect(
    () => () =>
      Object.values(mats).forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }),
    [mats],
  );
  return mats;
}

/** Nearly invisible glass: only a fresnel edge sheen and two faint diagonal
 *  reflection bands, added on top of the view — clean and clear. */
function useGlass() {
  const m = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vW;
        varying vec3 vN;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW;
        varying vec3 vN;
        varying vec2 vUv;
        void main() {
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - abs(dot(normalize(vN), v)), 4.0);
          float band = smoothstep(0.985, 1.0, sin((vW.y * 0.9 + vW.z * 0.55) * 1.3))
                     + 0.5 * smoothstep(0.992, 1.0, sin((vW.y * 0.9 + vW.z * 0.55) * 1.3 + 2.1));
          float edge = 1.0 - smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          vec3 c = vec3(0.55, 0.7, 1.0) * (fres * 0.10 + band * 0.028 + edge * 0.035);
          gl_FragColor = vec4(c, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    mat.toneMapped = false;
    return mat;
  }, []);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/* ── architecture ────────────────────────────────────────────────────────── */

function roomShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(X0, -R);
  s.lineTo(C, -R);
  s.absarc(C, 0, R, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(X0, R);
  s.closePath();
  return s;
}

function Architecture({ mats }: { mats: ReturnType<typeof useBridgeMats> }) {
  const glass = useGlass();
  const geo = useMemo(() => {
    const shape = roomShape();
    return { deck: new THREE.ShapeGeometry(shape, 48) };
  }, []);
  useEffect(() => () => geo.deck.dispose(), [geo]);

  const step = (2 * ARC) / PANES;
  const panes = Array.from({ length: PANES }, (_, i) => -ARC + (i + 0.5) * step);
  const posts = Array.from({ length: PANES + 1 }, (_, i) => -ARC + i * step);
  const chord = 2 * R * Math.sin(step / 2);
  const chordR = R * Math.cos(step / 2);
  // solid wall between the last window post and the straight side wall
  const cheek = Math.PI / 2 - ARC;
  const cheekChord = 2 * R * Math.sin(cheek / 2);
  const cheekR = R * Math.cos(cheek / 2);
  // radial ceiling beams around the ring
  const RING_X = C - 1.5;
  const beams = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2 + Math.PI / 12);

  return (
    <group>
      {/* deck + ceiling (ShapeGeometry lies in x/y; rotate into x/z) */}
      <mesh geometry={geo.deck} material={mats.floor} rotation-x={-Math.PI / 2} position-y={0.004} />
      <mesh geometry={geo.deck} material={mats.ceiling} rotation-x={Math.PI / 2} position-y={H} />

      {/* side walls */}
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <mesh position={[(X0 + C) / 2, H / 2, s * R]} rotation-y={s < 0 ? 0 : Math.PI} material={mats.wall}>
            <planeGeometry args={[C - X0, H]} />
          </mesh>
          {/* base light line + high cove line */}
          <mesh position={[(X0 + C) / 2, 0.08, s * (R - 0.02)]} rotation-y={s < 0 ? 0 : Math.PI} material={mats.glowDim}>
            <planeGeometry args={[C - X0, 0.03]} />
          </mesh>
          <mesh position={[(X0 + C) / 2, H - 0.7, s * (R - 0.02)]} rotation-y={s < 0 ? 0 : Math.PI} material={mats.glowDim}>
            <planeGeometry args={[C - X0, 0.025]} />
          </mesh>
          {/* back wall either side of the corridor mouth */}
          <mesh position={[X0, H / 2, s * (R + HALF_W) / 2]} rotation-y={Math.PI / 2} material={mats.wall}>
            <planeGeometry args={[R - HALF_W, H]} />
          </mesh>
          {/* cheek: solid wall from the last window post round to the side wall */}
          {(() => {
            const a = s * (ARC + cheek / 2);
            const [x, z] = onArc(a, cheekR);
            return (
              <mesh position={[x, H / 2, z]} rotation-y={rotOnArc(a)} material={mats.wall}>
                <planeGeometry args={[cheekChord + 0.02, H]} />
              </mesh>
            );
          })()}
        </group>
      ))}
      {/* lintel over the corridor mouth + its accent frame */}
      <mesh position={[X0, (WALL_H + H) / 2, 0]} rotation-y={Math.PI / 2} material={mats.wall}>
        <planeGeometry args={[HALF_W * 2, H - WALL_H]} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={`jamb${s}`} position={[X0 + 0.01, WALL_H / 2, s * (HALF_W + 0.02)]} material={mats.glowDim}>
          <boxGeometry args={[0.02, WALL_H, 0.04]} />
        </mesh>
      ))}
      <mesh position={[X0 + 0.01, WALL_H + 0.02, 0]} material={mats.glowDim}>
        <boxGeometry args={[0.02, 0.04, HALF_W * 2 + 0.08]} />
      </mesh>

      {/* panoramic window: glass panes between slim posts */}
      {panes.map((a, i) => {
        const [x, z] = onArc(a, chordR);
        const ry = rotOnArc(a);
        return (
          <group key={`pane${i}`}>
            <mesh position={[x, (SILL + HEAD) / 2, z]} rotation-y={ry} material={glass}>
              <planeGeometry args={[chord, HEAD - SILL]} />
            </mesh>
            {/* sill wall below, soffit above */}
            <mesh position={[x, SILL / 2, z]} rotation-y={ry} material={mats.wallDark}>
              <planeGeometry args={[chord + 0.02, SILL]} />
            </mesh>
            <mesh position={[x, (HEAD + H) / 2, z]} rotation-y={ry} material={mats.wallDark}>
              <planeGeometry args={[chord + 0.02, H - HEAD]} />
            </mesh>
            {/* sill ledge with a lit lip, and the header light line */}
            {(() => {
              const [lx, lz] = onArc(a, chordR - 0.26);
              return (
                <>
                  <mesh position={[lx, SILL + 0.03, lz]} rotation-y={ry} material={mats.frame}>
                    <boxGeometry args={[chord + 0.02, 0.06, 0.52]} />
                  </mesh>
                  <mesh position={[lx, SILL + 0.005, lz + 0]} rotation-y={ry} material={mats.glowDim}>
                    <boxGeometry args={[chord, 0.012, 0.54]} />
                  </mesh>
                </>
              );
            })()}
            <mesh position={[x, HEAD + 0.02, z]} rotation-y={ry} material={mats.glow}>
              <boxGeometry args={[chord, 0.025, 0.06]} />
            </mesh>
          </group>
        );
      })}
      {posts.map((a, i) => {
        const [x, z] = onArc(a, R - 0.02);
        const [ix, iz] = onArc(a, R - 0.16);
        const ry = rotOnArc(a);
        const end = i === 0 || i === PANES;
        return (
          <group key={`post${i}`}>
            <mesh position={[x, H / 2, z]} rotation-y={ry} material={mats.frame}>
              <boxGeometry args={[end ? 0.5 : 0.12, H, end ? 0.5 : 0.26]} />
            </mesh>
            {!end && (
              <mesh position={[ix, (SILL + HEAD) / 2, iz]} rotation-y={ry} material={mats.glowDim}>
                <boxGeometry args={[0.018, HEAD - SILL - 0.2, 0.01]} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* ceiling: lit ring + radial beams */}
      <mesh position={[RING_X, H - 0.22, 0]} rotation-x={Math.PI / 2} material={mats.ring}>
        <torusGeometry args={[4.2, 0.035, 12, 160]} />
      </mesh>
      <mesh position={[RING_X, H - 0.12, 0]} rotation-x={Math.PI / 2} material={mats.frame}>
        <torusGeometry args={[4.2, 0.12, 12, 120]} />
      </mesh>
      {beams.map((b, i) => {
        const r0 = 4.35;
        const r1 = 7.0;
        const mid = (r0 + r1) / 2;
        return (
          <mesh
            key={`beam${i}`}
            position={[RING_X + Math.cos(b) * mid, H - 0.09, Math.sin(b) * mid]}
            rotation-y={-b}
            material={mats.frame}
          >
            <boxGeometry args={[r1 - r0, 0.18, 0.2]} />
          </mesh>
        );
      })}

      {/* deck inlays: the command circle round the chair + an outer ring */}
      <mesh position={[CHAIR.x, 0.012, 0]} rotation-x={-Math.PI / 2} material={mats.glowDim}>
        <ringGeometry args={[2.25, 2.28, 128]} />
      </mesh>
      <mesh position={[C - 1.5, 0.012, 0]} rotation-x={-Math.PI / 2} material={mats.glowDim}>
        <ringGeometry args={[6.7, 6.73, 160]} />
      </mesh>
    </group>
  );
}

/* ── captain's chair ─────────────────────────────────────────────────────── */

function CaptainsChair({ mats }: { mats: ReturnType<typeof useBridgeMats> }) {
  const geo = useMemo(
    () => ({
      seat: new RoundedBoxGeometry(0.62, 0.14, 0.64, 3, 0.05),
      back: new RoundedBoxGeometry(0.12, 0.66, 0.58, 3, 0.05),
      arm: new RoundedBoxGeometry(0.52, 0.07, 0.11, 2, 0.03),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return (
    <group position={CHAIR.toArray()}>
      <mesh position={[0, 0.04, 0]} material={mats.frame}>
        <cylinderGeometry args={[0.46, 0.52, 0.08, 40]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={mats.steel}>
        <cylinderGeometry args={[0.08, 0.11, 0.36, 24]} />
      </mesh>
      <mesh geometry={geo.seat} position={[0.04, 0.48, 0]} material={mats.leather} />
      <mesh geometry={geo.back} position={[-0.27, 0.84, 0]} rotation-z={0.1} material={mats.leather} />
      {/* spine light facing whoever stands behind the chair */}
      <mesh position={[-0.345, 0.86, 0]} rotation-z={0.1} material={mats.glowDim}>
        <boxGeometry args={[0.01, 0.44, 0.018]} />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <group key={s}>
          <mesh geometry={geo.arm} position={[0.03, 0.68, s * 0.37]} material={mats.frame} />
          <mesh position={[0.1, 0.72, s * 0.37]} material={mats.glowWarm}>
            <boxGeometry args={[0.16, 0.006, 0.05]} />
          </mesh>
          <mesh position={[-0.1, 0.57, s * 0.37]} material={mats.frame}>
            <boxGeometry args={[0.05, 0.2, 0.05]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── console screens (canvas painters) ───────────────────────────────────── */

const mono = () => familyVar("--ff-mono", "ui-monospace, monospace");
const sans = () => familyVar("--ff-body", "system-ui, sans-serif");

/** Comms uplink screen: header, big label, prompt. Painted on a 2× canvas. */
function paintComms(ctx: CanvasRenderingContext2D, label: string, header: string, prompt: string, hover: boolean) {
  const W = 512;
  const Hh = 288;
  ctx.clearRect(0, 0, W, Hh);
  const bg = ctx.createLinearGradient(0, 0, 0, Hh);
  bg.addColorStop(0, hover ? "#13203a" : "#0c1424");
  bg.addColorStop(1, "#070b14");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, Hh);
  ctx.strokeStyle = hover ? ACCENT : "rgba(127,176,232,0.45)";
  ctx.lineWidth = 3;
  roundRect(ctx, 6, 6, W - 12, Hh - 12, 14);
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.font = `600 20px ${mono()}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(127,176,232,0.85)";
  ctx.fillText(header, 30, 40);
  ctx.textAlign = "right";
  ctx.fillStyle = "#6fe0a8";
  ctx.fillText("● LIVE", W - 30, 40);
  ctx.textAlign = "center";
  ctx.font = `700 66px ${sans()}`;
  ctx.fillStyle = "#f4f1ea";
  ctx.fillText(`${label}  ↗`, W / 2, 138);
  ctx.fillStyle = "rgba(127,176,232,0.22)";
  ctx.fillRect(30, 196, W - 60, 2);
  ctx.textAlign = "left";
  ctx.font = `500 24px ${mono()}`;
  ctx.fillStyle = hover ? "#f4f1ea" : "rgba(244,241,234,0.72)";
  ctx.fillText(prompt, 30, 238);
}

/** NAV screen layout (512×320 layout units). */
const NAV = { W: 512, H: 320, gx: 16, gy: 58, gw: 480, gh: 204, gap: 8, hailY: 272, hailH: 36 };
const tileW = (NAV.gw - NAV.gap * 2) / 3;
const tileH = (NAV.gh - NAV.gap * 2) / 3;

function paintNav(ctx: CanvasRenderingContext2D, hover: number) {
  const { W, H: Hh } = NAV;
  ctx.clearRect(0, 0, W, Hh);
  const bg = ctx.createLinearGradient(0, 0, 0, Hh);
  bg.addColorStop(0, "#0d1526");
  bg.addColorStop(1, "#070b14");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, Hh);
  ctx.strokeStyle = "rgba(127,176,232,0.45)";
  ctx.lineWidth = 2;
  roundRect(ctx, 4, 4, W - 8, Hh - 8, 12);
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `600 15px ${mono()}`;
  ctx.fillStyle = ACCENT;
  ctx.fillText("NAV  ·  SET COURSE", 20, 30);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(244,241,234,0.5)";
  ctx.fillText("SELECT A DESTINATION", W - 20, 30);
  ROOMS.forEach((r, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = NAV.gx + col * (tileW + NAV.gap);
    const y = NAV.gy + row * (tileH + NAV.gap);
    const on = hover === i;
    ctx.fillStyle = on ? "rgba(127,176,232,0.16)" : "rgba(255,255,255,0.035)";
    roundRect(ctx, x, y, tileW, tileH, 8);
    ctx.fill();
    ctx.strokeStyle = on ? r.accent : "rgba(255,255,255,0.08)";
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    ctx.fillStyle = r.accent;
    ctx.fillRect(x + 1, y + 12, 3, tileH - 24);
    ctx.textAlign = "left";
    ctx.font = `600 11px ${mono()}`;
    ctx.fillStyle = r.accent;
    ctx.fillText(r.index, x + 14, y + 17);
    ctx.font = `700 19px ${sans()}`;
    ctx.fillStyle = "#f4f1ea";
    ctx.fillText(r.title, x + 14, y + 38);
    ctx.font = `500 9.5px ${mono()}`;
    ctx.fillStyle = "rgba(244,241,234,0.52)";
    let cat = r.category.toUpperCase();
    while (ctx.measureText(cat).width > tileW - 26 && cat.length > 4) cat = cat.slice(0, -2) + "…";
    ctx.fillText(cat, x + 14, y + 55);
  });
  const hon = hover === ROOMS.length;
  ctx.fillStyle = hon ? "rgba(255,92,56,0.2)" : "rgba(255,92,56,0.08)";
  roundRect(ctx, NAV.gx, NAV.hailY, NAV.gw, NAV.hailH, 8);
  ctx.fill();
  ctx.strokeStyle = hon ? "#ff5c38" : "rgba(255,92,56,0.45)";
  ctx.lineWidth = hon ? 2 : 1;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.font = `600 13px ${mono()}`;
  ctx.fillStyle = "#ff8a6b";
  ctx.fillText("HAIL  ·  OPEN A CHANNEL", NAV.gx + 16, NAV.hailY + NAV.hailH / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(244,241,234,0.8)";
  ctx.fillText(`${SITE.email}  →`, NAV.gx + NAV.gw - 16, NAV.hailY + NAV.hailH / 2);
}

/** Which NAV target a screen uv falls on: room index, ROOMS.length = HAIL, -1 = none. */
function navHit(uv: THREE.Vector2): number {
  const x = uv.x * NAV.W;
  const y = (1 - uv.y) * NAV.H;
  if (x >= NAV.gx && x <= NAV.gx + NAV.gw && y >= NAV.hailY && y <= NAV.hailY + NAV.hailH) return ROOMS.length;
  const col = Math.floor((x - NAV.gx) / (tileW + NAV.gap));
  const row = Math.floor((y - NAV.gy) / (tileH + NAV.gap));
  if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
  const lx = x - NAV.gx - col * (tileW + NAV.gap);
  const ly = y - NAV.gy - row * (tileH + NAV.gap);
  if (lx > tileW || ly > tileH) return -1;
  const i = row * 3 + col;
  return i < ROOMS.length ? i : -1;
}

/** A 2×-resolution canvas texture repainted by `paint(ctx, state)` whenever
 *  `state` changes (and once more when webfonts land). */
function useScreen(w: number, h: number, paint: (ctx: CanvasRenderingContext2D, state: number) => void) {
  const s = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    const draw = (state: number) => {
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      paint(ctx, state);
      tex.needsUpdate = true;
    };
    draw(-1);
    return { tex, draw };
  }, [w, h, paint]);
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && s.draw(-1)).catch(() => {});
    return () => {
      cancelled = true;
      s.tex.dispose();
    };
  }, [s]);
  return s;
}

/* ── consoles ────────────────────────────────────────────────────────────── */

/** A raked console facing the chair: tapered housing + a screen head. */
function ConsoleBody({ width, mats }: { width: number; mats: ReturnType<typeof useBridgeMats> }) {
  return (
    <group>
      <mesh position={[0, 0.04, -0.05]} material={mats.frame}>
        <boxGeometry args={[width + 0.12, 0.08, 0.7]} />
      </mesh>
      <mesh position={[0, 0.48, -0.1]} rotation-x={-0.12} material={mats.wall}>
        <boxGeometry args={[width, 0.8, 0.42]} />
      </mesh>
      <mesh position={[0, 0.2, 0.13]} rotation-x={-0.12} material={mats.glowDim}>
        <boxGeometry args={[width - 0.1, 0.012, 0.01]} />
      </mesh>
    </group>
  );
}

function useHoverable(onPick: (e: ThreeEvent<PointerEvent>) => void, onHover?: (e: ThreeEvent<PointerEvent> | null) => void) {
  const hovered = useRef(false);
  return {
    hovered,
    handlers: {
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onPick(e as unknown as ThreeEvent<PointerEvent>);
      },
      onPointerMove: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (!hovered.current) {
          hovered.current = true;
          document.body.style.cursor = "pointer";
          setWorldHover(true);
        }
        onHover?.(e);
      },
      onPointerOut: () => {
        hovered.current = false;
        document.body.style.cursor = "";
        setWorldHover(false);
        onHover?.(null);
      },
    },
  };
}

const COMMS_W = 1.34;
const COMMS_H = COMMS_W * (288 / 512);

function CommsConsole({
  label,
  href,
  position,
  mats,
}: {
  label: string;
  href: string;
  position: [number, number, number];
  mats: ReturnType<typeof useBridgeMats>;
}) {
  const paint = useMemo(
    () => (ctx: CanvasRenderingContext2D, state: number) =>
      paintComms(ctx, label, "COMMS UPLINK · EXT", "> OPEN CHANNEL", state === 1),
    [label],
  );
  const screen = useScreen(512, 288, paint);
  const head = useRef<THREE.Group>(null);
  const k = useRef(0);
  const last = useRef(-1);
  const { hovered, handlers } = useHoverable(() => window.open(href, "_blank", "noopener,noreferrer"));
  useFrame((_, dt) => {
    k.current = damp(k.current, hovered.current ? 1 : 0, 10, Math.min(dt, 1 / 30));
    if (head.current) head.current.scale.setScalar(1 + 0.04 * k.current);
    const st = hovered.current ? 1 : 0;
    if (st !== last.current) {
      last.current = st;
      screen.draw(st);
    }
  });
  const yaw = Math.atan2(CHAIR.x - position[0], CHAIR.z - position[2]);
  return (
    <group position={position} rotation-y={yaw}>
      <ConsoleBody width={COMMS_W + 0.1} mats={mats} />
      <group ref={head} position={[0, 1.2, 0]} rotation-x={-0.5}>
        <mesh position={[0, 0, -0.05]} material={mats.frame}>
          <boxGeometry args={[COMMS_W + 0.12, COMMS_H + 0.12, 0.08]} />
        </mesh>
        <mesh position={[0, 0, 0.001]} {...handlers}>
          <planeGeometry args={[COMMS_W, COMMS_H]} />
          <meshBasicMaterial map={screen.tex} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

const NAV_W = 2.6;
const NAV_H = NAV_W * (NAV.H / NAV.W);

function NavConsole({ position, mats }: { position: [number, number, number]; mats: ReturnType<typeof useBridgeMats> }) {
  const screen = useScreen(NAV.W, NAV.H, paintNav);
  const hoverIdx = useRef(-1);
  const drawn = useRef(-1);
  const { handlers } = useHoverable(
    (e) => {
      const i = e.uv ? navHit(e.uv) : -1;
      if (i < 0) return;
      if (i === ROOMS.length) window.open(`mailto:${SITE.email}`, "_self");
      else window.location.hash = `#${ROOMS[i].id}`;
    },
    (e) => {
      hoverIdx.current = e && e.uv ? navHit(e.uv) : -1;
    },
  );
  useFrame(() => {
    if (hoverIdx.current !== drawn.current) {
      drawn.current = hoverIdx.current;
      screen.draw(hoverIdx.current);
    }
  });
  const yaw = Math.atan2(CHAIR.x - position[0], CHAIR.z - position[2]);
  return (
    <group position={position} rotation-y={yaw}>
      <ConsoleBody width={NAV_W * 0.8} mats={mats} />
      {/* screen on a raked stand */}
      <mesh position={[0, 1.12, -0.18]} material={mats.frame}>
        <boxGeometry args={[0.16, 0.74, 0.1]} />
      </mesh>
      <group position={[0, 1.78, -0.12]} rotation-x={-0.26}>
        <mesh position={[0, 0, -0.05]} material={mats.frame}>
          <boxGeometry args={[NAV_W + 0.12, NAV_H + 0.12, 0.08]} />
        </mesh>
        <mesh position={[0, -NAV_H / 2 - 0.07, 0.0]} material={mats.glow}>
          <boxGeometry args={[NAV_W * 0.6, 0.012, 0.012]} />
        </mesh>
        <mesh position={[0, 0, 0.001]} {...handlers}>
          <planeGeometry args={[NAV_W, NAV_H]} />
          <meshBasicMaterial map={screen.tex} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/* ── the room ────────────────────────────────────────────────────────────── */

export default function BridgeRoom() {
  const mats = useBridgeMats();
  // distance gate for the draw calls
  const gate = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = gate.current;
    if (!g) return;
    const d = X0 - camera.position.x;
    if (g.visible) {
      if (d > 44) g.visible = false;
    } else if (d < 41) g.visible = true;
  });
  const side = 36 * (Math.PI / 180);
  const cr = 3.1;
  return (
    <group>
      <group ref={gate}>
        <Architecture mats={mats} />
        <CaptainsChair mats={mats} />
        <NavConsole position={[CHAIR.x + cr + 0.4, 0, 0]} mats={mats} />
        <CommsConsole
          label="GITHUB"
          href={SITE.socials[0].href}
          position={[CHAIR.x + cr * Math.cos(side), 0, -cr * Math.sin(side) - 0.6]}
          mats={mats}
        />
        <CommsConsole
          label="LINKEDIN"
          href={SITE.socials[1].href}
          position={[CHAIR.x + cr * Math.cos(side), 0, cr * Math.sin(side) + 0.6]}
          mats={mats}
        />
      </group>
    </group>
  );
}
