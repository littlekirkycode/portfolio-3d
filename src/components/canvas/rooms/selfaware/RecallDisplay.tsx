"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { hexA, roundRect, useTextTexture } from "../../canvas2d";
import { MATERIALS, NEUTRAL } from "../../theme";
import { Board, fonts, type Painter } from "../holo";
import { ACTION, ANSWER, QUERY, RECALLED, drawIcon } from "./memories";
import { lightTint } from "./tiles";
import { useDeferredDispose } from "./dispose";

/* ── the recall display — the whole agent loop on one calm panel ────────────
 * query → the three memories retrieval returned (same tiles as the lit chips
 * on the core's orbit) with similarity → the agent's ANSWER, typed on at a
 * constant slow rate → the TOOL CALL it made → the pipeline (Supabase →
 * OpenAI agent → streamed). A bezelled graphite readout hung from the ceiling
 * on two drop rods; the SECONDARY read (the core is the hero): ink text at
 * ≤0.9, the accent only where it carries meaning (tile edges, bars, the
 * check, the STREAMED step). Sized from the dwell camera: the smallest text
 * (kicker/footer) renders ≥ ~12px at 1440×900.
 * ──────────────────────────────────────────────────────────────────────── */

export const RECALL_W = 1.6;
const CW = 1024;
const CH = 762;
export const RECALL_H = (RECALL_W * CH) / CW;
/** Answer overlay band (canvas px) — typed on over the board. */
const ANS_Y0 = 518;
const ANS_H = 150;
const PAD = 44;

const INK_A = (a: number) => `rgba(236,233,226,${a})`;

function useRecallPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono, sans } = fonts();
      const lt = `#${lightTint(accent, 0.3).getHexString()}`;
      // graphite glass: neutral, top-lit, no accent wash
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1f2533");
      g.addColorStop(0.55, "#161b26");
      g.addColorStop(1, "#11151e");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // kicker row
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 50px ${mono}`;
      ctx.textAlign = "left";
      ctx.fillStyle = INK_A(0.6);
      ctx.fillText("QUERY", PAD, 76);
      ctx.textAlign = "right";
      ctx.fillText("RECALL · TOP 3", w - PAD, 76);

      // the query
      ctx.textAlign = "left";
      ctx.fillStyle = INK_A(0.88);
      ctx.font = `700 90px ${ser}`;
      ctx.fillText(`“${QUERY}”`, PAD, 164);
      ctx.fillStyle = INK_A(0.14);
      ctx.fillRect(PAD, 190, w - PAD * 2, 2);

      // recalled memories: tile · text · score, bar underneath
      let y = 204;
      const rowH = 100;
      const tile = 74;
      for (const m of RECALLED) {
        roundRect(ctx, PAD, y + 8, tile, tile, 16);
        ctx.fillStyle = hexA(accent, 0.2);
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = lt;
        ctx.stroke();
        ctx.strokeStyle = INK_A(0.9);
        drawIcon(ctx, m.icon, PAD + tile / 2, y + 8 + tile / 2, 46);

        const tx = PAD + tile + 24;
        const scoreW = 128;
        ctx.textAlign = "left";
        ctx.fillStyle = INK_A(0.85);
        ctx.font = `500 54px ${sans}`;
        ctx.fillText(m.text, tx, y + 54, w - PAD - tx - scoreW);
        const bw = w - PAD - tx - scoreW - 12;
        const by = y + 72;
        ctx.fillStyle = INK_A(0.1);
        roundRect(ctx, tx, by, bw, 10, 5);
        ctx.fill();
        ctx.fillStyle = accent;
        roundRect(ctx, tx, by, bw * (m.score ?? 0), 10, 5);
        ctx.fill();
        ctx.textAlign = "right";
        ctx.fillStyle = INK_A(0.8);
        ctx.font = `600 52px ${mono}`;
        ctx.fillText((m.score ?? 0).toFixed(2), w - PAD, y + 70);
        y += rowH;
      }

      // rule between recall and the agent's output
      ctx.fillStyle = INK_A(0.14);
      ctx.fillRect(PAD, ANS_Y0 - 8, w - PAD * 2, 2);

      // pipeline footer: three chips
      const steps = ["SUPABASE", "OPENAI AGENT", "STREAMED"];
      ctx.font = `600 44px ${mono}`;
      const chipH = 62;
      const cy = h - 26 - chipH;
      const arrowW = 36;
      const widths = steps.map((s) => ctx.measureText(s).width + 30);
      const total = widths.reduce((a, b) => a + b, 0) + arrowW * (steps.length - 1);
      const k = Math.min(1, (w - PAD * 2) / total);
      let x = PAD;
      steps.forEach((s, i) => {
        const cw = widths[i] * k;
        const last = i === steps.length - 1;
        roundRect(ctx, x, cy, cw, chipH, 12);
        ctx.fillStyle = last ? hexA(accent, 0.2) : INK_A(0.05);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = last ? lt : INK_A(0.22);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = last ? INK_A(0.95) : INK_A(0.7);
        ctx.fillText(s, x + cw / 2, cy + chipH / 2 + 15, cw - 12);
        x += cw;
        if (!last) {
          ctx.fillStyle = INK_A(0.4);
          ctx.fillText("›", x + (arrowW * k) / 2, cy + chipH / 2 + 15);
          x += arrowW * k;
        }
      });
    },
    [accent],
  );
}

/** Answer + tool-call lines, painted on a transparent strip that overlays the
 *  board. Reports each line's right edge (0..1 of the strip width) so the
 *  type-on reveal runs at a constant rate per glyph width. */
function useAnswerTexture(accent: string, extents: { current: [number, number, number] }) {
  const paint = useMemo<Painter>(
    () => (ctx, w) => {
      const { mono, sans } = fonts();
      const lt = `#${lightTint(accent, 0.3).getHexString()}`;
      ctx.textBaseline = "alphabetic";
      // line 1 — the answer (label + text)
      ctx.textAlign = "left";
      ctx.font = `600 44px ${mono}`;
      ctx.fillStyle = lt;
      ctx.fillText("ANSWER", PAD, 56);
      const lx = PAD + ctx.measureText("ANSWER").width + 22;
      let size = 48;
      ctx.font = `500 ${size}px ${sans}`;
      while (ctx.measureText(ANSWER).width > w - PAD - lx && size > 38) {
        size -= 1;
        ctx.font = `500 ${size}px ${sans}`;
      }
      ctx.fillStyle = INK_A(0.95);
      ctx.fillText(ANSWER, lx, 56);
      const e1 = lx + ctx.measureText(ANSWER).width;
      // line 2 — the tool call
      ctx.strokeStyle = lt;
      ctx.lineWidth = 1;
      drawIcon(ctx, "check", PAD + 22, 112, 46);
      ctx.font = `500 46px ${sans}`;
      ctx.fillStyle = INK_A(0.85);
      ctx.fillText(ACTION, PAD + 64, 128);
      const e2 = PAD + 64 + ctx.measureText(ACTION).width;
      ctx.textAlign = "right";
      ctx.font = `600 44px ${mono}`;
      ctx.fillStyle = INK_A(0.55);
      ctx.fillText("TOOL CALL", w - PAD, 126);
      extents.current = [lx / w, e1 / w, e2 / w];
    },
    [accent, extents],
  );
  return useTextTexture(CW, ANS_H, paint);
}

const revealVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
/** Two-line type-on: line 1 is the top band, line 2 the bottom. A still caret
 *  (no blink) rides the reveal edge while a line is typing. */
const revealFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uCut1;
  uniform float uCut2;
  uniform float uCaret1;
  uniform float uCaret2;
  uniform float uFade;
  uniform vec3 uCaretCol;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    bool top = vUv.y > 0.5;
    float cut = top ? uCut1 : uCut2;
    float caretOn = top ? uCaret1 : uCaret2;
    float shown = 1.0 - smoothstep(cut - 0.004, cut, vUv.x);
    float band = top ? step(0.53, vUv.y) * step(vUv.y, 0.9) : step(0.12, vUv.y) * step(vUv.y, 0.46);
    float caret = caretOn * band * step(cut, vUv.x) * step(vUv.x, cut + 0.012);
    vec3 col = mix(t.rgb, uCaretCol, caret);
    float a = max(t.a * shown, caret * 0.9) * uFade;
    gl_FragColor = vec4(col, a);
  }`;

/** Type-on timeline (s): wait, type line 1, pause, type line 2, hold, fade. */
const T_WAIT = 0.8;
const T_GAP = 0.5;
const T_HOLD = 11;
const T_FADE = 1.2;
const T_REST = 0.8;
/** Reveal rate in strip-width units per second (≈ 16 glyphs/s at 48px). */
const RATE = 0.36;

function AnswerOverlay({ accent, animate }: { accent: string; animate: boolean }) {
  const extents = useRef<[number, number, number]>([0.2, 0.95, 0.6]);
  const tex = useAnswerTexture(accent, extents);
  const clock = useRef(0);
  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uCut1: { value: 1 },
        uCut2: { value: 1 },
        uCaret1: { value: 0 },
        uCaret2: { value: 0 },
        uFade: { value: 1 },
        uCaretCol: { value: lightTint(accent, 0.3) },
      },
      vertexShader: revealVert,
      fragmentShader: revealFrag,
      transparent: true,
      depthWrite: false,
    });
    m.toneMapped = false;
    return m;
  }, [tex, accent]);
  useDeferredDispose(mat);

  useFrame((_, rawDt) => {
    const u = mat.uniforms;
    if (!animate) {
      u.uCut1.value = 1;
      u.uCut2.value = 1;
      u.uCaret1.value = 0;
      u.uCaret2.value = 0;
      u.uFade.value = 1;
      return;
    }
    clock.current += Math.min(rawDt, 1 / 30);
    const [x0, e1, e2] = extents.current;
    const d1 = (e1 - x0) / RATE;
    const d2 = e2 / RATE;
    const cycle = T_WAIT + d1 + T_GAP + d2 + T_HOLD + T_FADE + T_REST;
    const t = clock.current % cycle;
    const t1 = t - T_WAIT;
    const t2 = t1 - d1 - T_GAP;
    // line 1: the label is shown from the start; its text types on
    u.uCut1.value = t1 < 0 ? x0 : Math.min(e1 + 0.01, x0 + t1 * RATE);
    u.uCaret1.value = t1 >= 0 && t1 < d1 ? 1 : 0;
    u.uCut2.value = t2 < 0 ? 0 : Math.min(1, t2 * RATE);
    u.uCaret2.value = t2 >= 0 && t2 < d2 ? 1 : 0;
    const tf = t2 - d2 - T_HOLD;
    // eased fade-out, then a short rest before the next query cycle
    u.uFade.value = tf < 0 ? 1 : tf < T_FADE ? 0.5 + 0.5 * Math.cos((tf / T_FADE) * Math.PI) : 0;
  });

  const h = (RECALL_W * ANS_H) / CW;
  const y = RECALL_H / 2 - ((ANS_Y0 + ANS_H / 2) / CH) * RECALL_H;
  return (
    <mesh position={[0, y, 0.003]} material={mat} renderOrder={3}>
      <planeGeometry args={[RECALL_W, h]} />
    </mesh>
  );
}

/** Display + bezel, hung from the ceiling on two drop rods. Rendered in its
 *  own local frame (screen faces +z); `drop` = distance from the display's
 *  centre up to the ceiling. */
export default function RecallDisplay({ accent, animate, drop }: { accent: string; animate: boolean; drop: number }) {
  const paint = useRecallPainter(accent);
  const mats = useMemo(
    () => ({
      bezel: MATERIALS.paint({ color: NEUTRAL.hull }),
      back: MATERIALS.paint({ color: NEUTRAL.hullShadow }),
      rod: MATERIALS.polished(),
      plate: MATERIALS.steel(),
    }),
    [],
  );
  useDeferredDispose(mats);

  const bw = RECALL_W + 0.08;
  const bh = RECALL_H + 0.08;
  const rodLen = drop - bh / 2;
  return (
    <group>
      {/* bezel shell + rear housing */}
      <mesh position={[0, 0, -0.03]} material={mats.bezel}>
        <boxGeometry args={[bw, bh, 0.05]} />
      </mesh>
      <mesh position={[0, 0.02, -0.08]} material={mats.back}>
        <boxGeometry args={[bw - 0.3, bh - 0.3, 0.06]} />
      </mesh>
      <Board w={RECALL_W} h={RECALL_H} res={CW} paint={paint} accent={accent} slab={false} position={[0, 0, 0.001]} />
      <AnswerOverlay accent={accent} animate={animate} />

      {/* drop rods to the ceiling, with clevis blocks + ceiling plates */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * RECALL_W * 0.32, 0, -0.04]}>
          <mesh position={[0, bh / 2 + 0.03, 0]} material={mats.plate}>
            <boxGeometry args={[0.07, 0.06, 0.05]} />
          </mesh>
          <mesh position={[0, bh / 2 + rodLen / 2, 0]} material={mats.rod}>
            <cylinderGeometry args={[0.012, 0.012, rodLen, 12]} />
          </mesh>
          <mesh position={[0, drop - 0.012, 0]} material={mats.plate}>
            <cylinderGeometry args={[0.06, 0.06, 0.024, 24]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
