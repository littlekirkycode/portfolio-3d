"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { PROJECTS } from "@/lib/constants";
import { screenVertex, screenFragment } from "./shaders";
import { FEATURE_X, HALF_W } from "./hallConfig";
import { withBase } from "@/lib/asset";

const INK = "#f4f1ea";

function familyVar(v: string, fb: string): string {
  if (typeof window === "undefined") return fb;
  const s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  return s ? `${s}, ${fb}` : fb;
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
function wrap(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, maxW: number, lh: number) {
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
}

const FW = 4.8; // 16:9 feature panel (sized to fit the FOV head-on from across the hall)
const FH = 2.7;

/**
 * Wide cinematic SHOWREEL screen near the corridor entrance — the big "movie
 * screen" you glide past before the first bay. Cycles a designed frame per
 * product (device-pillarboxed screenshot + title + "now showing") through the
 * existing CRT screen shader (crisp, low uCrt) with a dissolve between frames,
 * letterbox bars, a glow rim and a slow Ken-Burns drift.
 */
export default function FeatureScreen() {
  const withImg = useMemo(() => PROJECTS.filter((p) => p.image), []);
  const urls = useMemo(() => withImg.map((p) => withBase(p.image as string)), [withImg]);
  const texs = useTexture(urls);

  const frames: THREE.Texture[] = useMemo(() => {
    const list = Array.isArray(texs) ? texs : [texs];
    const imgByUrl: Record<string, HTMLImageElement> = {};
    withImg.forEach((p, i) => {
      imgByUrl[p.image as string] = list[i].image as HTMLImageElement;
    });
    const ser = familyVar("--ff-display", "Georgia, serif");
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    const sans = familyVar("--ff-body", "system-ui, sans-serif");
    return PROJECTS.map((p) => {
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = 900;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#08080d";
      ctx.fillRect(0, 0, 1600, 900);
      const g = ctx.createLinearGradient(0, 0, 1600, 900);
      g.addColorStop(0, p.accent);
      g.addColorStop(0.5, "#0d0d14");
      g.addColorStop(1, "#08080d");
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1600, 900);
      ctx.globalAlpha = 1;

      // device-pillarboxed screenshot on the left
      const img = p.image ? imgByUrl[p.image] : null;
      const boxX = 96, boxY = 130, boxW = 600, boxH = 640;
      if (img && img.width) {
        const ar = img.width / img.height;
        let dw = boxW, dh = boxW / ar;
        if (dh > boxH) { dh = boxH; dw = boxH * ar; }
        const dx = boxX + (boxW - dw) / 2;
        const dy = boxY + (boxH - dh) / 2;
        ctx.fillStyle = "#050507";
        roundRect(ctx, dx - 16, dy - 16, dw + 32, dh + 32, 30);
        ctx.fill();
        ctx.save();
        roundRect(ctx, dx, dy, dw, dh, 18);
        ctx.clip();
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.restore();
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.85;
        roundRect(ctx, dx - 16, dy - 16, dw + 32, dh + 32, 30);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // right column text
      const tx = img ? 800 : 130;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = p.accent;
      ctx.font = `500 30px ${mono}`;
      ctx.fillText(`NOW SHOWING — ${p.index} / 0${PROJECTS.length}`, tx, 205);
      ctx.fillStyle = INK;
      ctx.font = `700 128px ${ser}`;
      ctx.fillText(p.title, tx - 2, 340);
      ctx.fillStyle = p.accent;
      ctx.font = `500 30px ${mono}`;
      ctx.fillText(p.category.toUpperCase(), tx, 400);
      ctx.fillStyle = "rgba(244,241,234,0.85)";
      ctx.font = `400 40px ${sans}`;
      wrap(ctx, p.description, tx, 480, img ? 700 : 1360, 54);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 16;
      return tex;
    });
  }, [texs, withImg]);

  const matRef = useRef<THREE.ShaderMaterial>(null);
  const screenRef = useRef<THREE.Group>(null);
  const barRef = useRef<THREE.Group>(null);
  const tRef = useRef(0);
  const idx = useRef(0);
  const next = useRef(1);
  const nextAt = useRef(5);
  const moving = useRef(false);
  const moveStart = useRef(0);

  const uniforms = useMemo<Record<string, THREE.IUniform>>(
    () => ({
      uTexture: { value: frames[0] },
      uTexNext: { value: frames[1 % frames.length] },
      uTime: { value: 0 },
      uOn: { value: 1 },
      uCrt: { value: 0.12 },
      uMix: { value: 0 },
      uTrans: { value: 0 },
      uTint: { value: new THREE.Color("#ffffff") },
    }),
    [frames],
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
        moving.current = true;
        moveStart.current = tRef.current;
      }
      if (moving.current) {
        const k = (tRef.current - moveStart.current) / 0.6;
        if (k >= 1) {
          idx.current = next.current;
          m.uniforms.uTexture.value = frames[idx.current];
          m.uniforms.uMix.value = 0;
          moving.current = false;
          nextAt.current = tRef.current + 5;
        } else m.uniforms.uMix.value = k;
      }
    }
    // slow Ken-Burns
    if (screenRef.current) {
      const s = 1 + Math.sin(tRef.current * 0.18) * 0.012;
      screenRef.current.scale.set(s, s, 1);
    }
    // reel progress bar
    if (barRef.current) {
      const prog = moving.current ? 1 : Math.min((tRef.current - (nextAt.current - 5)) / 5, 1);
      barRef.current.scale.x = Math.max(0.001, prog);
    }
  });

  // entrance lobby: right wall, angled toward the camera (which dwells + turns to
  // face it during its lobby band — see featureFocusAt/Rig).
  return (
    <group position={[FEATURE_X, 1.72, HALF_W - 0.06]} rotation-y={Math.PI}>
      {/* casing + glow rim */}
      <mesh position-z={-0.12}>
        <boxGeometry args={[FW + 0.4, FH + 0.4, 0.2]} />
        <meshStandardMaterial color="#060608" roughness={0.5} metalness={0.55} />
      </mesh>
      <mesh position-z={-0.04}>
        <boxGeometry args={[FW + 0.26, FH + 0.26, 0.05]} />
        <meshBasicMaterial color="#ff7a4d" toneMapped={false} />
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
      {/* letterbox bars */}
      <mesh position={[0, FH / 2 - 0.16, 0.04]}>
        <planeGeometry args={[FW, 0.32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh position={[0, -FH / 2 + 0.16, 0.04]}>
        <planeGeometry args={[FW, 0.32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      {/* reel progress bar — group scales from the left edge */}
      <group ref={barRef} position={[-FW / 2 + 0.05, -FH / 2 + 0.06, 0.05]}>
        <mesh position={[(FW - 0.1) / 2, 0, 0]}>
          <planeGeometry args={[FW - 0.1, 0.04]} />
          <meshBasicMaterial color="#ff7a4d" toneMapped={false} />
        </mesh>
      </group>
      {/* dedicated cool key (in front of the screen, corridor-side) so it's the
          brightest object on entry */}
      <pointLight position={[0, 0.6, 3.0]} color="#bcd4ff" intensity={22} distance={14} decay={2} />
    </group>
  );
}
