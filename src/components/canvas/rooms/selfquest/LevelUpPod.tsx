"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { GLOW, MATERIALS, NEUTRAL, WARM, tintNeutral } from "../../theme";
import { getPuckTex } from "../shared";
import { Board, fonts, INK, accentInk, type Painter } from "../holo";
import { roundRect } from "../../canvas2d";
import { buildSwordGeometry, getAthleteGeometry, makeHoloMaterial, makeSwordMaterial } from "./avatar";
import { useDisposable } from "./useDisposable";

/* ── the hero: LEVEL-UP POD ──────────────────────────────────────────────────
 * SelfQuest turns a workout into an RPG, so the centrepiece is the game's
 * character screen made physical: a machined projector pad throws the
 * player's hero — the app's armoured knight on an athlete's body, greatsword
 * thrust up at the moment of level-up — framed by a standing steel LEVEL ARC
 * whose inner channel is the XP bar (84.5% full, segmented into levels), with
 * the level badge on its crown and the sword's tip reaching for it. The real
 * gear on the floor is the workout; the hologram is what it builds. Accent
 * only as light — lens, channel, hologram; every piece of hardware is neutral
 * steel / paint / rubber.
 * Local origin = centre of the pad on the floor; +z faces the viewer. */

const XP_FRAC = 0.845; // matches the quest board's 8,450 / 10,000
const PAD_R = 0.6;
const PAD_H = 0.16;
const ARC_R = 1.0;
const ARC_Y = PAD_H + 1.1; // hoop centre: the sword tip stops just under the crown
const ARC_SPAN = (300 * Math.PI) / 180; // 60° open at the bottom for the feet
const ARC_START = -Math.PI / 2 + (Math.PI * 2 - ARC_SPAN) / 2; // bottom-right end
const AVATAR_S = 0.74; // the figure fills ~70% of the hoop; tip just under the channel

/** Height of the pod's top edge (the badge crown) above its origin. */
export const POD_TOP = ARC_Y + ARC_R + 0.24;

function useBadgePainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono } = fonts();
      // enamel lozenge: dark face, accent keyline, top sheen
      roundRect(ctx, 6, 6, w - 12, h - 12, (h - 12) / 2);
      ctx.fillStyle = "#10131c";
      ctx.fill();
      const sh = ctx.createLinearGradient(0, 0, 0, h);
      sh.addColorStop(0, "rgba(255,255,255,0.09)");
      sh.addColorStop(0.5, "rgba(255,255,255,0)");
      ctx.fillStyle = sh;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = accentInk(accent, 0.2);
      ctx.font = `600 ${Math.round(h * 0.25)}px ${mono}`;
      ctx.fillText("LV", w * 0.2, h * 0.53);
      ctx.fillStyle = INK;
      ctx.font = `700 ${Math.round(h * 0.56)}px ${ser}`;
      ctx.fillText("42", w * 0.44, h * 0.56);
    },
    [accent],
  );
}

/** Radial tick ring painted once — the lens face on the projector pad. */
function useLensTex(accent: string) {
  return useDisposable(() => {
    const S = 256;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d")!;
    ctx.translate(S / 2, S / 2);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const major = i % 6 === 0;
      ctx.strokeStyle = major ? accent : "rgba(244,241,234,0.28)";
      ctx.lineWidth = major ? 3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (major ? 100 : 108), Math.sin(a) * (major ? 100 : 108));
      ctx.lineTo(Math.cos(a) * 120, Math.sin(a) * 120);
      ctx.stroke();
    }
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, Math.PI * 2);
    ctx.stroke();
    // inner emitter ring the avatar stands in
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, Math.PI * 2);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, accent);
}

function useAthlete() {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => {
    let live = true;
    getAthleteGeometry().then((g) => live && setGeo(g));
    return () => {
      live = false;
    };
  }, []);
  return geo; // session-cached: never disposed with the pod
}

/** Soft additive light column (radius 0.32, 1.6 tall): strongest at its
 *  bottom end. `down` flips it so the bright end is at the top (a ceiling
 *  emitter throwing light downward). */
function ProjectionBeam({
  accent,
  down = false,
  strength = 0.06,
  ...group
}: { accent: string; down?: boolean; strength?: number } & Omit<ThreeElements["group"], "children">) {
  const beam = useDisposable(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(accent) }, uK: { value: strength } },
      vertexShader: /* glsl */ `
        varying float vY;
        varying float vF;
        void main() {
          vY = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vF = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uK;
        varying float vY;
        varying float vF;
        void main() {
          // soft volumetric column: strongest at the lens, gone by the
          // shoulders, feathered at the silhouette so it never reads as a tube
          float a = uK * pow(1.0 - vY, 2.2) * pow(vF, 2.4);
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    m.toneMapped = false;
    return m;
  }, `${accent}${strength}`);

  return (
    <group {...group}>
      <mesh rotation-x={down ? Math.PI : 0} material={beam}>
        <cylinderGeometry args={[0.32, 0.32, 1.6, 40, 1, true]} />
      </mesh>
    </group>
  );
}

/** The holographic athlete (depth pre-pass + additive hologram), turning
 *  SLOWLY back and forth around its best 3/4 view — an 18 s eased sway, so it
 *  always presents to the corridor; frozen under reduced motion. Origin =
 *  between the feet. Renders nothing until the idle-built mesh is ready. */
function AvatarHolo({ accent, animate, scale = 1, baseYaw = 0.55 }: { accent: string; animate: boolean; scale?: number; baseYaw?: number }) {
  const geo = useAthlete();
  const holo = useDisposable(() => makeHoloMaterial(accent), accent);
  // depth pre-pass: only the figure's nearest surface is shaded, so limbs
  // never stack additive light. Transparent + high renderOrder so it runs
  // AFTER the opaque bay (never punches a hole in the back wall).
  const depthOnly = useDisposable(
    () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true }),
  );
  const sword = useDisposable(() => buildSwordGeometry());
  const blade = useDisposable(() => makeSwordMaterial(accent), accent);
  const spin = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = spin.current;
    if (!g) return;
    g.rotation.y = animate ? baseYaw + 0.38 * Math.sin((clock.elapsedTime * Math.PI * 2) / 18) : baseYaw;
  });
  if (!geo) return null;
  return (
    <group ref={spin} rotation-y={baseYaw}>
      <group scale={scale}>
        <mesh geometry={geo} material={depthOnly} renderOrder={20} />
        <mesh geometry={geo} material={holo} renderOrder={21} />
        {/* the greatsword: its own brighter material, depth-tested against
            the figure so the gauntlet closes over the grip */}
        <mesh geometry={sword} material={blade} renderOrder={22} />
      </group>
    </group>
  );
}

/** Phone layout: the card hides everything below ~1.9 m, so the avatar is
 *  thrown DOWN from a ceiling-mounted emitter (drop rod, housing, lens) into
 *  the clear band beside the screen — explained by its rig, never floating.
 *  Local origin = the ceiling point (y = 0 is the ceiling plane). */
export function CeilingHolo({ accent, animate, drop = 1.8 }: { accent: string; animate: boolean; drop?: number }) {
  const paint = useDisposable(() => MATERIALS.paintLight());
  const steel = useDisposable(() => MATERIALS.steel());
  const polished = useDisposable(() => MATERIALS.polished());
  const glass = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: NEUTRAL.hullShadow, roughness: 0.16, metalness: 0.55 }),
  );
  const ring = useDisposable(() => MATERIALS.emit(accent, GLOW.trim), accent);
  const H = 0.12; // rod length
  const S = 0.56; // avatar scale
  const lensY = -H - 0.052;
  return (
    <group>
      <mesh position-y={-0.012} material={paint}>
        <cylinderGeometry args={[0.1, 0.1, 0.024, 20]} />
      </mesh>
      <mesh position-y={-H / 2} material={steel}>
        <cylinderGeometry args={[0.014, 0.014, H, 10]} />
      </mesh>
      {/* slim projector puck: flat housing, polished bezel, dark glass lens
          with a thin light ring — reads as a device, not a light fitting */}
      <mesh position-y={-H - 0.025} material={paint}>
        <cylinderGeometry args={[0.12, 0.12, 0.05, 40]} />
      </mesh>
      <mesh position-y={lensY} rotation-x={Math.PI / 2} material={polished}>
        <torusGeometry args={[0.112, 0.008, 8, 48]} />
      </mesh>
      <mesh position-y={lensY - 0.002} rotation-x={Math.PI / 2} material={glass}>
        <circleGeometry args={[0.105, 40]} />
      </mesh>
      <mesh position-y={lensY - 0.004} rotation-x={Math.PI / 2} material={ring}>
        <ringGeometry args={[0.05, 0.062, 40]} />
      </mesh>
      <ProjectionBeam accent={accent} down strength={0.18} position={[0, lensY - 0.8, 0]} />
      <group position-y={-drop}>
        <AvatarHolo accent={accent} animate={animate} scale={S} baseYaw={0.3} />
      </group>
    </group>
  );
}

export function LevelUpPod({ accent, animate, compact = false }: { accent: string; animate: boolean; compact?: boolean }) {
  const body = useDisposable(() => MATERIALS.paintLight({ color: tintNeutral(NEUTRAL.hull, accent, 0.05).getStyle() }), accent);
  const polished = useDisposable(() => MATERIALS.polished());
  const satin = useDisposable(() => MATERIALS.steel());
  const brass = useDisposable(() => new THREE.MeshStandardMaterial({ color: WARM, roughness: 0.32, metalness: 0.85 }));
  const lensGlass = useDisposable(
    () => new THREE.MeshStandardMaterial({ color: NEUTRAL.hullShadow, roughness: 0.16, metalness: 0.55 }),
  );
  const lensTex = useLensTex(accent);
  const lensMark = useDisposable(
    () => new THREE.MeshBasicMaterial({ map: lensTex, transparent: true, depthWrite: false, toneMapped: false }),
    lensTex.uuid,
  );
  const glowLine = useDisposable(() => MATERIALS.emit(accent, GLOW.line), accent);
  const glowTrim = useDisposable(() => MATERIALS.emit(accent, GLOW.trim), accent);
  const pool = useDisposable(
    () =>
      new THREE.MeshBasicMaterial({
        map: getPuckTex(),
        color: accent,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    accent,
  );
  // the unfilled part of the XP channel: a faint accent-tinted groove that
  // reads as "not yet earned", never as a missing piece
  const track = useDisposable(
    () =>
      new THREE.MeshStandardMaterial({
        color: tintNeutral(NEUTRAL.hullShadow, accent, 0.12),
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.14,
        roughness: 0.45,
        metalness: 0.35,
      }),
    accent,
  );
  const badge = useBadgePainter(accent);

  // level dividers across the XP channel (4 → five level segments), plus a
  // satin end stop where the earned XP ends (no glowing bead)
  const notchGeo = useDisposable(() => new THREE.BoxGeometry(0.008, 0.05, 0.03));
  const notches = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = notches.current;
    if (!im) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const at = [0.2, 0.4, 0.6, 0.8, XP_FRAC];
    for (let i = 1; i <= at.length; i++) {
      const a = ARC_START + at[i - 1] * ARC_SPAN;
      const r = ARC_R - 0.045;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      m.compose(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.034), q, s);
      im.setMatrixAt(i - 1, m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }, []);

  const endR = ARC_R - 0.045;

  return (
    <group>
      {/* soft accent pool on the floor around the pad (no light added) */}
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} renderOrder={1} material={pool}>
        <planeGeometry args={[2.3, 2.3]} />
      </mesh>

      {/* ── projector pad: satin foot, painted drum, polished bezel, glass lens ── */}
      <mesh position={[0, 0.022, 0]} material={satin}>
        <cylinderGeometry args={[PAD_R + 0.02, PAD_R + 0.04, 0.044, 64]} />
      </mesh>
      {/* recessed shadow gap with a thin light line — the pad reads as a machine */}
      <mesh position={[0, 0.052, 0]} material={glowTrim}>
        <cylinderGeometry args={[PAD_R - 0.025, PAD_R - 0.025, 0.012, 64, 1, true]} />
      </mesh>
      <mesh position={[0, 0.058 + (PAD_H - 0.058) / 2, 0]} material={body}>
        <cylinderGeometry args={[PAD_R - 0.01, PAD_R - 0.01, PAD_H - 0.058, 64]} />
      </mesh>
      <mesh position={[0, PAD_H, 0]} rotation-x={Math.PI / 2} material={polished}>
        <torusGeometry args={[PAD_R - 0.025, 0.02, 12, 72]} />
      </mesh>
      <mesh position={[0, PAD_H + 0.004, 0]} rotation-x={-Math.PI / 2} material={lensGlass}>
        <circleGeometry args={[PAD_R - 0.03, 64]} />
      </mesh>
      <mesh position={[0, PAD_H + 0.008, 0]} rotation-x={-Math.PI / 2} material={lensMark}>
        <planeGeometry args={[(PAD_R - 0.03) * 2 * (128 / 120), (PAD_R - 0.03) * 2 * (128 / 120)]} />
      </mesh>

      {/* faint projection column the avatar stands in */}
      <ProjectionBeam accent={accent} position={[0, PAD_H + 0.8, 0]} />

      {/* ── the avatar ── */}
      <group position={[0, PAD_H + 0.012, 0]}>
        <AvatarHolo accent={accent} animate={animate} scale={AVATAR_S} />
      </group>

      {/* ── LEVEL ARC: steel hoop on two posts, XP light channel inside ── */}
      <group position={[0, ARC_Y, -0.14]}>
        <group rotation-z={ARC_START}>
          {/* outer polished hoop */}
          <mesh material={polished}>
            <torusGeometry args={[ARC_R, 0.024, 14, 120, ARC_SPAN]} />
          </mesh>
          {/* channel: faint groove + the earned XP in light */}
          <mesh position-z={0.022} material={track}>
            <torusGeometry args={[endR, 0.017, 10, 120, ARC_SPAN]} />
          </mesh>
          <mesh position-z={0.03} material={glowLine}>
            <torusGeometry args={[endR, 0.012, 10, 120, ARC_SPAN * XP_FRAC]} />
          </mesh>
        </group>
        <instancedMesh ref={notches} args={[notchGeo, satin, 5]} />
        {/* collars where the hoop meets its posts + posts into the pad */}
        {[ARC_START, ARC_START + ARC_SPAN].map((a) => {
          const y = Math.sin(a) * ARC_R;
          const post = y + ARC_Y - PAD_H;
          return (
            <group key={a} position={[Math.cos(a) * ARC_R, y, 0]}>
              <mesh material={satin}>
                <cylinderGeometry args={[0.045, 0.045, 0.07, 20]} />
              </mesh>
              <mesh position-y={-0.036} material={brass}>
                <cylinderGeometry args={[0.047, 0.047, 0.008, 20]} />
              </mesh>
              <mesh position={[0, -post / 2, 0]} material={satin}>
                <cylinderGeometry args={[0.024, 0.024, post, 14]} />
              </mesh>
            </group>
          );
        })}
        {/* level badge on the crown, on a short stem */}
        <mesh position={[0, ARC_R + 0.05, 0]} material={satin}>
          <cylinderGeometry args={[0.014, 0.014, 0.06, 10]} />
        </mesh>
        <group position={[0, ARC_R + 0.15, 0.01]}>
          {/* capsule backing that follows the enamel lozenge's outline */}
          <mesh position-z={-0.02} rotation-z={Math.PI / 2} scale={[1, 1, 0.18]} material={body}>
            <capsuleGeometry args={[0.083, 0.2, 6, 20]} />
          </mesh>
          <Board w={0.36} h={0.16} res={compact ? 256 : 384} paint={badge} accent={accent} slab={false} position-z={0.012} />
        </group>
      </group>
    </group>
  );
}
