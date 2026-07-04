"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";

/**
 * Fully-synthesized ship audio (no files):
 *  - low engine hum: two detuned oscillators → lowpass → slow LFO gain (~-30dB)
 *  - soft beep when the camera locks onto a bay (focusedRoom change)
 *  - filtered-noise airlock hiss on the first scroll
 *
 * The AudioContext is created ONLY inside a user gesture (the SOUND chip click,
 * or — when the stored preference is "on" — the first pointer/key gesture).
 * DEFAULT MUTED; the choice persists to localStorage. Fails silent everywhere.
 */

const LS_KEY = "ship-audio";
const HUM_GAIN = 0.028; // ≈ -31dB

type Graph = {
  ctx: AudioContext;
  master: GainNode;
  hum: GainNode;
};

export function useShipAudio(): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);
  const graphRef = useRef<Graph | null>(null);
  const noiseBufRef = useRef<AudioBuffer | null>(null);
  const hissedRef = useRef(false);

  /** Build the context + engine-hum graph. Gesture-context only. */
  const ensure = useCallback((): Graph | null => {
    if (graphRef.current) return graphRef.current;
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

      graphRef.current = { ctx, master, hum };
      return graphRef.current;
    } catch {
      return null;
    }
  }, []);

  const setEnabled = useCallback(
    (next: boolean) => {
      onRef.current = next;
      setOn(next);
      try {
        localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {}
      const g = next ? ensure() : graphRef.current;
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

  const toggle = useCallback(() => setEnabled(!onRef.current), [setEnabled]);

  /** Soft bay-enter beep. */
  const beep = useCallback(() => {
    const g = graphRef.current;
    if (!g || !onRef.current) return;
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
    const g = graphRef.current;
    if (!g || !onRef.current) return;
    try {
      const ctx = g.ctx;
      if (!noiseBufRef.current) {
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noiseBufRef.current = buf;
      }
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBufRef.current;
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
      if (!onRef.current) setEnabled(true);
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

  // Airlock hiss on the first scroll (self-cancelling rAF poll).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (hissedRef.current) return;
      if (scrollRefs.progress > 0.004) {
        hissedRef.current = true;
        hiss();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hiss]);

  return { on, toggle };
}
