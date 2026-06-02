"use client";

import {
  EffectComposer,
  Bloom,
  Noise,
  Vignette,
  ChromaticAberration,
  SMAA,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type JSX } from "react";
import * as THREE from "three";
import { scrollRefs } from "@/lib/scrollStore";
import { damp } from "@/lib/math";

type EffectsProps = {
  /** Lighter pass on mobile (cheaper bloom, no grain). */
  mobile?: boolean;
};

/** Minimal shape of the underlying ChromaticAberrationEffect we mutate. */
type CAHandle = { offset: THREE.Vector2 };

/**
 * Post-processing stack — the signature look.
 *  - Bloom turns emissive accents into glow.
 *  - ChromaticAberration offset scales with |scroll velocity| for a fast-scroll
 *    smear (mutated per-frame via the effect ref, no React state).
 *  - Noise adds film grain; Vignette darkens the frame edges.
 *
 * This whole component is unmounted by <Scene> under reduced motion.
 */
export default function Effects({ mobile = false }: EffectsProps) {
  // Ref to the underlying ChromaticAberrationEffect instance (loosely typed by drei).
  const caRef = useRef<CAHandle | null>(null);
  const smear = useRef(0);

  // Stable initial offset vector (effect reads this each frame via its uniform).
  const caOffset = useMemo(() => new THREE.Vector2(0.0006, 0.0004), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const target = Math.min(Math.abs(scrollRefs.velocity) * 0.0009, 0.006);
    smear.current = damp(smear.current, target, 6, dt);

    const eff = caRef.current;
    if (eff && eff.offset) {
      // Asymmetric so the smear has a directional, lens-like quality.
      eff.offset.set(0.0006 + smear.current, 0.0004 + smear.current * 0.6);
    }
  });

  // Build the pass list explicitly so the children type stays JSX.Element[].
  const passes: JSX.Element[] = [
    // Edge antialiasing — the canvas runs antialias:false for perf, so without
    // this the screens / thin text alias and "fuzz" at distance.
    <SMAA key="smaa" />,
    <Bloom
      key="bloom"
      intensity={mobile ? 0.7 : 0.95}
      luminanceThreshold={0.55}
      luminanceSmoothing={0.9}
      mipmapBlur
      radius={mobile ? 0.6 : 0.85}
    />,
    <ChromaticAberration
      key="ca"
      ref={caRef}
      blendFunction={BlendFunction.NORMAL}
      offset={caOffset}
      radialModulation
      modulationOffset={0.4}
    />,
  ];

  if (!mobile) {
    passes.push(
      <Noise
        key="noise"
        premultiply
        blendFunction={BlendFunction.OVERLAY}
        opacity={0.045}
      />,
    );
  }

  passes.push(
    <Vignette key="vignette" eskil={false} offset={0.15} darkness={0.95} />,
  );

  return <EffectComposer multisampling={0}>{passes}</EffectComposer>;
}
