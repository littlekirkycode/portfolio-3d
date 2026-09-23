"use client";

import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  HueSaturation,
  Vignette,
  SMAA,
} from "@react-three/postprocessing";
import {
  BlendFunction,
  ChromaticAberrationEffect,
  Effect,
  EffectAttribute,
  NoiseEffect,
} from "postprocessing";
import type { EffectComposer as EffectComposerImpl } from "postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
// NOTE: never pass `ref` to the wrapEffect-wrapped effects (ChromaticAberration
// etc). React 19 delivers `ref` as a PLAIN PROP to function components, and
// @react-three/postprocessing's wrapEffect JSON.stringify()s its rest props as
// a memo dep — once the ref is populated with the effect instance the
// stringify walks circular R3F internals and THROWS, and SceneErrorBoundary
// tears down the whole 3D layer. Any re-render of a mounted effect trips it
// (a dpr decline, the R0 shell-ready flip). Per-frame mutation goes through
// the stable `caOffset` vector instead — the effect's offset uniform holds
// that exact Vector2 by reference.
import * as THREE from "three";
import { scrollRefs } from "@/lib/scrollStore";
import { damp } from "@/lib/math";
import { registerComposer } from "@/lib/capture";
import type { GfxQuality } from "@/lib/quality";

/* ── HDR guard — the white-flash fix ────────────────────────────────────────
 * ROOT CAUSE of the "random white flashes": the scene renders into a
 * half-float buffer with NO tone mapping (r3f/postprocessing forces
 * NoToneMapping on the renderer while the composer is mounted). A glossy
 * surface (three only clamps roughness to 0.0525 → GGX peak ~4e4; Scene's
 * sanitizeMaterials now lifts every standard material to ≥ 0.12) catching a bay
 * spot/point light at the exact mirror angle can exceed half-float max
 * (65504) → +Inf, and any degenerate normal yields NaN. ONE such pixel is
 * enough: Bloom's mipmap blur carries it down to the 1/256 mip, where it owns
 * the whole level, and the upsample chain paints Inf/NaN over the ENTIRE
 * frame; HueSaturation's `min(color, 1.0)` then resolves Inf (and, on D3D,
 * NaN) to 1.0 → a full-screen white frame under the vignette. Finite but
 * extreme fireflies (the trap measured 34+ on glossy props) cause the smaller
 * version: a bloom puff for a frame as a rotating prop sweeps the angle.
 *
 * This pass runs FIRST (before SMAA, which would also smear a bad pixel) and:
 *   - replaces non-finite channels (exponent bits all set) with 0 — a bit
 *     test, not isnan()/isinf(), which some ANGLE/HLSL paths fold away;
 *   - clamps negatives to 0;
 *   - bounds HDR to FIREFLY_MAX with a hue-preserving scale. Authored
 *     emitters peak ~3.5 (HDR census across the corridor), so only
 *     specular spikes are touched (they still glint, but can't burst).
 * CONVOLUTION attribute keeps it in its own EffectPass: effects merged into
 * one pass all read that pass's raw inputBuffer (Bloom included), so the
 * guard must be a separate pass to protect everything after it. SRC blend
 * so the NaN input is not mixed back in (mix(NaN, x, 1.0) is NaN). */
// Authored emitters top out ~3.5 (GLOW.hot = 2, diffusers ~1.9, warp stars
// ~2.9); polished gold / glass glints measured 70–200. 5 leaves headroom.
const FIREFLY_MAX = 3.6; // authored emitters peak ~3.5: speculars glint but never puff the bloom
const HDR_GUARD_FRAG = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  uvec3 bits = floatBitsToUint(c) & 0x7fffffffu;
  bvec3 bad = greaterThanEqual(bits, uvec3(0x7f800000u));
  c = vec3(bad.x ? 0.0 : c.x, bad.y ? 0.0 : c.y, bad.z ? 0.0 : c.z);
  c = max(c, vec3(0.0));
  float peak = max(max(c.r, c.g), c.b);
  c *= min(1.0, ${FIREFLY_MAX.toFixed(1)} / max(peak, 1e-4));
  outputColor = vec4(c, 1.0);
}`;
class HdrGuardEffect extends Effect {
  constructor() {
    super("HdrGuardEffect", HDR_GUARD_FRAG, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.SRC,
    });
  }
}

type EffectsProps = {
  /** Lighter chain on mobile: cheaper bloom, no grain, no chromatic
   *  aberration, and SMAA shed once dpr climbs past 1.75. */
  mobile?: boolean;
  /** "lite" (finding 46) strips the chain to Bloom + Vignette — the signature
   *  glow stays, everything else goes. Set automatically when Performance-
   *  Monitor declines at the DPR floor, or manually via the GFX chip.
   *  Swapping the pass set does NOT recompile scene materials — safe live. */
  quality?: GfxQuality;
};

/**
 * Post-processing stack — the signature look.
 *  - Bloom turns emissive accents into glow.
 *  - ChromaticAberration offset scales with |scroll velocity| for a fast-scroll
 *    smear (mutated per-frame via the effect ref, no React state).
 *  - Noise adds film grain; Vignette darkens the frame edges.
 *
 * This whole component is unmounted by <Scene> under reduced motion.
 */
/** Film-grain strength (OVERLAY) at full high-tier weight. */
const GRAIN_OPACITY = 0.018;
/** High↔Lite cross-fade of the tier-only passes (CA + grain), seconds. */
const TIER_FADE_S = 0.45;

export default function Effects({ mobile = false, quality = "high" }: EffectsProps) {
  const lite = quality === "lite";
  // The pass set actually mounted lags a High→Lite request until the
  // tier-only passes have faded out (and mounts them at zero weight on
  // Lite→High, then fades in): a GFX-chip toggle or the auto-lite
  // escalation used to drop SMAA + CA + grain in one frame — a visible
  // frame pop. SMAA can't be faded, so it swaps at the END of the fade-out
  // (when CA/grain are already at 0) — the smallest remaining step.
  const [chainLite, setChainLite] = useState(lite);
  const [prevLite, setPrevLite] = useState(lite);
  if (lite !== prevLite) {
    // derived during render (no effect cascade): Lite→High mounts at once
    // (fades in from 0); phones carry no CA/grain, so they swap at once too
    setPrevLite(lite);
    if (!lite || mobile) setChainLite(lite);
  }
  const tierFx = useRef(lite || mobile ? 0 : 1);
  // Phones shed SMAA once PerformanceMonitor has climbed the buffer past
  // dpr 1.75. Selected as a BOOLEAN: every Effects re-render hands the
  // composer a new children array, which tears down and rebuilds every
  // EffectPass (fresh fullscreen shaders → a compile hitch). Subscribing to
  // the raw dpr rebuilt the chain on every PerformanceMonitor step, desktop
  // included; now it only happens when the SMAA decision actually flips.
  const denseMobile = useThree((s) => mobile && s.viewport.dpr >= 1.75);
  const smear = useRef(0);
  // Photo mode (finding 47): register the live composer so captures render
  // through the post chain. React calls the callback with null on unmount.
  const composerRef = useCallback(
    (c: EffectComposerImpl | null) => registerComposer(c),
    [],
  );

  // Stable offset vector — the ChromaticAberrationEffect's offset uniform
  // holds this exact instance by reference, so mutating it per frame drives
  // the shader with no React involvement (and no `ref` on the wrapped
  // component — see the wrapEffect note at the imports). Base offset kept
  // sub-pixel-ish: the previous 0.0006 base fringed every hard edge red/cyan
  // even at rest (QA: whole-frame fringing).
  const caOffset = useMemo(() => new THREE.Vector2(0.00025, 0.00015), []);

  // Tier-only effects as owned instances (primitive) so their blend opacity
  // can be driven per frame — the wrapEffect components rebuild on any prop
  // change and must never take a ref (see the note at the imports).
  const ca = useMemo(() => {
    const e = new ChromaticAberrationEffect({
      offset: caOffset,
      radialModulation: true,
      modulationOffset: 0.4,
    });
    e.blendMode.blendFunction = BlendFunction.NORMAL;
    return e;
  }, [caOffset]);
  const noise = useMemo(
    () => new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true }),
    [],
  );
  useEffect(
    () => () => {
      ca.dispose();
      noise.dispose();
    },
    [ca, noise],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    // Capped lower and eased slower (was 0.0035 @ rate 6, then 0.0024 @ 3.5):
    // a flick used to snap the whole frame into red/cyan fringes. At 0.0024
    // the walk probes still showed ~3 px colour-split ghosts on every lit
    // sign and screen edge mid-travel — read as a glitch, not a lens. Now a
    // ≤ ~1.5 px hint that eases in/out over ~0.5 s.
    const target = Math.min(Math.abs(scrollRefs.velocity) * 0.00022, 0.0011);
    smear.current = damp(smear.current, target, 3, dt);
    // Asymmetric so the smear has a directional, lens-like quality.
    caOffset.set(0.00025 + smear.current, 0.00015 + smear.current * 0.6);

    // tier cross-fade (wall-clock dt, capped so a hitch can't jump it)
    const want = !lite && !mobile ? 1 : 0;
    const step = Math.min(rawDt, 1 / 20) / TIER_FADE_S;
    tierFx.current = want > tierFx.current
      ? Math.min(want, tierFx.current + step)
      : Math.max(want, tierFx.current - step);
    const k = tierFx.current * tierFx.current * (3 - 2 * tierFx.current);
    ca.blendMode.opacity.value = k;
    noise.blendMode.opacity.value = GRAIN_OPACITY * k;
    if (lite && !chainLite && tierFx.current <= 0) setChainLite(true);
  });

  // One guard instance for the composer's life (primitive — never re-created
  // on the quality/dpr re-renders).
  const guard = useMemo(() => new HdrGuardEffect(), []);
  useEffect(() => () => guard.dispose(), [guard]);

  // Build the pass list explicitly so the children type stays JSX.Element[].
  // The guard is ALWAYS first, on every tier (see HdrGuardEffect).
  const passes: JSX.Element[] = [<primitive key="hdr-guard" object={guard} />];

  // Edge antialiasing — the canvas runs antialias:false for perf, so without
  // this the screens / thin text alias and "fuzz" at distance. On mobile at
  // dpr ≥ 1.75 (≈3x+ downsampled physical pixels) its edge cleanup is barely
  // visible while still costing a full-screen multi-target pass — shed it
  // once PerformanceMonitor has climbed the buffer that dense (finding 5).
  if (!chainLite && !denseMobile) {
    passes.push(<SMAA key="smaa" />);
  }

  passes.push(
    <Bloom
      key="bloom"
      intensity={mobile ? 0.55 : 0.8}
      // Bloom samples the LINEAR, un-tonemapped scene buffer (the composer
      // forces NoToneMapping), so 0.5 caught every lit white surface (kit
      // walls, gates, props) and clipped them to flat #FFF (QA: scene-wide
      // blowout). 0.78 restricts glow to genuine emitters (toneMapped:false
      // screens/rims sit near/above 1). Input is HDR-guarded (see top).
      luminanceThreshold={0.78}
      luminanceSmoothing={0.6}
      mipmapBlur
      radius={mobile ? 0.6 : 0.85}
    />,
  );

  {
    passes.push(
      // Grade — the colourist pass. Kept on the LITE tier too: HS + BC merge
      // into the Bloom EffectPass (no extra pass, ~free), and dropping them
      // made the auto-lite swap a visible global colour/contrast jump. Runs AFTER bloom so halos get contrast-
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
    );
  }

  if (!mobile && !chainLite) {
    passes.push(
      // Velocity smear — desktop only (finding 5): under native touch scroll
      // the smear practically never triggers, and the resting base offset is
      // sub-pixel, so on phones the pass costs a full-screen resolve for no
      // visible payoff. Weight driven by the tier cross-fade (useFrame).
      <primitive key="ca" object={ca} dispose={null} />,
      // Grain kept faint — OVERLAY amplifies on bright regions, and at 0.045
      // it read as black-speckle "dither corruption" on phone screens and
      // white props (QA slot0/slot1). Opacity = GRAIN_OPACITY × tier fade.
      <primitive key="noise" object={noise} dispose={null} />,
    );
  }

  passes.push(
    <Vignette key="vignette" eskil={false} offset={0.15} darkness={0.95} />,
  );

  return (
    <EffectComposer ref={composerRef} multisampling={0}>
      {passes}
    </EffectComposer>
  );
}
