"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { PROJECTS } from "@/lib/constants";
import { screenVertex, screenFragment } from "./shaders";
import { FEATURE_X, HALF_W, FEATURE_RECESS_DEPTH } from "./hallConfig";
import { withBase } from "@/lib/asset";

const INK = "#f4f1ea";

function familyVar(v: string, fb: string): string {
  if (typeof window === "undefined") return fb;
  const s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return s ? `${s}, ${fb}` : fb;
}
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** Word-wrap fillText; returns the y just below the last drawn line. */
function wrap(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, maxW: number, lh: number): number {
  let line = "";
  for (const word of t.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

const FW = 4.8; // 16:9 feature panel (sized to fit the FOV head-on from across the hall)
const FH = 2.7;
const BAR_H = 0.24; // letterbox bars — slide art keeps y ∈ [~90, ~810] of the 900px canvas clear
const HOLD = 6; // seconds each slide dwells (long enough to read from the camera dwell)
const WIPE = 0.4; // filmstrip-wipe duration — short + clean, no mid-dissolve mush

/** Damp rate for the slide-accent tint chase (light + glow quads + rim). */
const TINT_RATE = 3.2;

/**
 * Wide cinematic SHOWREEL screen near the corridor entrance — the big "movie
 * screen" you glide past before the first bay, now recessed into its own wall
 * niche (FEATURE_RECESS_DEPTH). Every project gets a designed full-bleed frame
 * (title block + description + chips on the left, device screenshot or a giant
 * index numeral on an accent panel on the right, slide dots along the bottom)
 * rendered to a CanvasTexture — with baked scanlines / grain / vignette — and
 * fed through the existing CRT screen shader with a clean slide-wipe between
 * frames. The fixture THROWS light: a gunmetal casing with a thin breathing
 * accent rim, an emissive backwash behind the housing, and a per-slide accent
 * that damp-lerps a front pointLight + a floor glow pool + a wall wash, so
 * every slide change visibly repaints the lobby.
 */
export default function FeatureScreen() {
  const withImg = useMemo(() => PROJECTS.filter((p) => p.image), []);
  const urls = useMemo(() => withImg.map((p) => withBase(p.image as string)), [withImg]);
  const texs = useTexture(urls);

  const frameBundle = useMemo(() => {
    const list = Array.isArray(texs) ? texs : [texs];
    const imgByUrl: Record<string, HTMLImageElement> = {};
    withImg.forEach((p, i) => {
      imgByUrl[p.image as string] = list[i].image as HTMLImageElement;
    });
    const ser = familyVar("--ff-display", "Georgia, serif");
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const sans = familyVar("--ff-body", "system-ui, sans-serif");
    // The painter is idempotent (full-canvas fill first) so the fonts.ready
    // effect below can re-run it over the same canvases once webfonts land.
    const paint = (ctx: CanvasRenderingContext2D, p: (typeof PROJECTS)[number], i: number) => {
      const acc = p.accent;

      // lifted base (~1.5 stops over the old near-black) + a diagonal accent
      // wash so no region reads as dead black on the hero camera
      ctx.fillStyle = "#1a1d28";
      ctx.fillRect(0, 0, 1600, 900);
      const wash = ctx.createLinearGradient(0, 0, 1600, 900);
      wash.addColorStop(0, hexA(acc, 0.26));
      wash.addColorStop(0.45, "rgba(26,29,40,0)");
      wash.addColorStop(1, hexA(acc, 0.12));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, 1600, 900);

      // ── header strip ──
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = acc;
      ctx.font = `500 28px ${mono}`;
      ctx.fillText(`NOW SHOWING — ${p.index} / 0${PROJECTS.length}`, 110, 152);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,241,234,0.5)";
      ctx.font = `500 24px ${mono}`;
      ctx.fillText("KIRKHAM·01 — SHOWREEL", 1490, 152);
      ctx.textAlign = "left";
      ctx.strokeStyle = "rgba(244,241,234,0.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(110, 178);
      ctx.lineTo(1490, 178);
      ctx.stroke();

      // ── right: accent panel — screenshot slides mount the device on it,
      //    poster slides get a giant index numeral instead of dead space ──
      const img = p.image ? imgByUrl[p.image] : null;
      const px = 860, py = 110, pw = 630, ph = 670;
      ctx.save();
      roundRect(ctx, px, py, pw, ph, 26);
      ctx.clip();
      ctx.fillStyle = "#151826";
      ctx.fillRect(px, py, pw, ph);
      const pg = ctx.createLinearGradient(px, py, px + pw * 0.7, py + ph);
      pg.addColorStop(0, hexA(acc, 0.92));
      pg.addColorStop(0.6, hexA(acc, 0.48));
      pg.addColorStop(1, "rgba(32,36,52,0.92)");
      ctx.fillStyle = pg;
      ctx.fillRect(px, py, pw, ph);
      // giant decorative index numeral (subdued behind a screenshot)
      ctx.fillStyle = INK;
      ctx.globalAlpha = img ? 0.16 : 0.92;
      ctx.textAlign = "right";
      ctx.font = `700 470px ${ser}`;
      ctx.fillText(p.index, px + pw - 30, py + ph - 44);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      if (!img) {
        ctx.fillStyle = "rgba(244,241,234,0.8)";
        ctx.font = `500 26px ${mono}`;
        ctx.fillText("PROJECT FILE", px + 36, py + 74);
      }
      // corner ticks — small drafting marks so the panel reads designed
      ctx.strokeStyle = "rgba(244,241,234,0.55)";
      ctx.lineWidth = 3;
      const tick = (tx: number, ty: number, dx: number, dy: number) => {
        ctx.beginPath();
        ctx.moveTo(tx + 26 * dx, ty);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx, ty + 26 * dy);
        ctx.stroke();
      };
      tick(px + 28, py + 28, 1, 1);
      tick(px + pw - 28, py + 28, -1, 1);
      tick(px + 28, py + ph - 28, 1, -1);
      tick(px + pw - 28, py + ph - 28, -1, -1);
      ctx.restore();
      ctx.strokeStyle = hexA(acc, 0.8);
      ctx.lineWidth = 3;
      roundRect(ctx, px, py, pw, ph, 26);
      ctx.stroke();

      // device-framed screenshot, cover-cropped to fill the panel height
      if (img && img.width) {
        const dw = 330, dh = 590;
        const dx = px + (pw - dw) / 2;
        const dy = py + (ph - dh) / 2;
        ctx.fillStyle = "#0a0c13";
        roundRect(ctx, dx - 14, dy - 14, dw + 28, dh + 28, 40);
        ctx.fill();
        ctx.save();
        roundRect(ctx, dx, dy, dw, dh, 28);
        ctx.clip();
        const tAR = dw / dh;
        const iAR = img.width / img.height;
        let sw = img.width, sh = img.height, sx = 0;
        if (iAR > tAR) {
          sw = img.height * tAR;
          sx = (img.width - sw) / 2;
        } else sh = img.width / tAR; // top-anchored crop keeps the app header visible
        ctx.drawImage(img, sx, 0, sw, sh, dx, dy, dw, dh);
        // scrim: pulls white app UIs off the bloom threshold. Needs ≥0.18 —
        // at 0.10, pure-white text still landed ~0.90 post-decode (×1.12 uOn
        // ≈ 1.0 > 0.78 threshold) and dense small text bloomed into SOLID
        // WHITE BLOBS over dark screenshots (QA: SelfAware slide).
        ctx.fillStyle = "rgba(10,13,20,0.18)";
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
        ctx.strokeStyle = hexA(acc, 0.9);
        ctx.lineWidth = 4;
        roundRect(ctx, dx - 14, dy - 14, dw + 28, dh + 28, 40);
        ctx.stroke();
      }

      // ── left column: kicker / title / description / chips ──
      const lx = 110, lw = 690;
      ctx.fillStyle = acc;
      ctx.font = `500 30px ${mono}`;
      ctx.fillText(`${p.category.toUpperCase()} · ${p.year}`, lx, 250);
      let ts = 124; // shrink-to-fit the serif title
      ctx.font = `700 ${ts}px ${ser}`;
      while (ctx.measureText(p.title).width > lw && ts > 72) {
        ts -= 6;
        ctx.font = `700 ${ts}px ${ser}`;
      }
      ctx.fillStyle = INK;
      ctx.fillText(p.title, lx - 2, 372);
      ctx.fillStyle = "rgba(244,241,234,0.85)";
      ctx.font = `400 34px ${sans}`;
      const descEnd = wrap(ctx, p.description, lx, 444, lw, 46);

      // chips: traction metrics (accent) first, then the tech stack (neutral) —
      // minus any tech already named inside a metric label (e.g. SelfGrow's
      // "iOS SwiftUI · Offline" metric would otherwise repeat SWIFTUI).
      const metricText = (p.metrics ?? []).map((m) => `${m.value} ${m.label}`.toLowerCase()).join(" ");
      const chips = [
        ...(p.metrics ?? []).map((m) => ({ t: `${m.value} ${m.label.toUpperCase()}`, hot: true })),
        ...p.tech.filter((t) => !metricText.includes(t.toLowerCase())).map((t) => ({ t: t.toUpperCase(), hot: false })),
      ];
      ctx.font = `500 25px ${mono}`;
      let cy = Math.max(descEnd + 18, 596);
      let cx = lx;
      for (const ch of chips) {
        const cw = ctx.measureText(ch.t).width + 48;
        if (cx + cw > lx + lw) {
          cx = lx;
          cy += 62;
        }
        if (cy > 716) break; // never spill under the slide dots / letterbox
        roundRect(ctx, cx, cy, cw, 50, 25);
        if (ch.hot) {
          ctx.fillStyle = hexA(acc, 0.22);
          ctx.fill();
          ctx.strokeStyle = hexA(acc, 0.9);
        } else ctx.strokeStyle = "rgba(244,241,234,0.45)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = ch.hot ? INK : "rgba(244,241,234,0.85)";
        ctx.fillText(ch.t, cx + 24, cy + 34);
        cx += cw + 16;
      }

      // ── slide-progress dots (centred under the text column) ──
      const n = PROJECTS.length;
      const spacing = 44;
      const dx0 = 470 - ((n - 1) * spacing) / 2;
      for (let k = 0; k < n; k++) {
        ctx.beginPath();
        ctx.arc(dx0 + k * spacing, 792, k === i ? 9 : 7, 0, Math.PI * 2);
        if (k === i) {
          ctx.fillStyle = acc;
          ctx.fill();
          ctx.strokeStyle = hexA(acc, 0.5);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(dx0 + k * spacing, 792, 15, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(244,241,234,0.32)";
          ctx.fill();
        }
      }

      // ── baked CRT finish: scanlines → vignette, over everything. NO grain
      //    stamp — per-pixel noise riding near-black slide regions renders as
      //    dense white speckle through the CRT shader + post chain (same
      //    failure as the removed shaders.ts grain term; QA "white spots"). ──
      ctx.fillStyle = "rgba(8,10,16,0.13)";
      for (let sy = 2; sy < 900; sy += 4) ctx.fillRect(0, sy, 1600, 1);
      const vig = ctx.createRadialGradient(800, 450, 480, 800, 450, 1020);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.30)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, 1600, 900);
    };

    const textures = PROJECTS.map((p, i) => {
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = 900;
      paint(c.getContext("2d")!, p, i);
      const tex = new THREE.CanvasTexture(c);
      // IMPORTANT: leave the texture UNTAGGED (NoColorSpace). screenFragment's
      // samp() does its own pow(2.2) decode; tagging this sRGB made three.js
      // decode it a second time (displayed ≈ V^2.2) — midtones crushed to
      // black and peak whites bloomed into unreadable white dither.
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 16;
      return tex;
    });
    return { textures, paint };
  }, [texs, withImg]);
  const frames = frameBundle.textures;

  // Redraw every slide after document.fonts.ready (Walls.tsx pattern, finding
  // 14): on a cold cache with fast JS / slow font path the showreel baked its
  // serif/mono type in the fallback fonts for the whole session.
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (cancelled) return;
        frameBundle.textures.forEach((tex, i) => {
          const ctx = (tex.image as HTMLCanvasElement).getContext("2d");
          if (!ctx) return;
          frameBundle.paint(ctx, PROJECTS[i], i);
          tex.needsUpdate = true;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [frameBundle]);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  const screenRef = useRef<THREE.Group>(null);
  const barRef = useRef<THREE.Group>(null);
  const barMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const tRef = useRef(0);
  const idx = useRef(0);
  const next = useRef(1);
  const nextAt = useRef(HOLD);
  const moving = useRef(false);
  const moveStart = useRef(0);

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTexture: { value: frames[0] },
      uTexNext: { value: frames[1 % frames.length] },
      uTime: { value: 0 },
      uOn: { value: 0.9 }, // shader lifts ×1.12 — 0.9 keeps peak whites ≤1 so bloom doesn't blow the panel at distance
      uCrt: { value: 0.08 }, // baked scanlines carry the CRT feel — keep shader pass light
      uMix: { value: 0 },
      uTrans: { value: 1 }, // filmstrip slide — the dissolve reads as corruption on camera
      uTint: { value: new THREE.Color("#ffffff") },
    }),
    [frames],
  );

  /* ── slide-accent light rig: one dominant colour per slide (project accent),
     damp-lerped so transitions repaint the lobby without popping ── */
  const accentCols = useMemo(() => PROJECTS.map((p) => new THREE.Color(p.accent)), []);
  const tint = useMemo(() => accentCols[0].clone(), [accentCols]);
  const tintTarget = useMemo(() => accentCols[0].clone(), [accentCols]);

  // one shared radial gradient sheet feeds the floor pool + wall wash + backwash
  const radialTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  const mkGlow = (opacity: number) =>
    new THREE.MeshBasicMaterial({
      map: radialTex,
      color: accentCols[0].clone(),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const poolMat = useMemo(() => mkGlow(0.5), [radialTex]); // floor glow pool
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const washMat = useMemo(() => mkGlow(0.34), [radialTex]); // flanking-wall wash
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const backMat = useMemo(() => mkGlow(0.3), [radialTex]); // backwash halo behind the casing
  // thin accent rim — shared, breathing (sin pulse on emissiveIntensity)
  const rimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0d0f16",
        roughness: 0.4,
        metalness: 0.3,
        emissive: accentCols[0].clone(),
        emissiveIntensity: 1.1,
        toneMapped: false,
      }),
    [accentCols],
  );

  useFrame((_, rawDt) => {
    const m = matRef.current;
    if (!m) return;
    const dt = Math.min(rawDt, 1 / 30);
    tRef.current += dt;
    m.uniforms.uTime.value = tRef.current;
    if (frames.length > 1) {
      if (!moving.current && tRef.current >= nextAt.current) {
        next.current = (idx.current + 1) % frames.length;
        m.uniforms.uTexNext.value = frames[next.current];
        tintTarget.copy(accentCols[next.current]); // light leads the wipe in
        moving.current = true;
        moveStart.current = tRef.current;
      }
      if (moving.current) {
        const k = (tRef.current - moveStart.current) / WIPE;
        if (k >= 1) {
          idx.current = next.current;
          m.uniforms.uTexture.value = frames[idx.current];
          m.uniforms.uMix.value = 0;
          moving.current = false;
          nextAt.current = tRef.current + HOLD;
        } else m.uniforms.uMix.value = k * k * (3 - 2 * k); // eased wipe
      }
    }
    // slow Ken-Burns
    if (screenRef.current) {
      const s = 1 + Math.sin(tRef.current * 0.18) * 0.012;
      screenRef.current.scale.set(s, s, 1);
    }
    // reel progress bar
    if (barRef.current) {
      const prog = moving.current ? 1 : Math.min((tRef.current - (nextAt.current - HOLD)) / HOLD, 1);
      barRef.current.scale.x = Math.max(0.001, prog);
    }
    // chase the slide accent (no allocations — reuse the memoised Colors)
    const dk = 1 - Math.exp(-dt * TINT_RATE);
    tint.lerp(tintTarget, dk);
    const breathe = Math.sin(tRef.current * 0.9); // slow — breathe, don't strobe
    rimMat.emissive.copy(tint);
    rimMat.emissiveIntensity = 1.1 + 0.25 * breathe; // lower peak → tighter bloom halo, rim stays a thin line
    poolMat.color.copy(tint);
    washMat.color.copy(tint);
    backMat.color.copy(tint);
    if (barMatRef.current) barMatRef.current.color.copy(tint);
    if (lightRef.current) {
      lightRef.current.color.copy(tint);
      lightRef.current.intensity = 24 + 3 * breathe;
    }
  });

  // entrance lobby: right wall, recessed into its own niche (the shell cuts the
  // wall outward by FEATURE_RECESS_DEPTH at FEATURE_X — Rig's feature look-target
  // uses the same depth so the flat panel stays framed head-on).
  return (
    <group position={[FEATURE_X, 1.72, HALF_W - 0.06 + FEATURE_RECESS_DEPTH]} rotation-y={Math.PI}>
      {/* low-alpha emissive backwash — the fixture reads lit even edge-on from
          the hero camera (halo spills past the casing onto the niche wall) */}
      <mesh position-z={-0.05} material={backMat}>
        <planeGeometry args={[FW + 1.8, FH + 1.5]} />
      </mesh>
      {/* gunmetal casing */}
      <mesh position-z={-0.14}>
        <boxGeometry args={[FW + 0.36, FH + 0.36, 0.22]} />
        <meshStandardMaterial color="#2a2f3a" roughness={0.35} metalness={0.7} />
      </mesh>
      {/* thin accent rim — shared breathing emissive material (hairline: bloom
          supplies the glow, so the bar itself stays skinny) */}
      <mesh position={[0, FH / 2 + 0.15, -0.02]} material={rimMat}>
        <boxGeometry args={[FW + 0.33, 0.028, 0.04]} />
      </mesh>
      <mesh position={[0, -FH / 2 - 0.15, -0.02]} material={rimMat}>
        <boxGeometry args={[FW + 0.33, 0.028, 0.04]} />
      </mesh>
      <mesh position={[FW / 2 + 0.15, 0, -0.02]} material={rimMat}>
        <boxGeometry args={[0.028, FH + 0.27, 0.04]} />
      </mesh>
      <mesh position={[-FW / 2 - 0.15, 0, -0.02]} material={rimMat}>
        <boxGeometry args={[0.028, FH + 0.27, 0.04]} />
      </mesh>
      {/* the reel */}
      <group ref={screenRef}>
        <mesh>
          <planeGeometry args={[FW, FH]} />
          <shaderMaterial
            ref={matRef}
            uniforms={uniforms}
            vertexShader={screenVertex}
            fragmentShader={screenFragment}
            toneMapped={false}
          />
        </mesh>
      </group>
      {/* letterbox bars — lifted off true black so they read as part of a lit
          fixture, not holes in the wall */}
      <mesh position={[0, FH / 2 - BAR_H / 2, 0.04]}>
        <planeGeometry args={[FW, BAR_H]} />
        <meshBasicMaterial color="#12151f" />
      </mesh>
      <mesh position={[0, -FH / 2 + BAR_H / 2, 0.04]}>
        <planeGeometry args={[FW, BAR_H]} />
        <meshBasicMaterial color="#12151f" />
      </mesh>
      {/* reel progress bar — group scales from the left edge; tinted per slide */}
      <group ref={barRef} position={[-FW / 2 + 0.05, -FH / 2 + 0.06, 0.05]}>
        <mesh position={[(FW - 0.1) / 2, 0, 0]}>
          <planeGeometry args={[FW - 0.1, 0.04]} />
          <meshBasicMaterial ref={barMatRef} color={PROJECTS[0].accent} toneMapped={false} />
        </mesh>
      </group>
      {/* slide-accent spill: radial glow pool on the lobby floor in front of the
          screen + a soft vertical wash on the flanking corridor wall (both share
          radialTex; tints chase the slide accent) */}
      <mesh position={[0, -1.7, FEATURE_RECESS_DEPTH + 1.9]} rotation-x={-Math.PI / 2} material={poolMat}>
        <planeGeometry args={[7.0, 4.6]} />
      </mesh>
      <mesh position={[3.8, 0.3, FEATURE_RECESS_DEPTH - 0.02]} material={washMat}>
        <planeGeometry args={[2.6, 3.6]} />
      </mesh>
      {/* the display THROWS light: damp-lerped slide-accent key in front of the
          screen (tight falloff — this is one of the round's ≤2 new pointLights) */}
      <pointLight
        ref={lightRef}
        position={[0, 0.5, 2.8]}
        color={PROJECTS[0].accent}
        intensity={24}
        distance={9}
        decay={2}
      />
      {/* cool fill so blacks around the fixture keep shape (was the old key —
          demoted now the accent light paints the lobby) */}
      <pointLight position={[0, 0.6, 3.2]} color="#bcd4ff" intensity={12} distance={12} decay={2} />
    </group>
  );
}
