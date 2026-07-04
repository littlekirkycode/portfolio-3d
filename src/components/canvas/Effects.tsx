"use client";

import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  HueSaturation,
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
  // Base offset kept sub-pixel-ish: the previous 0.0006 base fringed every
  // hard edge red/cyan even at rest (QA: whole-frame fringing).
  const caOffset = useMemo(() => new THREE.Vector2(0.00025, 0.00015), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const target = Math.min(Math.abs(scrollRefs.velocity) * 0.0005, 0.0035);
    smear.current = damp(smear.current, target, 6, dt);

    const eff = caRef.current;
    if (eff && eff.offset) {
      // Asymmetric so the smear has a directional, lens-like quality.
      eff.offset.set(0.00025 + smear.current, 0.00015 + smear.current * 0.6);
    }
  });

  // Build the pass list explicitly so the children type stays JSX.Element[].
  const passes: JSX.Element[] = [
    // Edge antialiasing — the canvas runs antialias:false for perf, so without
    // this the screens / thin text alias and "fuzz" at distance.
    <SMAA key="smaa" />,
    <Bloom
      key="bloom"
      intensity={mobile ? 0.55 : 0.8}
      // Bloom samples the ACES-tonemapped buffer, so 0.5 caught every lit
      // white surface (kit walls, gates, props) and clipped them to flat #FFF
      // (QA: scene-wide blowout). 0.78 restricts glow to genuine emitters
      // (toneMapped:false screens/rims land near/above 1 post-map).
      luminanceThreshold={0.78}
      luminanceSmoothing={0.6}
      mipmapBlur
      radius={mobile ? 0.6 : 0.85}
    />,
    // Grade — the colourist pass. Runs AFTER bloom so halos get contrast-
    // shaped too: blacks pushed down, mids gently steepened, chroma nudged up
    // so the warm-vs-cool accent contrast registers. Contrast kept modest —
    // +0.14 was clipping highlights and banding the dark wall gradients.
    // ORDER MATTERS: HueSaturation must run BEFORE BrightnessContrast. The
    // -0.02 brightness pushes near-black buffer values NEGATIVE, and
    // HueSaturation's colour math NaNs on negatives — the NaNs render as
    // SOLID WHITE BLOBS over dark screen content (QA: showreel screenshots;
    // empirically bisected pass-by-pass, July 2026).
    <HueSaturation key="grade-hs" saturation={0.07} />,
    <BrightnessContrast key="grade-bc" brightness={-0.02} contrast={0.07} />,
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
      // Grain kept faint — OVERLAY amplifies on bright regions, and at 0.045
      // it read as black-speckle "dither corruption" on phone screens and
      // white props (QA slot0/slot1).
      <Noise
        key="noise"
        premultiply
        blendFunction={BlendFunction.OVERLAY}
        opacity={0.018}
      />,
    );
  }

  passes.push(
    <Vignette key="vignette" eskil={false} offset={0.15} darkness={0.95} />,
  );

  return <EffectComposer multisampling={0}>{passes}</EffectComposer>;
}
