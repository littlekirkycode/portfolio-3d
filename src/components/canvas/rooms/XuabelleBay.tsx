"use client";

import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { BayProps } from "./shared";
import XuabelleRoom from "./XuabelleRoom";
import { BoutiqueMaterials, cyl, useBoutique, useDisposeAll } from "./xuabelle/kit";
import { Bench, ColumnVitrine, CounterCase } from "./xuabelle/furniture";
import { CounterPieces, NeckForm, Riviere, Solitaire } from "./xuabelle/jewels";

/** Xuabelle bay — the complete room composition.
 *  A quiet-luxury boutique for the concept storefront. Left column: the hero
 *  Solitaire in the tallest, brightest vitrine (the room's first read), with
 *  the campaign poster's lacquered display wall set well behind it in the
 *  corner. Front strip, on the mat: the low N°03 counter under the storefront
 *  screen and a velvet try-on bench under the info panel, balancing the two
 *  halves. Right lane: the Rivière on a neck form. */
const COUNTER_RAKE = 0.08;

export default function XuabelleBay({ accent, animate, mobile }: BayProps) {
  return (
    <BoutiqueMaterials accent={accent}>
      <group>
        <XuabelleRoom accent={accent} />

        {/* HERO — N°01 Solitaire on a slow brass turntable. Forward in the
            left column (off the mat, clear of the display wall behind it). */}
        <group position={[-2.98, 0, 1.78]} rotation-y={0.42}>
          <ColumnVitrine h={1.0} w={0.6} gw={0.6} gh={0.74} plaque={0} reeded hero>
            <Turntable />
            <group position={[0, 0.016, 0]}>
              <Sway amp={0.5} period={14} animate={animate}>
                <RingCushion />
                {/* 1.25x: the room's first read — ≈0.4 m tall in a 0.74 case */}
                <group position={[0, 0.056, 0]} scale={1.25}>
                  <Solitaire />
                </group>
              </Sway>
            </group>
          </ColumnVitrine>
        </group>

        {/* N°02 Rivière — slim vitrine in the right lane. It stays here on
            phones too: anything taller than the counter at the portrait
            camera's depth would sit behind the stacked info card. */}
        <group position={[3.38, 0, 1.7]} rotation-y={-0.3}>
          <ColumnVitrine h={0.74} w={0.36} gw={0.38} gh={0.78} plaque={1}>
            {/* form half-width ≈0.154 at this height vs glass 0.19: ≥3.5 cm clear */}
            <group rotation-x={-0.06}>
              <NeckForm height={0.52} />
              <Riviere height={0.52} />
            </group>
          </ColumnVitrine>
        </group>

        {/* N°03 the edit — low counter case (0.58 tall) wholly on the mat
            (mat front edge z≈1.65, counter front face z=1.55), under the
            storefront screen's centre on desktop. On phones it is centred,
            slightly back and 0.9x so its toe clears the bottom HUD. */}
        <group position={mobile ? [0, 0, 1.24] : [-1.0, 0, 1.3]} scale={mobile ? 0.9 : 1}>
          <CounterCase len={1.3} dep={0.5} bodyH={0.25} gh={0.33} rake={COUNTER_RAKE} plaque={2} onMat>
            <CounterPieces rake={COUNTER_RAKE} scale={1.22} />
          </CounterCase>
        </group>

        {/* Try-on bench — on the mat's front line (z 1.11–1.49) right of
            centre, under the info panel (its 0.44 seat projects well below
            the panel's bottom edge). Off-frame on phones, so not mounted. */}
        {!mobile && (
          <group position={[1.35, 0, 1.3]}>
            <Bench len={1.0} dep={0.38} seatH={0.44} onMat />
          </group>
        )}
      </group>
    </BoutiqueMaterials>
  );
}

/** The hero turntable's motion: a slow eased sway either side of facing the
 *  corridor (never edge-on for long, no full spins), 14 s per cycle. Frozen
 *  under reduced motion. */
function Sway({ amp, period, animate, children }: { amp: number; period: number; animate: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!animate || !ref.current) return;
    t.current += Math.min(dt, 1 / 30);
    ref.current.rotation.y = amp * Math.sin((t.current / period) * Math.PI * 2);
  });
  return <group ref={ref}>{children}</group>;
}

/** Brass turntable disc under the hero ring. */
function Turntable() {
  const m = useBoutique();
  const geos = useMemo(() => ({ g: cyl(0.15, 0.155, 0.016, 48, { p: [0, 0.008, 0] }) }), []);
  useDisposeAll(geos);
  return <mesh geometry={geos.g} material={m.brass} />;
}

/** Velvet ring cushion (the band stands in its slit). */
function RingCushion() {
  const m = useBoutique();
  const geos = useMemo(() => ({ g: cyl(0.085, 0.09, 0.075, 40, { p: [0, 0.0375, 0], s: [1, 1, 0.7] }) }), []);
  useDisposeAll(geos);
  return <mesh geometry={geos.g} material={m.velvet} />;
}
