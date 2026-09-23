"use client";

import { useContext, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { damp } from "@/lib/math";
import { playPoke } from "@/lib/useShipAudio";
import { ARRIVAL, BayIndex } from "./arrival";

/* ── hands-on exhibits ───────────────────────────────────────────────────────
 * Wrap a bay's centrepiece to make it pokeable: hover lifts it a touch
 * (pointer cursor + the custom cursor's world-hover state), click makes it
 * hop and, if `spin`, turn a full revolution — with a little blip. Only live
 * once the visitor is actually at that bay (arrival > 0.3), so a click while
 * scrolling past never fires. Spins about the wrapper's own origin — mount it
 * where that origin is the object's centre on its footprint.
 * ──────────────────────────────────────────────────────────────────────── */

function setWorldHover(v: boolean) {
  window.dispatchEvent(new CustomEvent("world-hover", { detail: v }));
}

const POKE_S = 1.0;

export default function Pokeable({
  spin = true,
  hop = 0.12,
  onPoke,
  children,
}: {
  spin?: boolean;
  hop?: number;
  onPoke?: () => void;
  children: ReactNode;
}) {
  const idx = useContext(BayIndex);
  const g = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const k = useRef(0);
  const t = useRef(-1);
  const n = useRef(0);
  const live = () => idx >= 0 && ARRIVAL[idx] > 0.3;

  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!live()) return;
    e.stopPropagation();
    if (hovered.current) return;
    hovered.current = true;
    document.body.style.cursor = "pointer";
    setWorldHover(true);
  };
  const out = () => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = "";
    setWorldHover(false);
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!live()) return;
    e.stopPropagation();
    if (t.current >= 0) return; // let the current poke finish
    t.current = 0;
    playPoke(n.current++);
    onPoke?.();
  };

  useFrame((_, rawDt) => {
    const grp = g.current;
    if (!grp) return;
    const dt = Math.min(rawDt, 1 / 30);
    if (hovered.current && !live()) out();
    k.current = damp(k.current, hovered.current ? 1 : 0, 10, dt);
    let y = 0.035 * k.current;
    let ry = 0;
    if (t.current >= 0) {
      t.current += dt;
      const u = Math.min(1, t.current / POKE_S);
      y += Math.sin(Math.PI * Math.min(1, u * 1.6)) * hop;
      if (spin) ry = (u * u * (3 - 2 * u)) * Math.PI * 2;
      if (u >= 1) t.current = -1;
    }
    grp.position.y = y;
    grp.rotation.y = ry;
  });

  return (
    <group ref={g} onPointerOver={over} onPointerMove={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  );
}

/** Hover-cursor + click target with no motion (e.g. a bay's hero screen
 *  opening its dossier). Same arrival gate as Pokeable. */
export function ClickTarget({ onActivate, children }: { onActivate: () => void; children: ReactNode }) {
  const idx = useContext(BayIndex);
  const hovered = useRef(false);
  const live = () => idx >= 0 && ARRIVAL[idx] > 0.3;
  const out = () => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = "";
    setWorldHover(false);
  };
  return (
    <group
      onPointerOver={(e) => {
        if (!live()) return;
        e.stopPropagation();
        if (hovered.current) return;
        hovered.current = true;
        document.body.style.cursor = "pointer";
        setWorldHover(true);
      }}
      onPointerOut={out}
      onClick={(e) => {
        if (!live()) return;
        e.stopPropagation();
        onActivate();
      }}
    >
      {children}
    </group>
  );
}
