"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { SKILLS, ACHIEVEMENTS, EXPERIENCE, ALLIED_ROOM, type Project, type RoomTheme } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import {
  HALF_W,
  WALL_H,
  ALCOVE_OPEN_W,
  ALCOVE_DEPTH,
  ROOMS,
  type Room,
} from "./hallConfig";
import { screenVertex, screenFragment } from "./shaders";
import RoomProps from "./RoomProps";

const INK = "#f4f1ea";

/* ── canvas-texture helpers ─────────────────────────────────────────────── */

function familyVar(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): number {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineH;
}

/** Rounded-rect path (call ctx.fill()/stroke() after). */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function useTextTexture(
  width: number,
  height: number,
  render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
    return tex;
  }, [width, height]);
  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      render(ctx, width, height);
      texture.needsUpdate = true;
    };
    draw();
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => !cancelled && draw()).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [texture, render, width, height]);
  return texture;
}

/* ── hero screen on the back wall ───────────────────────────────────────── */

function Bezel({ w, h, accent }: { w: number; h: number; accent: string }) {
  return (
    <group>
      {/* dark casing */}
      <mesh position-z={-0.06}>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.12]} />
        <meshStandardMaterial color="#070709" roughness={0.55} metalness={0.5} />
      </mesh>
      {/* glowing accent rim → reads as a powered display */}
      <mesh position-z={-0.01}>
        <boxGeometry args={[w + 0.22, h + 0.22, 0.04]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

// true portrait phone-screenshot aspect (≈9:19.5)
const IMG_W = 1.38;
const IMG_H = 3.0;

/** The live app screen: a flat glass plane running the screen shader with a
 *  cinematic dissolve/slide between gallery shots. Used inside PhoneFrame. */
function ScreenImage({ project, animate, trans = 0 }: { project: Project; animate: boolean; trans?: number }) {
  const urls = useMemo(
    () => [project.image as string, ...(project.gallery ?? [])].map(withBase),
    [project],
  );
  const loaded = useTexture(urls);
  const list = useMemo(() => {
    const arr = Array.isArray(loaded) ? loaded : [loaded];
    arr.forEach((t) => {
      t.anisotropy = 16;
      t.needsUpdate = true;
    });
    return arr;
  }, [loaded]);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const tRef = useRef(0);
  const idx = useRef(0);
  const nextIdx = useRef(0);
  const nextAt = useRef(4.0);
  const moving = useRef(false);
  const movingStart = useRef(0);
  const uniforms = useMemo(
    () => ({
      uTexture: { value: list[0] },
      uTexNext: { value: list[Math.min(1, list.length - 1)] },
      uTime: { value: 0 },
      uOn: { value: 1 },
      uCrt: { value: 0.22 },
      uMix: { value: 0 },
      uTrans: { value: trans },
      uTint: { value: new THREE.Color(project.accent) },
    }),
    [project.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useFrame((_, rawDt) => {
    const mat = matRef.current;
    if (!mat || !animate || list.length < 2) return;
    tRef.current += Math.min(rawDt, 1 / 30);
    mat.uniforms.uTime.value = tRef.current;
    if (!moving.current && tRef.current >= nextAt.current) {
      nextIdx.current = (idx.current + 1) % list.length;
      mat.uniforms.uTexNext.value = list[nextIdx.current];
      moving.current = true;
      movingStart.current = tRef.current;
    }
    if (moving.current) {
      const k = (tRef.current - movingStart.current) / 0.55;
      if (k >= 1) {
        idx.current = nextIdx.current;
        mat.uniforms.uTexture.value = list[idx.current];
        mat.uniforms.uMix.value = 0;
        moving.current = false;
        nextAt.current = tRef.current + 4.0;
      } else {
        mat.uniforms.uMix.value = k;
      }
    }
  });
  return (
    <mesh position-z={0.03}>
      <planeGeometry args={[IMG_W, IMG_H]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={screenVertex}
        fragmentShader={screenFragment}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Phone chassis around a screen. */
function PhoneFrame({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <group>
      {/* glowing power rim */}
      <mesh position-z={-0.02}>
        <boxGeometry args={[IMG_W + 0.22, IMG_H + 0.26, 0.05]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      {/* dark metal body */}
      <mesh position-z={-0.05}>
        <boxGeometry args={[IMG_W + 0.16, IMG_H + 0.2, 0.14]} />
        <meshStandardMaterial color="#0a0a10" roughness={0.4} metalness={0.65} />
      </mesh>
      {children}
      {/* notch + home indicator */}
      <mesh position={[0, IMG_H / 2 - 0.13, 0.06]}>
        <boxGeometry args={[0.34, 0.07, 0.02]} />
        <meshStandardMaterial color="#050507" roughness={0.5} />
      </mesh>
      <mesh position={[0, -IMG_H / 2 + 0.1, 0.06]}>
        <boxGeometry args={[0.34, 0.03, 0.01]} />
        <meshBasicMaterial color="#46464f" toneMapped={false} />
      </mesh>
    </group>
  );
}

const CARD_W = 1.5;
const CARD_H = 2.6;

function ScreenCard({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, room.accent);
      g.addColorStop(0.62, "#14121a");
      g.addColorStop(1, "#0a0a10");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const og = ctx.createLinearGradient(0, h * 0.35, 0, h);
      og.addColorStop(0, "rgba(8,8,14,0)");
      og.addColorStop(1, "rgba(8,8,14,0.92)");
      ctx.fillStyle = og;
      ctx.fillRect(0, 0, w, h);
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.font = `500 30px ${mono}`;
      ctx.fillText(`(${room.index})`, 40, 40);
      ctx.fillStyle = room.accent;
      ctx.font = `500 28px ${mono}`;
      ctx.fillText(room.category.toUpperCase(), 42, h - 250);
      ctx.fillStyle = INK;
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 118px ${ser}`;
      ctx.fillText(room.title, 38, h - 130);
    },
    [room],
  );
  const tex = useTextTexture(640, 920, render);
  return (
    <group>
      <Bezel w={CARD_W} h={CARD_H} accent={room.accent} />
      <mesh position-z={0.04}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Web app (Xuabelle) shown in a browser window. */
function BrowserFrame({ project }: { project: Project }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const bar = h * 0.13;
      // window + title bar
      ctx.fillStyle = "#0c0c12";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#15161e";
      ctx.fillRect(0, 0, w, bar);
      ["#ff5f56", "#ffbd2e", "#27c93f"].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(36 + i * 36, bar * 0.5, 10, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#0a0a0f";
      rr(ctx, 170, bar * 0.24, w - 230, bar * 0.52, bar * 0.26);
      ctx.fill();
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `500 ${Math.round(bar * 0.32)}px ${mono}`;
      ctx.textBaseline = "middle";
      ctx.fillText((project.href || "").replace(/^https?:\/\//, ""), 200, bar * 0.5);
      // page body
      const g = ctx.createLinearGradient(0, bar, 0, h);
      g.addColorStop(0, project.accent);
      g.addColorStop(0.55, "#15111b");
      g.addColorStop(1, "#0a0a10");
      ctx.fillStyle = g;
      ctx.fillRect(0, bar, w, h - bar);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = project.accent;
      ctx.font = `500 ${Math.round(h * 0.05)}px ${mono}`;
      ctx.fillText(project.category.toUpperCase(), 52, h * 0.5);
      ctx.fillStyle = INK;
      ctx.font = `700 ${Math.round(h * 0.2)}px ${ser}`;
      ctx.fillText(project.title, 48, h * 0.66);
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `400 ${Math.round(h * 0.05)}px ${mono}`;
      ctx.fillText("VISIT  ↗", 52, h * 0.82);
    },
    [project],
  );
  const tex = useTextTexture(1120, 760, render);
  return (
    <group>
      <mesh position-z={-0.02}>
        <boxGeometry args={[2.42, 1.72, 0.04]} />
        <meshBasicMaterial color={project.accent} toneMapped={false} />
      </mesh>
      <mesh position-z={-0.05}>
        <boxGeometry args={[2.34, 1.64, 0.1]} />
        <meshStandardMaterial color="#070709" roughness={0.5} metalness={0.45} />
      </mesh>
      <mesh position-z={0.03}>
        <planeGeometry args={[2.26, 1.52]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RoomScreen({ room, animate }: { room: Room; animate: boolean }) {
  const p = room.project;
  if (p && p.kind === "screen" && p.image) {
    return (
      <PhoneFrame accent={room.accent}>
        <ScreenImage project={p} animate={animate} trans={room.variant === 1 ? 1 : 0} />
      </PhoneFrame>
    );
  }
  if (p && p.theme === "jewellery") return <BrowserFrame project={p} />;
  // the code terminal IS the Capabilities screen (no separate poster to overlap)
  if (room.theme === "skills") return <CodeHologram accent={room.accent} />;
  if (room.theme === "defence") return <BlueprintScreen room={room} />;
  return <ScreenCard room={room} />;
}

/** Allied (defence) hero — a procedural CAD/blueprint drafting display. */
const BP_W = 2.4;
const BP_H = 1.62;
function BlueprintScreen({ room }: { room: Room }) {
  const accent = room.accent;
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#0a1420";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hexA(accent, 0.1);
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let yy = 0; yy <= h; yy += 32) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
      ctx.strokeStyle = hexA(accent, 0.22);
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 160) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let yy = 0; yy <= h; yy += 160) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
      const cx = w * 0.42, cy = h * 0.5, pw = w * 0.34, ph = h * 0.4, cf = 40;
      ctx.strokeStyle = "#dfe8f0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - pw / 2 + cf, cy - ph / 2);
      ctx.lineTo(cx + pw / 2 - cf, cy - ph / 2);
      ctx.lineTo(cx + pw / 2, cy - ph / 2 + cf);
      ctx.lineTo(cx + pw / 2, cy + ph / 2);
      ctx.lineTo(cx - pw / 2, cy + ph / 2);
      ctx.lineTo(cx - pw / 2, cy - ph / 2 + cf);
      ctx.closePath();
      ctx.stroke();
      for (const [hx, hy] of [[cx - pw / 2 + 64, cy - ph / 2 + 64], [cx + pw / 2 - 64, cy + ph / 2 - 64]] as const) {
        ctx.beginPath(); ctx.arc(hx, hy, 18, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx - 28, hy); ctx.lineTo(hx + 28, hy); ctx.moveTo(hx, hy - 28); ctx.lineTo(hx, hy + 28); ctx.stroke();
      }
      const arrow = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        for (const [ax, ay, aa] of [[x1, y1, 0], [x2, y2, Math.PI]] as const) {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + 13 * Math.cos(aa + 0.38), ay + 13 * Math.sin(aa + 0.38));
          ctx.lineTo(ax + 13 * Math.cos(aa - 0.38), ay + 13 * Math.sin(aa - 0.38));
          ctx.closePath();
          ctx.fill();
        }
      };
      ctx.strokeStyle = hexA(accent, 0.85);
      ctx.fillStyle = hexA(accent, 0.85);
      ctx.lineWidth = 1.5;
      arrow(cx - pw / 2, cy - ph / 2 - 42, cx + pw / 2, cy - ph / 2 - 42);
      ctx.fillStyle = "#cfe0ff";
      ctx.font = `500 22px ${mono}`;
      ctx.textAlign = "center";
      ctx.fillText("120.0", cx, cy - ph / 2 - 50);
      ctx.textAlign = "left";
      ctx.fillStyle = hexA(accent, 0.9);
      ctx.font = `500 22px ${mono}`;
      ctx.fillText("Ø8.5 H7  ±0.02", cx + pw / 2 + 22, cy - ph / 2 + 50);
      ctx.fillStyle = accent;
      ctx.font = `600 26px ${mono}`;
      ctx.fillText("DRAWING — PRODUCT ENGINEERING", 26, 44);
      const tbw = w * 0.4, tbh = 120, tx = w - tbw - 16, ty = h - tbh - 16;
      ctx.strokeStyle = "#dfe8f0";
      ctx.lineWidth = 2;
      ctx.strokeRect(tx, ty, tbw, tbh);
      ctx.fillStyle = accent;
      ctx.font = `600 28px ${mono}`;
      ctx.fillText("ALLIED", tx + 16, ty + 40);
      ctx.fillStyle = "rgba(223,232,240,0.8)";
      ctx.font = `400 20px ${mono}`;
      ctx.fillText("PART No. AK-01", tx + 16, ty + 72);
      ctx.fillText("MATL: AL-7075   SCALE 1:2", tx + 16, ty + 100);
    },
    [accent],
  );
  const tex = useTextTexture(1120, 760, render);
  return (
    <group>
      <Bezel w={BP_W} h={BP_H} accent={room.accent} />
      <mesh position-z={0.04}>
        <planeGeometry args={[BP_W, BP_H]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── floating holographic info panel (description / skills / achievements) ── */

const DESC_W = 3.2;
const DESC_H = 2.62;

function InfoPanel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const sans = familyVar("--ff-body", "system-ui, sans-serif");
      // holographic panel: translucent slab + glowing accent rim (blooms → projection)
      rr(ctx, 6, 6, w - 12, h - 12, 30);
      ctx.fillStyle = "rgba(8,10,18,0.50)";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = room.accent;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.16)";
      ctx.stroke();
      ctx.fillStyle = room.accent;
      rr(ctx, 64, 74, 64, 9, 4);
      ctx.fill();

      const padX = 64;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `500 34px ${mono}`;
      ctx.fillText(`(${room.index})  ${room.category.toUpperCase()}`, padX, 144);
      ctx.fillStyle = INK;
      ctx.font = `700 108px ${ser}`;
      ctx.fillText(room.title, padX - 2, 248);
      ctx.strokeStyle = "rgba(244,241,234,0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, 300);
      ctx.lineTo(w - padX, 300);
      ctx.stroke();

      ctx.textBaseline = "top";
      let y = 364;
      if (room.kind === "project" && room.project) {
        ctx.fillStyle = "rgba(244,241,234,0.90)";
        ctx.font = `400 42px ${sans}`;
        y = wrapText(ctx, room.project.description, padX, y, w - padX * 2, 58) + 30;
        ctx.font = `500 30px ${mono}`;
        let px = padX;
        for (const t of room.project.tech) {
          const tw = ctx.measureText(t).width + 52;
          if (px + tw > w - padX) {
            px = padX;
            y += 76;
          }
          rr(ctx, px, y, tw, 58, 29);
          ctx.strokeStyle = "rgba(244,241,234,0.26)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.fillText(t, px + 26, y + 16);
          px += tw + 18;
        }
        if (room.project.href && room.project.href !== "#") {
          ctx.fillStyle = room.accent;
          ctx.font = `600 40px ${mono}`;
          ctx.fillText("VIEW PROJECT  ↗", padX, h - 104);
        }
      } else if (room.kind === "skills") {
        for (const grp of SKILLS) {
          ctx.fillStyle = room.accent;
          ctx.font = `500 30px ${mono}`;
          ctx.fillText(grp.group.toUpperCase(), padX, y);
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.font = `400 40px ${sans}`;
          ctx.fillText(grp.items.join("   ·   "), padX, y + 42);
          y += 116;
        }
      } else if (room.kind === "defence") {
        ctx.fillStyle = "rgba(244,241,234,0.90)";
        ctx.font = `400 42px ${sans}`;
        y = wrapText(ctx, ALLIED_ROOM.description, padX, y, w - padX * 2, 58) + 30;
        ctx.font = `500 30px ${mono}`;
        let px = padX;
        for (const t of ["DFM", "Tolerancing", "CAD", "Systems", "Hardware", "Test"]) {
          const tw = ctx.measureText(t).width + 52;
          if (px + tw > w - padX) {
            px = padX;
            y += 76;
          }
          rr(ctx, px, y, tw, 58, 29);
          ctx.strokeStyle = "rgba(244,241,234,0.26)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.fillText(t, px + 26, y + 16);
          px += tw + 18;
        }
      } else {
        ctx.font = `400 46px ${sans}`;
        for (const a of ACHIEVEMENTS) {
          ctx.fillStyle = room.accent;
          ctx.fillText("◆", padX, y + 4);
          ctx.fillStyle = "rgba(244,241,234,0.92)";
          ctx.fillText(a, padX + 54, y);
          y += 82;
        }
      }
    },
    [room],
  );
  const tex = useTextTexture(1000, 820, render);
  return (
    <mesh>
      <planeGeometry args={[DESC_W, DESC_H]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── experience timeline (a taller, readable visual timeline) ───────────── */

const TL_W = 2.35;
const TL_H = 3.2;

function TimelinePanel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const sans = familyVar("--ff-body", "system-ui, sans-serif");
      rr(ctx, 6, 6, w - 12, h - 12, 30);
      ctx.fillStyle = "rgba(9,11,19,0.62)";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = room.accent;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.stroke();
      ctx.fillStyle = room.accent;
      rr(ctx, 60, 70, 58, 8, 4);
      ctx.fill();

      const padX = 60;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `500 28px ${mono}`;
      ctx.fillText(`(${room.index})  ${room.category.toUpperCase()}`, padX, 132);
      ctx.fillStyle = INK;
      ctx.font = `700 98px ${ser}`;
      ctx.fillText(room.title, padX - 2, 230);

      const lineX = padX + 13;
      const top = 330;
      const bottom = h - 110;
      const n = EXPERIENCE.length;
      const step = (bottom - top) / (n - 1);
      ctx.strokeStyle = "rgba(244,241,234,0.16)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lineX, top);
      ctx.lineTo(lineX, top + step * (n - 1));
      ctx.stroke();

      ctx.textBaseline = "top";
      EXPERIENCE.forEach((e, i) => {
        const cy = top + step * i;
        ctx.beginPath();
        ctx.arc(lineX, cy, 23, 0, Math.PI * 2);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = room.accent;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(lineX, cy, 11, 0, Math.PI * 2);
        ctx.fillStyle = room.accent;
        ctx.fill();
        const tx = lineX + 50;
        ctx.fillStyle = room.accent;
        ctx.font = `500 27px ${mono}`;
        ctx.fillText(e.dates, tx, cy - 40);
        ctx.fillStyle = INK;
        ctx.font = `600 46px ${sans}`;
        ctx.fillText(e.role, tx, cy - 4);
        ctx.fillStyle = "rgba(244,241,234,0.62)";
        ctx.font = `400 31px ${sans}`;
        ctx.fillText(e.org, tx, cy + 52);
      });
    },
    [room],
  );
  const tex = useTextTexture(840, 1160, render);
  return (
    <mesh>
      <planeGeometry args={[TL_W, TL_H]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── holographic room name label (glows above the bay) ──────────────────── */

function RoomLabel({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const ser = familyVar("--ff-display", "Georgia, serif");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = room.accent;
      ctx.shadowColor = room.accent;
      ctx.shadowBlur = 36;
      ctx.font = `700 118px ${ser}`;
      ctx.fillText(room.title.toUpperCase(), w / 2, h / 2);
    },
    [room],
  );
  const tex = useTextTexture(1024, 256, render);
  return (
    <mesh>
      <planeGeometry args={[2.9, 0.72]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── station plaque beside each bay opening (number + name) ───────────────── */

function BayPlaque({ room }: { room: Room }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = room.accent;
      ctx.font = `600 ${Math.round(h * 0.32)}px ${mono}`;
      ctx.fillText(`(${room.index})`, 20, h * 0.4);
      ctx.fillStyle = "rgba(244,241,234,0.92)";
      ctx.font = `600 ${Math.round(h * 0.27)}px ${mono}`;
      ctx.fillText(room.title.toUpperCase(), 20, h * 0.82);
      ctx.fillStyle = room.accent;
      ctx.fillRect(20, h * 0.9, w * 0.55, 5);
    },
    [room],
  );
  const tex = useTextTexture(512, 240, render);
  return (
    <mesh>
      <planeGeometry args={[0.98, 0.46]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── glowing accent frame around the bay opening ────────────────────────── */

function OpeningFrame({ accent }: { accent: string }) {
  const half = ALCOVE_OPEN_W / 2;
  return (
    <group>
      {[-half, half].map((x, i) => (
        <mesh key={i} position={[x, WALL_H / 2, 0.06]}>
          <boxGeometry args={[0.09, WALL_H, 0.09]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, WALL_H - 0.05, 0.06]}>
        <boxGeometry args={[half * 2, 0.09, 0.09]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── code-terminal hologram (Capabilities — software-engineer vibe) ───────── */

function CodeHologram({ accent }: { accent: string }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      rr(ctx, 5, 5, w - 10, h - 10, 18);
      ctx.fillStyle = "rgba(7,11,20,0.66)";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ["#ff5f56", "#ffbd2e", "#27c93f"].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(46 + i * 38, 54, 12, 0, Math.PI * 2);
        ctx.fill();
      });
      // fixed code-editor palette so the terminal reads as code regardless of accent
      const KW = "#c792ea", KEY = "#82aaff", PUN = "#8893a8", STR = "#9ece6a", NUM = "#ff9e64", COM = "#65718a", VAR = "#e4ebf5";
      const lines: [string, string][][] = [
        [["const ", KW], ["engineer", VAR], [" = {", PUN]],
        [["  mobile", KEY], [": [", PUN], ["'Flutter'", STR], [", ", PUN], ["'Swift'", STR], ["],", PUN]],
        [["  backend", KEY], [": [", PUN], ["'C#'", STR], [", ", PUN], ["'Azure'", STR], ["],", PUN]],
        [["  web", KEY], [": [", PUN], ["'React'", STR], [", ", PUN], ["'Next'", STR], ["],", PUN]],
        [["  shipped", KEY], [": ", PUN], ["1_300_000", NUM], [",", PUN]],
        [["};", PUN]],
        [["deploy", KW], ["(engineer)", PUN], ["  // 100K DAU", COM]],
      ];
      ctx.textBaseline = "top";
      ctx.font = `500 38px ${mono}`;
      let y = 120;
      for (const ln of lines) {
        let x = 48;
        for (const [t, c] of ln) {
          ctx.fillStyle = c;
          ctx.fillText(t, x, y);
          x += ctx.measureText(t).width;
        }
        y += 56;
      }
    },
    [accent],
  );
  const tex = useTextTexture(900, 612, render);
  return (
    <mesh>
      <planeGeometry args={[2.3, 1.56]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/* ── flush accent mat per bay (props rest ON it); Nuremi gets a map floor ──── */

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const MAT_SPECS: Record<RoomTheme, { shape: "rect" | "round" | "map"; w: number; d: number }> = {
  gym: { shape: "rect", w: 4.4, d: 3.6 },
  lifeos: { shape: "rect", w: 4.2, d: 3.4 },
  habit: { shape: "round", w: 4.2, d: 4.2 },
  map: { shape: "map", w: 5.4, d: 3.6 },
  jewellery: { shape: "rect", w: 4.6, d: 3.0 },
  skills: { shape: "rect", w: 4.2, d: 3.4 },
  experience: { shape: "rect", w: 3.6, d: 3.0 },
  defence: { shape: "rect", w: 4.2, d: 3.4 },
  trophy: { shape: "round", w: 3.4, d: 3.4 },
};

/** A stylized top-down CITY MAP covering the floor (Nuremi maps concierge):
 *  street grid, river, a park, a glowing navigation route, and pin markers. */
function MapFloor({ accent, w, d, z }: { accent: string; w: number; d: number; z: number }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
      const line = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      };
      // land base
      ctx.fillStyle = "#0a0c17";
      ctx.fillRect(0, 0, cw, ch);
      // faint city blocks
      ctx.fillStyle = hexA(accent, 0.04);
      for (let i = 0; i < 14; i++) {
        for (let j = 0; j < 9; j++) {
          if ((i + j) % 2 === 0) ctx.fillRect((cw * i) / 14, (ch * j) / 9, cw / 14, ch / 9);
        }
      }
      // river (winding water band)
      ctx.strokeStyle = "#16273f";
      ctx.lineWidth = ch * 0.11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-20, ch * 0.72);
      ctx.bezierCurveTo(cw * 0.28, ch * 0.6, cw * 0.4, ch * 0.98, cw * 0.66, ch * 0.82);
      ctx.bezierCurveTo(cw * 0.82, ch * 0.73, cw * 0.9, ch * 0.9, cw + 20, ch * 0.8);
      ctx.stroke();
      // park
      ctx.fillStyle = hexA("#63d39a", 0.16);
      ctx.fillRect(cw * 0.1, ch * 0.12, cw * 0.15, ch * 0.18);
      // minor street grid
      ctx.lineCap = "butt";
      ctx.strokeStyle = hexA(accent, 0.22);
      ctx.lineWidth = 3;
      for (let i = 1; i < 14; i++) line((cw * i) / 14, 0, (cw * i) / 14, ch);
      for (let j = 1; j < 9; j++) line(0, (ch * j) / 9, cw, (ch * j) / 9);
      // major avenues
      ctx.strokeStyle = hexA(accent, 0.42);
      ctx.lineWidth = 7;
      line(0, ch * 0.33, cw, ch * 0.33);
      line(cw * 0.5, 0, cw * 0.5, ch);
      ctx.lineWidth = 5;
      line(0, ch * 0.08, cw, ch * 0.78); // diagonal boulevard
      // glowing navigation route
      ctx.shadowColor = accent;
      ctx.shadowBlur = 26;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(cw * 0.2, ch * 0.8);
      ctx.lineTo(cw * 0.2, ch * 0.33);
      ctx.lineTo(cw * 0.5, ch * 0.33);
      ctx.lineTo(cw * 0.5, ch * 0.18);
      ctx.lineTo(cw * 0.72, ch * 0.18);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // pin markers (flat, drawn on the map)
      const pin = (x: number, y: number, r: number, hi: boolean) => {
        ctx.fillStyle = hi ? "#ffffff" : accent;
        if (hi) { ctx.shadowColor = accent; ctx.shadowBlur = 22; }
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x - r, y - r * 1.25, x - r, y - r * 1.85);
        ctx.arc(x, y - r * 1.85, r, Math.PI, 0, false);
        ctx.quadraticCurveTo(x + r, y - r * 1.25, x, y);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = hi ? accent : "#0a0c17";
        ctx.beginPath();
        ctx.arc(x, y - r * 1.85, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      };
      pin(cw * 0.2, ch * 0.8, 13, false); // start
      pin(cw * 0.5, ch * 0.55, 12, false); // waypoint
      pin(cw * 0.72, ch * 0.18, 20, true); // destination (highlighted)
      // compass rose (top-right)
      const cxr = cw * 0.9;
      const cyr = ch * 0.16;
      const R = ch * 0.07;
      ctx.strokeStyle = hexA(accent, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cxr, cyr, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(cxr, cyr - R * 0.85);
      ctx.lineTo(cxr - R * 0.32, cyr + R * 0.1);
      ctx.lineTo(cxr + R * 0.32, cyr + R * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexA("#f4f1ea", 0.75);
      ctx.font = `bold ${Math.round(R * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", cxr, cyr + R * 0.55);
      // scale bar (bottom-left)
      ctx.strokeStyle = hexA("#f4f1ea", 0.5);
      ctx.lineWidth = 3;
      const sx = cw * 0.06;
      const sy = ch * 0.93;
      line(sx, sy, sx + cw * 0.12, sy);
      line(sx, sy - 6, sx, sy + 6);
      line(sx + cw * 0.12, sy - 6, sx + cw * 0.12, sy + 6);
      // inset frame
      ctx.strokeStyle = hexA(accent, 0.5);
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, cw - 16, ch - 16);
    },
    [accent],
  );
  const tex = useTextTexture(1536, Math.round((1536 * d) / w), render);
  return (
    <mesh position={[0, 0.012, z]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function BayMat({ room }: { room: Room }) {
  const spec = MAT_SPECS[room.theme];
  const color = useMemo(() => new THREE.Color(room.accent).multiplyScalar(0.2), [room.accent]);
  const cz = -ALCOVE_DEPTH + 1.7; // under the prop cluster
  if (spec.shape === "map") return <MapFloor accent={room.accent} w={spec.w} d={spec.d} z={cz} />;
  if (spec.shape === "round") {
    const r = Math.min(spec.w, spec.d) / 2;
    return (
      <mesh position={[0, 0.006, cz]}>
        <cylinderGeometry args={[r, r, 0.012, 48]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, 0.006, cz]}>
      <boxGeometry args={[spec.w, 0.012, spec.d]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

/* ── one alcove (recessed bay) — structure lives in KitShell; this is the
 *    content: hero screen (back), floating info (front), props, label, light ── */

/** Per-bay variation (keeps the cohesive grammar; only placement/scale/mood
 *  change) so adjacent + same-side rooms don't look identical. */
const BAY_VARIANTS = [
  { lightBase: "#ffe2c4", lightLerp: 0.35, lightIntensity: 7, screenScale: 1.0, screenY: 1.95 },
  { lightBase: "#cfe4ff", lightLerp: 0.25, lightIntensity: 8, screenScale: 1.12, screenY: 1.85 },
  { lightBase: "#fff4e8", lightLerp: 0.45, lightIntensity: 7, screenScale: 0.92, screenY: 2.15 },
];

function Alcove({ room, animate, mobile = false }: { room: Room; animate: boolean; mobile?: boolean }) {
  const z = room.side < 0 ? -HALF_W : HALF_W;
  const rotY = room.side < 0 ? 0 : Math.PI;
  // On mobile the camera is zoomed in (tighter fov), so pull the screen + info
  // panel toward the bay centre so neither crops at the frame edge.
  const cx = mobile ? 0.62 : 1; // x-offset compression for back-wall content
  const v = room.variant;
  const cfg = BAY_VARIANTS[v];
  const warmTint = useMemo(
    () => new THREE.Color(cfg.lightBase).lerp(new THREE.Color(room.accent), cfg.lightLerp),
    [room.accent, cfg.lightBase, cfg.lightLerp],
  );
  const isExp = room.kind === "experience";

  return (
    <group position={[room.x, 0, z]} rotation-y={rotY}>
      <OpeningFrame accent={room.accent} />

      {/* corner pillars — cover the seams where the corridor wall, niche side
          walls and back wall meet (tiled kit pieces don't form a clean corner).
          The back wall actually sits 0.3 (the wall-tile half-depth) beyond
          ALCOVE_DEPTH, so the rear pillars are pushed out to meet it exactly. */}
      {([
        [-ALCOVE_OPEN_W / 2, 0],
        [ALCOVE_OPEN_W / 2, 0],
        [-ALCOVE_OPEN_W / 2, -(ALCOVE_DEPTH + 0.3)],
        [ALCOVE_OPEN_W / 2, -(ALCOVE_DEPTH + 0.3)],
      ] as [number, number][]).map(([px, pz], i) => (
        <mesh key={i} position={[px, WALL_H / 2, pz]}>
          <boxGeometry args={[0.44, WALL_H, 0.44]} />
          <meshStandardMaterial color="#7b7b87" roughness={0.95} />
        </mesh>
      ))}

      {/* station plaque on the corridor wall beside the opening */}
      <group position={[ALCOVE_OPEN_W / 2 + 0.55, 2.55, 0.07]}>
        <BayPlaque room={room} />
      </group>

      {/* hero screen — the prominent focal point, on the back wall */}
      <group position={[-1.55 * cx, cfg.screenY, -ALCOVE_DEPTH + 0.32]} scale={cfg.screenScale}>
        <RoomScreen room={room} animate={animate} />
      </group>

      {/* floating holographic info — near the opening, in FRONT of the props so
          nothing can occlude the text; tilted toward the approaching camera */}
      <group position={[1.55 * cx, isExp ? 1.95 : 1.78, -1.5]} rotation-y={mobile ? -0.18 : -0.3}>
        {isExp ? <TimelinePanel room={room} /> : <InfoPanel room={room} />}
      </group>

      {/* holographic name label — centred at the top of the bay, facing straight
          out (the info panel keeps its tilt, but the name reads flat) */}
      <group position={[0, 3.2, -0.9]}>
        <RoomLabel room={room} />
      </group>

      {/* flush accent mat (shape per app; Nuremi = map floor) */}
      <BayMat room={room} />

      {/* themed objects (kept low / to the sides) */}
      <group position={[0, 0, -ALCOVE_DEPTH + 1.55]}>
        <RoomProps theme={room.theme} accent={room.accent} animate={animate} />
      </group>

      {/* soft room light (low, so the ceiling stays clean — only the corridor line
          strip reads up top, no circular hotspots) + accent fills */}
      <pointLight
        position={[0, 2.2, -ALCOVE_DEPTH + 1.7]}
        color={warmTint}
        intensity={cfg.lightIntensity}
        distance={ALCOVE_DEPTH + 5}
        decay={2}
      />
      <pointLight
        position={[-1.55, 1.95, -ALCOVE_DEPTH + 1.0]}
        color={room.accent}
        intensity={6}
        distance={4.5}
        decay={2}
      />
      <pointLight
        position={[1.55, 1.8, -0.9]}
        color={room.accent}
        intensity={3.5}
        distance={3.5}
        decay={2}
      />
      {/* neutral fill on the props so the app-specific objects read clearly */}
      <pointLight
        position={[0, 1.5, -ALCOVE_DEPTH + 2.5]}
        color="#eef1f8"
        intensity={9}
        distance={5.5}
        decay={2}
      />
    </group>
  );
}

export default function Walls({ animate = true, mobile = false }: { animate?: boolean; mobile?: boolean }) {
  return (
    <group>
      {ROOMS.map((room) => (
        <Alcove key={room.id} room={room} animate={animate} mobile={mobile} />
      ))}
    </group>
  );
}
