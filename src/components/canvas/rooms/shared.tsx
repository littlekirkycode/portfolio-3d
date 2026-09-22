"use client";

import { type ReactNode } from "react";
import * as THREE from "three";
import { Model } from "../ModelLoader";

/* Helpers shared by the per-room bay files (moved out of RoomProps). */

export const d2r = (deg: number) => (deg * Math.PI) / 180;

export type BayProps = { accent: string; animate: boolean; mobile: boolean };

/** Shared soft radial gradient for the plinth under-glow pucks — one canvas
 *  texture for every showcase in every bay (module cache; client-only, this
 *  file only ever renders inside the ssr:false Canvas). */
let _puckTex: THREE.CanvasTexture | null = null;
export function getPuckTex(): THREE.CanvasTexture {
  if (!_puckTex) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.6, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    _puckTex = new THREE.CanvasTexture(c);
  }
  return _puckTex;
}

/** A display pedestal (height `h`); its child sits on top. With `accent` it
 *  gets the museum-showcase treatment: a thin emissive rim ring just under
 *  the top flare + a soft additive glow puck on the floor around the base —
 *  the bays' "this one's an exhibit" language, no extra lights. */
export function Plinth({
  h = 1.1,
  x = 0,
  z = 0,
  accent,
  children,
}: {
  h?: number;
  x?: number;
  z?: number;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <group position={[x, 0, z]}>
      <Model name="pedestal" height={h} />
      {accent && (
        <>
          <mesh position={[0, h - 0.07, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.27, 0.012, 8, 40]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.15, 1.15]} />
            <meshBasicMaterial
              map={getPuckTex()}
              color={accent}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
      <group position={[0, h + 0.02, 0]}>{children}</group>
    </group>
  );
}
