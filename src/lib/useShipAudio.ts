"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scrollRefs, fxRefs, useScrollStore } from "@/lib/scrollStore";
import { HERO_FADE_START, GATES, cameraXAt } from "@/components/canvas/hallConfig";

/**
 * Fully-synthesized ship audio (no files):
 *  - low engine hum: two detuned oscillators → lowpass → slow LFO gain (~-30dB)
 *  - soft beep when the camera locks onto a bay (focusedRoom change)
 *  - filtered-noise airlock hiss on the first scroll
 *  - low doppler whoosh when the camera passes a bulkhead gate (finding 44)
 *  - playQuip(): two-note 8-bit chirp for the drone's speech bubbles
 *  - playWarpRiser(): DEPART riser that tracks fxRefs.warp, ending in a boom
 *
 * The AudioContext is created ONLY inside a user gesture (the SOUND chip click,
 * or — when the stored preference is "on" — the first pointer/key gesture).
 * DEFAULT MUTED; the choice persists to localStorage. Fails silent everywhere.
 *
 * The graph lives at MODULE scope (single AudioContext) so the exported cue
 * functions can fire from other components — playQuip from the drone's canvas
 * code, playWarpRiser from Contact's DEPART handler — without a second hook
 * instance/context. Cues are silent no-ops until the graph exists AND sound
 * is on; only ensure() (gesture paths in the hook) ever creates the context.
 */

const LS_KEY = "ship-audio";
const HUM_GAIN = 0.028; // ≈ -31dB

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  hum: GainNode;
};

const audio: { graph: Graph | null; on: boolean; noise: AudioBuffer | null } = {
  graph: null,
  on: false,
  noise: null,
};

/** One second of shared white noise (hiss / whoosh / riser / boom source). */
function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!audio.noise) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio.noise = buf;
  }
  return audio.noise;
}

/* ── exported cues (callable from any component, always safe) ────────────── */

/** Two-note 8-bit chirp for the drone's speech bubbles. `escalation` (poke
 *  count) nudges the pitch up so repeated pokes sound increasingly indignant. */
export function playQuip(escalation = 0): void {
  const g = audio.graph;
  if (!g || !audio.on) return;
  try {
    const now = g.ctx.currentTime;
    const base = 480 * Math.pow(1.09, Math.min(Math.max(escalation, 0), 10));
    const notes: [number, number][] = [
      [base, now],
      [base * 1.335, now + 0.085], // up a fourth — a chipper "mm-hm"
    ];
    for (const [freq, at] of notes) {
      const o = g.ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(freq, at);
      const env = g.ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.028, at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      o.connect(env);
      env.connect(g.master);
      o.start(at);
      o.stop(at + 0.1);
    }
  } catch {}
}

/** Filtered-noise slam + sub-sine drop — the warp flash. Riser-internal. */
function playBoom(): void {
  const g = audio.graph;
  if (!g || !audio.on) return;
  try {
    const ctx = g.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, now);
    lp.frequency.exponentialRampToValueAtTime(60, now + 0.9);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.32, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    src.connect(lp);
    lp.connect(env);
    env.connect(g.master);
    src.start(now);
    src.stop(now + 1.4);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(36, now + 0.7);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0.14, now);
    subEnv.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    sub.connect(subEnv);
    subEnv.connect(g.master);
    sub.start(now);
    sub.stop(now + 1.1);
  } catch {}
}

let riserActive = false;

/** DEPART warp riser (finding 44): sawtooth + looped noise through a lowpass
 *  whose frequency/gain TRACK fxRefs.warp (Contact ramps it 0→1 over ~900ms)
 *  in a short rAF loop, ending in the boom at the white flash. Call from the
 *  DEPART handler; self-cleans if the ramp is aborted or sound is muted. */
export function playWarpRiser(): void {
  const g = audio.graph;
  if (!g || !audio.on || riserActive) return;
  try {
    riserActive = true;
    const ctx = g.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 160;
    lp.Q.value = 1.1;
    const env = ctx.createGain();
    env.gain.value = 0;
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = 46;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    saw.connect(lp);
    noise.connect(lp);
    lp.connect(env);
    env.connect(g.master);
    saw.start();
    noise.start();

    const started = performance.now();
    const stop = (boom: boolean) => {
      riserActive = false;
      try {
        const now = ctx.currentTime;
        env.gain.cancelScheduledValues(now);
        env.gain.setValueAtTime(env.gain.value, now);
        env.gain.linearRampToValueAtTime(0, now + (boom ? 0.05 : 0.25));
        saw.stop(now + 0.3);
        noise.stop(now + 0.3);
      } catch {}
      if (boom) playBoom();
    };
    const tick = () => {
      if (!audio.on) return stop(false); // muted mid-ramp → fade, no boom
      const w = Math.max(0, Math.min(1, fxRefs.warp));
      const now = ctx.currentTime;
      lp.frequency.setTargetAtTime(160 + w * w * 3600, now, 0.03);
      env.gain.setTargetAtTime(w * 0.12, now, 0.05);
      saw.frequency.setTargetAtTime(46 + w * 68, now, 0.05);
      if (w >= 0.999) return stop(true); // flash frame — the boom
      // Contact zeroes warp on unmount/abort; hard timeout as a backstop.
      const elapsed = performance.now() - started;
      if (elapsed > 4000 || (elapsed > 400 && w === 0)) return stop(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch {
    riserActive = false;
  }
}

/** Low doppler-ish noise pass — the camera crossing a bulkhead gate. */
function playGateWhoosh(): void {
  const g = audio.graph;
  if (!g || !audio.on) return;
  try {
    const ctx = g.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.playbackRate.setValueAtTime(1.2, now);
    src.playbackRate.exponentialRampToValueAtTime(0.65, now + 0.6); // doppler drop
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(340, now);
    bp.frequency.exponentialRampToValueAtTime(120, now + 0.6);
    bp.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.085, now + 0.16);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    src.connect(bp);
    bp.connect(env);
    env.connect(g.master);
    src.start(now);
    src.stop(now + 0.75);
  } catch {}
}

/* ── the hook (single instance, mounted by HudReadout) ───────────────────── */

export function useShipAudio(): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(false);
  const hissedRef = useRef(false);

  /** Build the context + engine-hum graph. Gesture-context only. */
  const ensure = useCallback((): Graph | null => {
    if (audio.graph) return audio.graph;
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      // engine hum: detuned sine + triangle → lowpass → gain breathed by an LFO
      const hum = ctx.createGain();
      hum.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 140;
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = 44;
      const o2 = ctx.createOscillator();
      o2.type = "triangle";
      o2.frequency.value = 44 * 1.017;
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(hum);
      hum.connect(master);
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.13;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.008;
      lfo.connect(lfoG);
      lfoG.connect(hum.gain);
      o1.start();
      o2.start();
      lfo.start();

      audio.graph = { ctx, master, hum };
      return audio.graph;
    } catch {
      return null;
    }
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => {
      audio.on = next;
      setOn(next);
      try {
        localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {}
      const g = next ? ensure() : audio.graph;
      if (!g) return;
      try {
        const now = g.ctx.currentTime;
        g.hum.gain.cancelScheduledValues(now);
        if (next) {
          g.ctx.resume().catch(() => {});
          g.hum.gain.setValueAtTime(g.hum.gain.value, now);
          g.hum.gain.linearRampToValueAtTime(HUM_GAIN, now + 1.2);
        } else {
          g.hum.gain.setValueAtTime(g.hum.gain.value, now);
          g.hum.gain.linearRampToValueAtTime(0, now + 0.35);
        }
      } catch {}
    },
    [ensure],
  );

  const toggle = useCallback(() => setEnabled(!audio.on), [setEnabled]);

  /** Soft bay-enter beep. */
  const beep = useCallback(() => {
    const g = audio.graph;
    if (!g || !audio.on) return;
    try {
      const now = g.ctx.currentTime;
      const o = g.ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(880, now + 0.07);
      const env = g.ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.05, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o.connect(env);
      env.connect(g.master);
      o.start(now);
      o.stop(now + 0.25);
    } catch {}
  }, []);

  /** Airlock hiss: a filtered noise burst. */
  const hiss = useCallback(() => {
    const g = audio.graph;
    if (!g || !audio.on) return;
    try {
      const ctx = g.ctx;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 0.6;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.09, now + 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      src.connect(bp);
      bp.connect(env);
      env.connect(g.master);
      src.start(now);
      src.stop(now + 1);
    } catch {}
  }, []);

  // Restore the stored preference — but only arm the context on a real gesture.
  useEffect(() => {
    let stored = "0";
    try {
      stored = localStorage.getItem(LS_KEY) ?? "0";
    } catch {}
    if (stored !== "1") return;
    const arm = () => {
      if (!audio.on) setEnabled(true);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
    window.addEventListener("pointerdown", arm, { passive: true });
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, [setEnabled]);

  // Bay-enter beep — coarse store change, never per-frame.
  useEffect(() => {
    const unsub = useScrollStore.subscribe((s, prev) => {
      if (s.focusedRoom !== prev.focusedRoom && s.focusedRoom) beep();
    });
    return unsub;
  }, [beep]);

  // Corridor cue poll — ONE rAF for the position-derived cues: the airlock
  // hiss on the first scroll plus the two bulkhead-gate whooshes (finding 44).
  // This extends the original self-cancelling hiss poll rather than adding a
  // per-frame store subscription (frame-data contract). Under reduced motion
  // the camera parks at p=0.05 (Rig), so gate whooshes are skipped there.
  useEffect(() => {
    let raf = 0;
    let prevX = cameraXAt(scrollRefs.progress);
    const lastWhooshAt = GATES.map(() => -Infinity);
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (nowMs: number) => {
      raf = requestAnimationFrame(tick);
      if (!hissedRef.current && scrollRefs.progress > HERO_FADE_START) {
        hissedRef.current = true;
        hiss();
      }
      const x = cameraXAt(scrollRefs.progress);
      const dx = x - prevX;
      // |dx| gate: the DEPART snap teleports the camera back across both
      // gates in one frame — that's a jump cut, not a fly-through.
      if (!reduced && Math.abs(dx) < 6) {
        for (let i = 0; i < GATES.length; i++) {
          const gx = GATES[i].x;
          const crossed = (prevX - gx) * (x - gx) < 0; // sign flip = through
          if (crossed && nowMs - lastWhooshAt[i] > 1200) {
            lastWhooshAt[i] = nowMs;
            playGateWhoosh();
          }
        }
      }
      prevX = x;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hiss]);

  return { on, toggle };
}
