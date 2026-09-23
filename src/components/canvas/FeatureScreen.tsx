"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBox, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { PROJECTS } from "@/lib/constants";
import { displayVertex, displayFragment } from "./shaders";
import { FEATURE_X, FEATURE_GLASS_Z, FEATURE_RECESS_DEPTH } from "./hallConfig";
import { familyVar, hexA, roundRect, wrapText } from "./canvas2d";
import { GLOW, INK, NEUTRAL } from "./theme";
import { withBase } from "@/lib/asset";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { useDeferredDispose } from "./bayScreens";

const FW = 4.8; // 16:9 feature panel (sized to fit the FOV head-on from across the hall)
const FH = 2.7;
const BEZEL = 0.08;
const CHIN = 0.16; // bottom bezel carrying the reel progress hairline
const HOLD = 6; // seconds each slide rests (long enough to read from the camera dwell)
const FADE = 1.8; // eased crossfade under a soft dim — no swipes, no cuts
const ZOOM = 0.012; // each slide settles from 1+ZOOM → 1 across its life

/** Damp rate for the slide-accent tint chase (light + glow quads + trim):
 *  slow enough that a slide change is a gentle colour drift, never a pop. */
const TINT_RATE = 1.1;

const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * The lobby SHOWREEL — a wide cinema display recessed into its own wall niche
 * (FEATURE_RECESS_DEPTH) that you glide past before the first bay. Same
 * fixture language as the bay hero displays (bayScreens.tsx): anodised bezel
 * under black glass, a hairline accent underglow, light thrown onto the wall
 * and floor — and the same displayFragment (flat glass, highlight soft-knee
 * so nothing blooms out, static sheen, eased crossfade + slow zoom settle).
 *
 * Every project gets a designed 16:9 frame painted once to a CanvasTexture:
 * title block + description + chips on the left, the app on a lit device
 * stage (or an authored motif for poster projects) on the right.
 */
export default function FeatureScreen() {
  const reduced = useReducedMotion(); // reduced motion: the reel rests on slide 1
  const withImg = useMemo(() => PROJECTS.filter((p) => p.image), []);
  const urls = useMemo(() => withImg.map((p) => withBase(p.image as string)), [withImg]);
  const texs = useTexture(urls);

  const frameBundle = useMemo(() => {
    const list = Array.isArray(texs) ? texs : [texs];
    const imgByUrl: Record<string, HTMLImageElement> = {};
    withImg.forEach((p, i) => {
      imgByUrl[p.image as string] = list[i].image as HTMLImageElement;
    });
    // The painter is idempotent (full-canvas fill first) so the fonts.ready
    // effect below can re-run it over the same canvases once webfonts land.
    const paint = (ctx: CanvasRenderingContext2D, p: (typeof PROJECTS)[number], i: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const sans = familyVar("--ff-body", "system-ui, sans-serif");
      const acc = p.accent;

      // neutral ground, the accent arriving only as light from the stage
      const bg = ctx.createLinearGradient(0, 0, 0, 900);
      bg.addColorStop(0, "#1a1e2a");
      bg.addColorStop(1, "#11141c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1600, 900);
      const stageX = 1170;
      const stageY = 450;
      const glow = ctx.createRadialGradient(stageX, stageY, 0, stageX, stageY, 560);
      glow.addColorStop(0, hexA(acc, 0.34));
      glow.addColorStop(0.55, hexA(acc, 0.1));
      glow.addColorStop(1, hexA(acc, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1600, 900);
      // fine drafting dot grid
      ctx.fillStyle = "rgba(244,241,234,0.05)";
      for (let y = 30; y < 900; y += 30) for (let x = 30; x < 1600; x += 30) ctx.fillRect(x, y, 2, 2);

      // ── header strip ──
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = acc;
      ctx.font = `500 26px ${mono}`;
      ctx.fillText(`NOW SHOWING — ${p.index} / 0${PROJECTS.length}`, 110, 118);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(244,241,234,0.45)";
      ctx.font = `500 22px ${mono}`;
      ctx.fillText("KIRKHAM·01 — SHOWREEL", 1490, 118);
      ctx.textAlign = "left";
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(110, 144);
      ctx.lineTo(1490, 144);
      ctx.stroke();

      // ── right: the device stage ──
      const img = p.image ? imgByUrl[p.image] : null;
      // stage floor line + soft reflection pool
      const pool = ctx.createRadialGradient(stageX, 820, 0, stageX, 820, 300);
      pool.addColorStop(0, hexA(acc, 0.22));
      pool.addColorStop(1, hexA(acc, 0));
      ctx.fillStyle = pool;
      ctx.fillRect(stageX - 320, 740, 640, 160);
      if (img && img.width) {
        const dw = 300, dh = 620;
        const dx = stageX - dw / 2;
        const dy = 180;
        // shadow
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = 50;
        ctx.shadowOffsetY = 24;
        ctx.fillStyle = "#0b0d13";
        roundRect(ctx, dx - 12, dy - 12, dw + 24, dh + 24, 46);
        ctx.fill();
        ctx.restore();
        // anodised edge
        ctx.strokeStyle = "rgba(244,241,234,0.22)";
        ctx.lineWidth = 2;
        roundRect(ctx, dx - 12, dy - 12, dw + 24, dh + 24, 46);
        ctx.stroke();
        ctx.save();
        roundRect(ctx, dx, dy, dw, dh, 36);
        ctx.clip();
        const tAR = dw / dh;
        const iAR = img.width / img.height;
        let sw = img.width, sh = img.height, sx = 0;
        if (iAR > tAR) {
          sw = img.height * tAR;
          sx = (img.width - sw) / 2;
        } else sh = img.width / tAR; // top-anchored crop keeps the app header visible
        ctx.drawImage(img, sx, 0, sw, sh, dx, dy, dw, dh);
        // glass sheen across the device
        const sheen = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh * 0.6);
        sheen.addColorStop(0, "rgba(255,255,255,0.08)");
        sheen.addColorStop(0.45, "rgba(255,255,255,0)");
        ctx.fillStyle = sheen;
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
        // dynamic island
        ctx.fillStyle = "#07080c";
        roundRect(ctx, stageX - 44, dy + 14, 88, 24, 12);
        ctx.fill();
      } else {
        paintMotif(ctx, p.theme, stageX, stageY, acc);
      }

      // ── left column: kicker / title / description / chips ──
      const lx = 110, lw = 700;
      ctx.fillStyle = acc;
      ctx.font = `500 28px ${mono}`;
      ctx.fillText(`${p.category.toUpperCase()} · ${p.year}`, lx, 236);
      let ts = 128; // shrink-to-fit the serif title
      ctx.font = `700 ${ts}px ${ser}`;
      while (ctx.measureText(p.title).width > lw && ts > 72) {
        ts -= 6;
        ctx.font = `700 ${ts}px ${ser}`;
      }
      ctx.fillStyle = INK;
      ctx.fillText(p.title, lx - 4, 362);
      ctx.fillStyle = "rgba(244,241,234,0.82)";
      ctx.font = `400 34px ${sans}`;
      const descEnd = wrapText(ctx, p.description, lx, 434, lw, 48);

      // chips: traction metrics (accent) first, then the tech stack (neutral) —
      // minus any tech already named inside a metric label
      const metricText = (p.metrics ?? []).map((m) => `${m.value} ${m.label}`.toLowerCase()).join(" ");
      const chips = [
        ...(p.metrics ?? []).map((m) => ({ t: `${m.value} ${m.label.toUpperCase()}`, hot: true })),
        ...p.tech.filter((t) => !metricText.includes(t.toLowerCase())).map((t) => ({ t: t.toUpperCase(), hot: false })),
      ];
      ctx.font = `500 24px ${mono}`;
      let cy = Math.max(descEnd + 14, 590);
      let cx = lx;
      for (const ch of chips) {
        const cw = ctx.measureText(ch.t).width + 44;
        if (cx + cw > lx + lw) {
          cx = lx;
          cy += 60;
        }
        if (cy > 700) break; // never spill under the slide index
        roundRect(ctx, cx, cy, cw, 48, 24);
        if (ch.hot) {
          ctx.fillStyle = hexA(acc, 0.16);
          ctx.fill();
          ctx.strokeStyle = hexA(acc, 0.75);
        } else ctx.strokeStyle = "rgba(244,241,234,0.32)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = ch.hot ? INK : "rgba(244,241,234,0.8)";
        ctx.fillText(ch.t, cx + 22, cy + 33);
        cx += cw + 14;
      }

      // ── slide index: short bars, current one in accent ──
      const n = PROJECTS.length;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = k === i ? acc : "rgba(244,241,234,0.25)";
        roundRect(ctx, lx + k * 58, 790, 44, 5, 2.5);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(244,241,234,0.45)";
      ctx.font = `500 22px ${mono}`;
      ctx.fillText(`${p.index} / 0${n}`, lx + n * 58 + 14, 798);
    };

    const textures = PROJECTS.map((p, i) => {
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = 900;
      paint(c.getContext("2d")!, p, i);
      const tex = new THREE.CanvasTexture(c);
      // displayFragment samples linear — let three decode the sRGB canvas
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 16;
      return tex;
    });
    return { textures, paint };
  }, [texs, withImg]);
  const frames = frameBundle.textures;

  // Redraw every slide after document.fonts.ready (cold cache: the showreel
  // would otherwise bake its type in the fallback fonts for the session).
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
  useDeferredDispose(frameBundle.textures);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  const barRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const st = useRef({ t: 0, idx: 0, next: 1, nextAt: HOLD, fading: false, fadeStart: 0, startA: 0, startB: 0 });

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTexA: { value: frames[0] },
      uTexB: { value: frames[1 % frames.length] },
      uCoverA: { value: new THREE.Vector2(1, 1) },
      uCoverB: { value: new THREE.Vector2(1, 1) },
      uCropA: { value: new THREE.Vector4(0, 0, 1, 1) },
      uCropB: { value: new THREE.Vector4(0, 0, 1, 1) },
      uZoomA: { value: 1 },
      uZoomB: { value: 1 },
      uMix: { value: 0 },
      uDim: { value: 0 },
      uSize: { value: new THREE.Vector2(FW, FH) },
      uRadius: { value: 0.06 },
      uExposure: { value: 0.95 },
      uExpA: { value: 1 },
      uExpB: { value: 1 },
      uKnee: { value: 0.34 },
      uPeak: { value: 0.64 }, // INK text + the screenshots stay under the 0.78 bloom line
      uGlass: { value: 0.03 },
      uSurround: { value: new THREE.Color("#07080c") },
    }),
    [frames],
  );

  /* ── slide-accent light rig: one dominant colour per slide (project accent),
     damp-lerped so a slide change is a slow drift, not a pop ── */
  const accentCols = useMemo(() => PROJECTS.map((p) => new THREE.Color(p.accent)), []);
  const tint = useMemo(() => accentCols[0].clone(), [accentCols]);
  const tintTarget = useMemo(() => accentCols[0].clone(), [accentCols]);

  // one shared radial gradient sheet feeds the floor pool + wall wash + halo
  const radialTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.42)");
    g.addColorStop(0.75, "rgba(255,255,255,0.1)");
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
  const poolMat = useMemo(() => mkGlow(0.34), [radialTex]); // floor glow pool
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const washMat = useMemo(() => mkGlow(0.2), [radialTex]); // flanking-wall wash
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const haloMat = useMemo(() => mkGlow(0.16), [radialTex]); // halo on the niche wall
  const trimMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: accentCols[0].clone().multiplyScalar(GLOW.trim), toneMapped: false }),
    [accentCols],
  );
  const barMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: accentCols[0].clone().multiplyScalar(GLOW.trim), toneMapped: false }),
    [accentCols],
  );
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: NEUTRAL.hullLight, roughness: 0.32, metalness: 0.78 }),
    [],
  );
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#0a0c12", roughness: 0.12, metalness: 0.55 }),
    [],
  );
  // deferred: StrictMode's mount-time cleanup must not dispose materials a
  // pending compileAsync (Scene compile-before-reveal) is still waiting on
  useDeferredDispose(
    useMemo(
      () => [poolMat, washMat, haloMat, trimMat, barMat, bodyMat, glassMat, radialTex],
      [poolMat, washMat, haloMat, trimMat, barMat, bodyMat, glassMat, radialTex],
    ),
  );

  useFrame((_, rawDt) => {
    const m = matRef.current;
    if (!m) return;
    const s = st.current;
    const u = m.uniforms;
    const dt = Math.min(rawDt, 1 / 30);
    s.t += dt;
    const life = HOLD + FADE * 2;
    const zoomAt = (start: number) => 1 + ZOOM * (1 - ease(Math.min(Math.max((s.t - start) / life, 0), 1)));
    let mix = 0;
    let dim = 0;
    if (frames.length > 1 && !reduced) {
      if (!s.fading && s.t >= s.nextAt) {
        s.next = (s.idx + 1) % frames.length;
        u.uTexB.value = frames[s.next];
        tintTarget.copy(accentCols[s.next]); // light drifts with the fade
        s.fading = true;
        s.fadeStart = s.t;
        s.startB = s.t;
      }
      if (s.fading) {
        const k = (s.t - s.fadeStart) / FADE;
        if (k >= 1) {
          s.idx = s.next;
          s.startA = s.startB;
          u.uTexA.value = frames[s.idx];
          s.fading = false;
          s.nextAt = s.t + HOLD;
        } else {
          // text-heavy slides: the frames only overlap through the middle of
          // the fade, under a soft dim, so type never double-exposes
          mix = ease(Math.min(Math.max((k - 0.3) / 0.4, 0), 1));
          dim = 0.38 * Math.sin(Math.PI * k);
        }
      }
    }
    u.uMix.value = mix;
    u.uDim.value = dim;
    u.uZoomA.value = zoomAt(s.startA);
    u.uZoomB.value = zoomAt(s.startB);
    // reel progress hairline (fills across the hold, rests full through the fade)
    if (barRef.current) {
      const prog = s.fading ? 1 : Math.min((s.t - (s.nextAt - HOLD)) / HOLD, 1);
      barRef.current.scale.x = Math.max(0.001, prog);
    }
    // chase the slide accent (no allocations — reuse the memoised Colors)
    tint.lerp(tintTarget, 1 - Math.exp(-dt * TINT_RATE));
    poolMat.color.copy(tint);
    washMat.color.copy(tint);
    haloMat.color.copy(tint);
    trimMat.color.copy(tint).multiplyScalar(GLOW.trim);
    barMat.color.copy(tint).multiplyScalar(GLOW.trim);
    if (lightRef.current) lightRef.current.color.copy(tint);
  });

  const W = FW + BEZEL * 2;
  const H = FH + BEZEL + CHIN;
  const bodyY = -(CHIN - BEZEL) / 2;

  // entrance lobby: right wall, recessed into its own niche (the shell cuts the
  // wall outward by FEATURE_RECESS_DEPTH at FEATURE_X — Rig's feature look-target
  // aims at the same shared FEATURE_GLASS_Z so the flat panel stays framed head-on).
  return (
    <group position={[FEATURE_X, 1.72, FEATURE_GLASS_Z]} rotation-y={Math.PI}>
      {/* light the display throws back onto the niche wall */}
      <mesh position={[0, bodyY, -0.2]} material={haloMat} renderOrder={-1}>
        <planeGeometry args={[W * 1.7, H * 1.8]} />
      </mesh>
      {/* anodised bezel */}
      <RoundedBox args={[W, H, 0.16]} radius={0.04} smoothness={3} position={[0, bodyY, -0.082]} material={bodyMat} />
      {/* black glass face — leaves a fine anodised rim */}
      <mesh position={[0, bodyY, 0.0005]} material={glassMat}>
        <planeGeometry args={[W - 0.05, H - 0.05]} />
      </mesh>
      {/* the reel */}
      <mesh position-z={0.003}>
        <planeGeometry args={[FW, FH]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={displayVertex}
          fragmentShader={displayFragment}
          toneMapped={false}
        />
      </mesh>
      {/* reel progress hairline in the chin — scales from the left, slide-tinted */}
      <mesh position={[0, -FH / 2 - CHIN / 2, 0.002]}>
        <planeGeometry args={[FW * 0.4, 0.008]} />
        <meshBasicMaterial color="#2a303e" toneMapped={false} />
      </mesh>
      <group ref={barRef} position={[-FW * 0.2, -FH / 2 - CHIN / 2, 0.003]}>
        <mesh position={[FW * 0.2, 0, 0]} material={barMat}>
          <planeGeometry args={[FW * 0.4, 0.008]} />
        </mesh>
      </group>
      {/* hairline accent underglow */}
      <mesh position={[0, bodyY - H / 2 - 0.004, -0.08]} material={trimMat}>
        <boxGeometry args={[W * 0.5, 0.01, 0.1]} />
      </mesh>
      {/* slide-accent spill: glow pool on the lobby floor in front of the screen
          + a soft wash on the flanking corridor wall (tints chase the slide) */}
      <mesh position={[0, -1.7, FEATURE_RECESS_DEPTH + 1.9]} rotation-x={-Math.PI / 2} material={poolMat}>
        <planeGeometry args={[7.0, 4.6]} />
      </mesh>
      <mesh position={[3.8, 0.3, FEATURE_RECESS_DEPTH - 0.02]} material={washMat}>
        <planeGeometry args={[2.6, 3.6]} />
      </mesh>
      {/* the display THROWS light: damp-lerped slide-accent key in front of the
          screen (existing light — steady, no breathing) */}
      <pointLight
        ref={lightRef}
        position={[0, 0.5, 2.8]}
        color={PROJECTS[0].accent}
        intensity={22}
        distance={9}
        decay={2}
      />
      {/* cool fill so blacks around the fixture keep shape */}
      <pointLight position={[0, 0.6, 3.2]} color="#bcd4ff" intensity={12} distance={12} decay={2} />
    </group>
  );
}

/** Authored stage motif for poster projects (no screenshots yet). */
function paintMotif(ctx: CanvasRenderingContext2D, theme: string, cx: number, cy: number, acc: string) {
  ctx.save();
  if (theme === "map") {
    ctx.lineWidth = 2.5;
    for (let k = 1; k <= 9; k++) {
      ctx.strokeStyle = hexA(acc, 0.12 + 0.04 * (9 - k));
      ctx.beginPath();
      for (let a = 0; a <= 72; a++) {
        const t = (a / 72) * Math.PI * 2;
        const r = k * 30 * (1 + 0.12 * Math.sin(t * 3 + k) + 0.06 * Math.cos(t * 5 - k * 0.7));
        const x = cx + Math.cos(t) * r * 1.15;
        const y = cy + Math.sin(t) * r * 0.9;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(244,241,234,0.85)";
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 12]);
    ctx.beginPath();
    ctx.moveTo(cx - 250, cy + 230);
    ctx.bezierCurveTo(cx - 200, cy + 20, cx - 120, cy + 60, cx + 10, cy - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx - 250, cy + 230, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(cx + 10, cy - 62, 26, Math.PI, 0);
    ctx.lineTo(cx + 10, cy - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1e2a";
    ctx.beginPath();
    ctx.arc(cx + 10, cy - 62, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // faceted gem, drafted in line
    const r = 170;
    ctx.strokeStyle = hexA(acc, 0.95);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r * 0.3);
    ctx.lineTo(cx - r * 0.5, cy - r * 0.85);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.85);
    ctx.lineTo(cx + r, cy - r * 0.3);
    ctx.lineTo(cx, cy + r);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,241,234,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r * 0.3);
    ctx.lineTo(cx + r, cy - r * 0.3);
    for (const fx of [-0.5, 0, 0.5]) {
      ctx.moveTo(cx + r * fx, cy - r * 0.85);
      ctx.lineTo(cx + r * fx * 0.6 - r * 0.2 * Math.sign(fx), cy - r * 0.3);
      ctx.lineTo(cx, cy + r);
    }
    ctx.stroke();
  }
  ctx.restore();
}
