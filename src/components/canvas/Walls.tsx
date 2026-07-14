"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { SKILLS, ACHIEVEMENTS, EXPERIENCE, ALLIED_ROOM, type Project, type RoomTheme } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import { scrollRefs } from "@/lib/scrollStore";
import { useIsMobile } from "@/lib/useIsMobile";
import {
  HALF_W,
  WALL_H,
  ALCOVE_OPEN_W,
  ALCOVE_DEPTH,
  ROOMS,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
  focusAt,
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
  // Mobile: half-resolution backing store + anisotropy 4. The portrait camera
  // never resolves these panels above ~half their desktop texel count, and the
  // 4+ RGBA canvas textures per bay are the biggest GPU-memory line item
  // (finding 6). ctx.setTransform scales EVERY painter's coordinates/fonts, so
  // the drawn layout is identical — only the backing resolution drops.
  const mobile = useIsMobile();
  const scale = mobile ? 0.5 : 1;
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = scale === 1 ? 16 : 4;
    return tex;
  }, [width, height, scale]);
  useEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const draw = () => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
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
  }, [texture, render, width, height, scale]);
  return texture;
}

/* ── hero screen on the back wall ───────────────────────────────────────── */

function Bezel({ w, h, accent }: { w: number; h: number; accent: string }) {
  const rim = useMemo(() => new THREE.Color(accent).multiplyScalar(0.85), [accent]);
  return (
    <group>
      {/* dark casing */}
      <mesh position-z={-0.06}>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.12]} />
        <meshStandardMaterial color="#070709" roughness={0.55} metalness={0.5} />
      </mesh>
      {/* glowing accent rim → reads as a powered display (dimmed so bloom stays soft) */}
      <mesh position-z={-0.01}>
        <boxGeometry args={[w + 0.22, h + 0.22, 0.04]} />
        <meshBasicMaterial color={rim} toneMapped={false} />
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
  const mobile = useIsMobile();
  const urls = useMemo(
    () => [project.image as string, ...(project.gallery ?? [])].map(withBase),
    [project],
  );
  const loaded = useTexture(urls);
  const list = useMemo(() => {
    const arr = Array.isArray(loaded) ? loaded : [loaded];
    arr.forEach((t) => {
      // anisotropy capped on mobile (finding 6) — the phone screens are viewed
      // near head-on there, so the high-tap filtering never pays for itself
      t.anisotropy = mobile ? 4 : 16;
      t.needsUpdate = true;
    });
    return arr;
  }, [loaded, mobile]);
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
  const rim = useMemo(() => new THREE.Color(accent).multiplyScalar(0.85), [accent]);
  return (
    <group>
      {/* glowing power rim (dimmed so bloom stays soft) */}
      <mesh position-z={-0.02}>
        <boxGeometry args={[IMG_W + 0.22, IMG_H + 0.26, 0.05]} />
        <meshBasicMaterial color={rim} toneMapped={false} />
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
      const p = room.project;
      // callout lines: project metrics when available, else a short tagline
      const callouts: string[] =
        room.kind === "experience"
          ? [`${EXPERIENCE.length} roles · 2021 — Now`, "Founder → Product Engineer"]
          : room.kind === "trophy"
            ? [ACHIEVEMENTS[0], ACHIEVEMENTS[1]]
            : p?.metrics?.length
              ? p.metrics.slice(0, 2).map((m) => `${m.value} — ${m.label}`)
              : p
                ? [p.tech.join(" · "), `Built ${p.year}`]
                : [];
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, room.accent);
      g.addColorStop(0.62, "#14121a");
      g.addColorStop(1, "#0a0a10");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // huge translucent index watermark fills the (formerly empty) middle
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = hexA(room.accent, 0.4);
      ctx.font = `700 400px ${ser}`;
      ctx.fillText(room.index, w / 2, h * 0.46);
      ctx.textAlign = "left";
      const og = ctx.createLinearGradient(0, h * 0.35, 0, h);
      og.addColorStop(0, "rgba(8,8,14,0)");
      og.addColorStop(1, "rgba(8,8,14,0.92)");
      ctx.fillStyle = og;
      ctx.fillRect(0, 0, w, h);
      // corner ticks → drafted-poster framing
      ctx.strokeStyle = hexA(room.accent, 0.55);
      ctx.lineWidth = 3;
      for (const [tx, ty, sx, sy] of [[28, 28, 1, 1], [w - 28, 28, -1, 1], [28, h - 28, 1, -1], [w - 28, h - 28, -1, -1]] as const) {
        ctx.beginPath();
        ctx.moveTo(tx + sx * 26, ty);
        ctx.lineTo(tx, ty);
        ctx.lineTo(tx, ty + sy * 26);
        ctx.stroke();
      }
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.font = `500 30px ${mono}`;
      ctx.fillText(`(${room.index})`, 40, 40);
      // fine rule under the index
      ctx.strokeStyle = "rgba(244,241,234,0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40, 96);
      ctx.lineTo(w - 40, 96);
      ctx.stroke();
      // category chip
      ctx.font = `500 26px ${mono}`;
      const cat = room.category.toUpperCase();
      const chipW = ctx.measureText(cat).width + 48;
      rr(ctx, 40, h - 330, chipW, 54, 27);
      ctx.strokeStyle = hexA(room.accent, 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = room.accent;
      ctx.fillText(cat, 64, h - 330 + 15);
      // metric / tagline callouts
      ctx.font = `500 28px ${mono}`;
      let cy = h - 250;
      for (const c of callouts.slice(0, 2)) {
        ctx.fillStyle = room.accent;
        ctx.fillText("◆", 40, cy + 2);
        ctx.fillStyle = "rgba(244,241,234,0.90)";
        ctx.fillText(c, 86, cy);
        cy += 52;
      }
      ctx.fillStyle = INK;
      ctx.textBaseline = "alphabetic";
      ctx.font = `700 118px ${ser}`;
      ctx.fillText(room.title, 38, h - 56);
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
      // page body — minimal editorial storefront mock
      ctx.fillStyle = "#100d12";
      ctx.fillRect(0, bar, w, h - bar);
      const g = ctx.createLinearGradient(0, bar, 0, h);
      g.addColorStop(0, hexA(project.accent, 0.2));
      g.addColorStop(0.45, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, bar, w, h - bar);
      // thin nav: brand left, fake links right
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = INK;
      ctx.font = `700 34px ${ser}`;
      ctx.fillText(project.title.toUpperCase(), 52, bar + 56);
      ctx.fillStyle = "rgba(244,241,234,0.55)";
      ctx.font = `500 20px ${mono}`;
      ctx.textAlign = "right";
      ctx.fillText("RINGS      NECKLACES      JOURNAL      CART (0)", w - 52, bar + 52);
      ctx.textAlign = "left";
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(52, bar + 82);
      ctx.lineTo(w - 52, bar + 82);
      ctx.stroke();
      // large serif headline block + kicker
      ctx.fillStyle = project.accent;
      ctx.font = `500 22px ${mono}`;
      ctx.fillText(`${project.category.toUpperCase()} — ${project.year}`, 52, bar + 138);
      ctx.fillStyle = INK;
      ctx.font = `700 78px ${ser}`;
      ctx.fillText("Fine jewellery,", 48, bar + 224);
      ctx.fillText("quietly radiant.", 48, bar + 306);
      // faint editorial copy lines (right column)
      ctx.fillStyle = "rgba(244,241,234,0.20)";
      for (let i = 0; i < 4; i++) {
        rr(ctx, 720, bar + 190 + i * 34, i === 3 ? 190 : 320, 10, 5);
        ctx.fill();
      }
      // three product cards with diamond glyphs
      const diamond = (dx: number, dy: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(dx - r, dy - r * 0.35);
        ctx.lineTo(dx - r * 0.5, dy - r);
        ctx.lineTo(dx + r * 0.5, dy - r);
        ctx.lineTo(dx + r, dy - r * 0.35);
        ctx.lineTo(dx, dy + r);
        ctx.closePath();
        ctx.stroke();
        // crown line + facets
        ctx.beginPath();
        ctx.moveTo(dx - r, dy - r * 0.35);
        ctx.lineTo(dx + r, dy - r * 0.35);
        ctx.moveTo(dx - r * 0.5, dy - r);
        ctx.lineTo(dx, dy + r);
        ctx.moveTo(dx + r * 0.5, dy - r);
        ctx.lineTo(dx, dy + r);
        ctx.stroke();
      };
      const cards: [string, string][] = [["SÉRAPHINE", "£640"], ["AURELIA", "£480"], ["ODESSA", "£720"]];
      cards.forEach(([name, price], i) => {
        const cx2 = 52 + i * 342;
        const cy2 = bar + 356;
        rr(ctx, cx2, cy2, 320, 190, 14);
        ctx.fillStyle = "rgba(244,241,234,0.05)";
        ctx.fill();
        ctx.strokeStyle = "rgba(244,241,234,0.16)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = hexA(project.accent, 0.9);
        ctx.lineWidth = 2.5;
        diamond(cx2 + 160, cy2 + 74, 32);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(244,241,234,0.88)";
        ctx.font = `500 20px ${mono}`;
        ctx.fillText(name, cx2 + 160, cy2 + 148);
        ctx.fillStyle = "rgba(244,241,234,0.5)";
        ctx.fillText(price, cx2 + 160, cy2 + 176);
        ctx.textAlign = "left";
      });
      // footer rule + visit cue
      ctx.strokeStyle = "rgba(244,241,234,0.14)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(52, h - 62);
      ctx.lineTo(w - 52, h - 62);
      ctx.stroke();
      ctx.fillStyle = project.accent;
      ctx.font = `600 24px ${mono}`;
      ctx.fillText("VISIT  ↗", 52, h - 24);
      ctx.fillStyle = "rgba(244,241,234,0.4)";
      ctx.font = `400 20px ${mono}`;
      ctx.textAlign = "right";
      ctx.fillText(`© ${project.title.toUpperCase()}`, w - 52, h - 24);
      ctx.textAlign = "left";
    },
    [project],
  );
  const tex = useTextTexture(1120, 760, render);
  const rim = useMemo(() => new THREE.Color(project.accent).multiplyScalar(0.85), [project.accent]);
  return (
    <group>
      <mesh position-z={-0.02}>
        <boxGeometry args={[2.42, 1.72, 0.04]} />
        <meshBasicMaterial color={rim} toneMapped={false} />
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
    // trans=1 (filmstrip wipe) on EVERY phone — the rand() dissolve (old
    // variant-0/2 path) sprays white speckle across the dark screenshots for
    // the whole 0.55s transition, every 4s (QA: "white spots / fuzzy posters").
    return (
      <PhoneFrame accent={room.accent}>
        <ScreenImage project={p} animate={animate} trans={1} />
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
        // wrapped item lines — the joined lists used to run past the glass
        // border; wrapText keeps every row inside the rounded rect
        y = 348;
        for (const grp of SKILLS) {
          ctx.fillStyle = room.accent;
          ctx.font = `500 28px ${mono}`;
          ctx.fillText(grp.group.toUpperCase(), padX, y);
          ctx.fillStyle = "rgba(244,241,234,0.88)";
          ctx.font = `400 34px ${sans}`;
          y = wrapText(ctx, grp.items.join(" · "), padX, y + 38, w - padX * 2, 44) + 12;
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
      // two-pass draw: soft accent halo + near-white core, so low-chroma accents
      // (Capabilities grey) still read clearly without going neon
      const core = "#" + new THREE.Color(room.accent).lerp(new THREE.Color(INK), 0.72).getHexString();
      const label = room.title.toUpperCase();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 118px ${ser}`;
      ctx.fillStyle = room.accent;
      ctx.shadowColor = room.accent;
      ctx.shadowBlur = 42;
      ctx.fillText(label, w / 2, h / 2);
      ctx.fillText(label, w / 2, h / 2); // second stamp deepens the halo
      ctx.shadowBlur = 0;
      ctx.fillStyle = core;
      ctx.fillText(label, w / 2, h / 2);
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

/* ── accent light spill at each bay threshold ─────────────────────────────
 * Colourist fix for "accent colours stop dead at the opening": an additive
 * gradient quad lying flat on the CORRIDOR floor, fading ~4 units into the
 * hall, plus two thin emissive jamb strips on the OUTER edges of the opening
 * frame that catch the eye obliquely from down the corridor. ONE shared
 * falloff texture + shared geometries at module level; only the two small
 * per-accent materials vary per bay. */

const SPILL_DEPTH = 4;

// Shared falloff: radial gradient anchored at the threshold edge. Canvas
// top-centre = UV (0.5, 1) = the plane's local +y, which the -PI/2 X-rotation
// maps to -z (the wall side) — so the bright end hugs the threshold and the
// glow dies out hall-side. Lazy singleton: module scope runs during SSR where
// `document` doesn't exist; Canvas children only execute client-side.
let spillTexture: THREE.CanvasTexture | null = null;
function getSpillTexture(): THREE.CanvasTexture {
  if (spillTexture) return spillTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 0, 0, 64, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  spillTexture = new THREE.CanvasTexture(canvas);
  return spillTexture;
}

const spillGeometry = /* @__PURE__ */ new THREE.PlaneGeometry(ALCOVE_OPEN_W, SPILL_DEPTH);
const jambGeometry = /* @__PURE__ */ new THREE.BoxGeometry(0.05, WALL_H, 0.16);

function AccentSpill({ accent }: { accent: string }) {
  // floor glow — additive so it reads as light on the deck, not a decal rug
  const spillMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getSpillTexture(),
        color: accent,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [accent],
  );
  // jamb strips — genuine emitters, dimmed so bloom (threshold 0.5) stays tight
  const jambMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accent).multiplyScalar(0.75),
        toneMapped: false,
      }),
    [accent],
  );
  const half = ALCOVE_OPEN_W / 2;
  return (
    <group>
      <mesh
        geometry={spillGeometry}
        material={spillMat}
        position={[0, 0.02, SPILL_DEPTH / 2]}
        rotation-x={-Math.PI / 2}
      />
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={jambGeometry}
          material={jambMat}
          position={[s * (half + 0.12), WALL_H / 2, 0.1]}
        />
      ))}
    </group>
  );
}

/* ── code-terminal hologram (Capabilities — software-engineer vibe) ───────── */

function CodeHologram({ accent }: { accent: string }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      rr(ctx, 5, 5, w - 10, h - 10, 18);
      ctx.fillStyle = "rgba(7,11,20,0.85)";
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
      ctx.font = `500 42px ${mono}`;
      let y = 116;
      for (const ln of lines) {
        let x = 48;
        for (const [t, c] of ln) {
          ctx.fillStyle = c;
          ctx.fillText(t, x, y);
          x += ctx.measureText(t).width;
        }
        y += 62;
      }
    },
    [accent],
  );
  const tex = useTextTexture(900, 612, render);
  return (
    <mesh>
      <planeGeometry args={[2.7, 1.83]} />
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
      ctx.fillStyle = "#10131f";
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
      ctx.strokeStyle = hexA(accent, 0.4);
      ctx.lineWidth = 3;
      for (let i = 1; i < 14; i++) line((cw * i) / 14, 0, (cw * i) / 14, ch);
      for (let j = 1; j < 9; j++) line(0, (ch * j) / 9, cw, (ch * j) / 9);
      // major avenues
      ctx.strokeStyle = hexA(accent, 0.6);
      ctx.lineWidth = 7;
      line(0, ch * 0.33, cw, ch * 0.33);
      line(cw * 0.5, 0, cw * 0.5, ch);
      ctx.lineWidth = 5;
      line(0, ch * 0.08, cw, ch * 0.78); // diagonal boulevard
      // glowing navigation route
      ctx.shadowColor = accent;
      ctx.shadowBlur = 26;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 12;
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
        ctx.fillStyle = hi ? accent : "#10131f";
        ctx.beginPath();
        ctx.arc(x, y - r * 1.85, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      };
      pin(cw * 0.2, ch * 0.8, 20, false); // start
      pin(cw * 0.5, ch * 0.55, 18, false); // waypoint
      pin(cw * 0.72, ch * 0.18, 30, true); // destination (highlighted)
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
  // dark platform slab + softened emissive accent rim → lit exhibit base, not a rug
  const color = useMemo(() => new THREE.Color(room.accent).multiplyScalar(0.11), [room.accent]);
  const rim = useMemo(() => new THREE.Color(room.accent).multiplyScalar(0.85), [room.accent]);
  const cz = -ALCOVE_DEPTH + 1.7; // under the prop cluster
  if (spec.shape === "map") return <MapFloor accent={room.accent} w={spec.w} d={spec.d} z={cz} />;
  if (spec.shape === "round") {
    const r = Math.min(spec.w, spec.d) / 2;
    return (
      <group position={[0, 0, cz]}>
        <mesh position-y={0.006}>
          <cylinderGeometry args={[r, r, 0.012, 48]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
        {/* thin glowing ring around the platform edge */}
        <mesh position-y={0.014} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[r - 0.015, r + 0.05, 64]} />
          <meshBasicMaterial color={rim} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[0, 0, cz]}>
      {/* slightly larger emissive underlay → a ~5cm glowing rim around the slab */}
      <mesh position-y={0.003}>
        <boxGeometry args={[spec.w + 0.1, 0.006, spec.d + 0.1]} />
        <meshBasicMaterial color={rim} toneMapped={false} />
      </mesh>
      <mesh position-y={0.006}>
        <boxGeometry args={[spec.w, 0.012, spec.d]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    </group>
  );
}

/* ── one alcove (recessed bay) — structure lives in KitShell; this is the
 *    content: hero screen (back), floating info (front), props, label, light ── */

/** Per-bay variation (keeps the cohesive grammar; only placement/scale/mood
 *  change) so adjacent + same-side rooms don't look identical. */
/** Intensities tuned down from 7-8: with decay 2 the old values pushed
 *  white-ish props (chairs, plants, kettlebells) past linear ~10 at prop
 *  distance and they clipped to flat #FFF (QA: blown-out bay props). */
const BAY_VARIANTS = [
  { lightBase: "#ffe2c4", lightLerp: 0.35, lightIntensity: 4.5, screenScale: 1.0, screenY: 1.95 },
  { lightBase: "#cfe4ff", lightLerp: 0.25, lightIntensity: 5, screenScale: 1.12, screenY: 1.85 },
  { lightBase: "#fff4e8", lightLerp: 0.45, lightIntensity: 4.5, screenScale: 0.92, screenY: 2.15 },
];

/* ── focused-bay light pool ────────────────────────────────────────────────
 * The bays used to mount 4 pointLights EACH — 36 lights that every lit
 * fragment in the scene iterated, every frame (three.js uploads ALL visible
 * lights as one uniform array; `distance` only bounds the falloff math, not
 * the loop). ONE fixed pool of 4 lights now serves whichever bay is focused:
 * a useFrame repositions/retints the pool to the focused room's recipe and
 * scales intensity by focusAt's ease, so the light fades in with the head-
 * turn and the retarget always happens while the pool is dark. Unfocused
 * bays go unlit — by design: behind fog + grazing angles only their emissive
 * dressing (opening frames, jambs, screens) reads from the corridor anyway.
 *
 * INVARIANT (three.js): the number of mounted lights must stay compile-time
 * constant. The renderer keys its shader-program cache on light COUNT, so
 * mounting/unmounting or .visible-toggling a light recompiles every lit
 * material mid-scroll (a visible hitch). Dim with intensity=0 instead, and
 * never put a light inside a visibility-gated group.
 */

const POOL_SLOTS = [
  // Local-space alcove positions + falloff, mirroring the old per-bay rig 1:1:
  // warm room light, screen accent, panel accent, neutral prop fill.
  { pos: [0, 2.2, -ALCOVE_DEPTH + 1.7], distance: ALCOVE_DEPTH + 5 },
  { pos: [-1.55, 1.95, -ALCOVE_DEPTH + 1.0], distance: 4.5 },
  { pos: [1.55, 1.8, -0.9], distance: 3.5 },
  { pos: [0, 1.5, -ALCOVE_DEPTH + 2.5], distance: 5.5 },
] as const;

const PROP_FILL_TINT = /* @__PURE__ */ new THREE.Color("#eef1f8");

type BayLightSpec = { pos: THREE.Vector3; color: THREE.Color; intensity: number };

/** Per-room 4-light recipes in WORLD space (the pool mounts at the scene root,
 *  not inside the mirrored/rotated alcove groups). Alcove groups sit at
 *  [room.x, 0, side*HALF_W] with rotY 0 (-z side) or PI (+z side); the PI turn
 *  mirrors local x AND z. */
const BAY_LIGHT_RECIPES: BayLightSpec[][] = ROOMS.map((room) => {
  const cfg = BAY_VARIANTS[room.variant];
  const warm = new THREE.Color(cfg.lightBase).lerp(new THREE.Color(room.accent), cfg.lightLerp);
  const accent = new THREE.Color(room.accent);
  const m = room.side < 0 ? 1 : -1;
  const world = ([lx, ly, lz]: readonly [number, number, number]) =>
    new THREE.Vector3(room.x + m * lx, ly, room.side * HALF_W + m * lz);
  const tints = [warm, accent, accent, PROP_FILL_TINT];
  const intensities = [cfg.lightIntensity, 4.5, 3, 5.5];
  return POOL_SLOTS.map((slot, i) => ({
    pos: world(slot.pos),
    color: tints[i],
    intensity: intensities[i],
  }));
});

function BayLightPool() {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const roomIdx = useRef(-1);
  useFrame(() => {
    const f = focusAt(scrollRefs.progress);
    const idx = f.room ? ROOMS.indexOf(f.room) : roomIdx.current;
    if (idx < 0) return; // before the first focus band: pool parked dark
    const recipe = BAY_LIGHT_RECIPES[idx];
    if (idx !== roomIdx.current) {
      // retarget while dark — ease is 0 whenever the focused room changes
      roomIdx.current = idx;
      recipe.forEach((spec, i) => {
        const l = lights.current[i];
        if (!l) return;
        l.position.copy(spec.pos);
        l.color.copy(spec.color);
      });
    }
    recipe.forEach((spec, i) => {
      const l = lights.current[i];
      if (l) l.intensity = spec.intensity * f.ease;
    });
  });
  return (
    <>
      {POOL_SLOTS.map((slot, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          intensity={0}
          distance={slot.distance}
          decay={2}
        />
      ))}
    </>
  );
}

/** Bay-content distance gate: past HIDE the recessed interior is invisible
 *  from the corridor (grazing angle + fog), so skip submitting its ~40-60
 *  draws. SHOW < HIDE gives hysteresis so the threshold never flickers. */
const BAY_HIDE_DIST = 40;
const BAY_SHOW_DIST = 37;

function Alcove({ room, animate, mobile = false }: { room: Room; animate: boolean; mobile?: boolean }) {
  const z = room.side < 0 ? -HALF_W : HALF_W;
  const rotY = room.side < 0 ? 0 : Math.PI;
  const v = room.variant;
  const cfg = BAY_VARIANTS[v];
  const isExp = room.kind === "experience";

  // Distance-gate the bay content (finding 3). The OpeningFrame/AccentSpill
  // emitters stay OUT of the gated group — they're the corridor-facing
  // wayfinding you can see from far down the hall — and the bay lights live
  // in <BayLightPool/> (lights must never be visibility-toggled: light-count
  // changes recompile every lit material). Mesh .visible toggling is safe.
  const contentRef = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    const g = contentRef.current;
    if (!g) return;
    const d = Math.abs(camera.position.x - room.x);
    if (g.visible) {
      if (d > BAY_HIDE_DIST) g.visible = false;
    } else if (d < BAY_SHOW_DIST) {
      g.visible = true;
    }
  });

  return (
    <group position={[room.x, 0, z]} rotation-y={rotY}>
      <OpeningFrame accent={room.accent} />
      <AccentSpill accent={room.accent} />

      <group ref={contentRef}>

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

      {/* station plaque on the corridor wall beside the opening — SKIPPED when
          the spot falls inside the observation-gallery cut: there's no wall
          there, so the plaque floated over the glazing (QA: "(06) CAPABILITIES
          going into the window"). Room 5's bay starts flush at the gallery's
          far edge, so it has no clear wall strip on either side. */}
      {(() => {
        const plaqueX =
          room.side === 1
            ? room.x - (ALCOVE_OPEN_W / 2 + 0.55)
            : room.x + (ALCOVE_OPEN_W / 2 + 0.55);
        const overGallery =
          room.side === GALLERY_SIDE &&
          Math.abs(plaqueX - GALLERY_X) < GALLERY_SPAN / 2 + 0.6;
        return overGallery ? null : (
          <group position={[ALCOVE_OPEN_W / 2 + 0.55, 2.55, 0.07]}>
            <BayPlaque room={room} />
          </group>
        );
      })()}

      {/* DESKTOP: screen left + info panel right, side by side (landscape).
          MOBILE: stack them — screen high & centred, info panel centred below &
          facing straight out — so the wide panel fits a tall portrait frame
          instead of clipping off the right edge. */}
      {/* hero screen — mobile sizes assume the Rig's portrait step-in (camera
          ~1.9 from the opening): screen slightly bigger + higher into the dead
          band under the ceiling line. */}
      <group
        position={mobile ? [0, 3.2, -ALCOVE_DEPTH + 0.32] : [-1.55, cfg.screenY, -ALCOVE_DEPTH + 0.32]}
        scale={mobile ? cfg.screenScale * 0.9 : cfg.screenScale}
      >
        <RoomScreen room={room} animate={animate} />
      </group>

      {/* floating holographic info — in FRONT of the props so nothing occludes it.
          On mobile it's smaller and pushed DEEPER than the old squash-era spot:
          with the step-in camera a panel at z −0.3 filled the full frame width,
          colliding with the screen above and the hop chevrons at the right edge. */}
      <group
        position={mobile ? [0, 1.0, -0.85] : [1.55, isExp ? 1.95 : 1.78, -1.5]}
        rotation-y={mobile ? 0 : -0.3}
        scale={mobile ? 0.6 : 1}
      >
        {isExp ? <TimelinePanel room={room} /> : <InfoPanel room={room} />}
      </group>

      {/* holographic name label — centred at the top of the bay. Hidden on mobile
          where the vertical stack needs that height for the raised screen (the
          title already shows on the screen + info panel). */}
      {!mobile && (
        <group position={[0, 3.2, -0.9]}>
          <RoomLabel room={room} />
        </group>
      )}

      {/* flush accent mat (shape per app; Nuremi = map floor) */}
      <BayMat room={room} />

      {/* themed objects (kept low / to the sides) */}
      <group position={[0, 0, -ALCOVE_DEPTH + 1.55]}>
        <RoomProps theme={room.theme} accent={room.accent} animate={animate} />
      </group>
      </group>

      {/* bay lighting comes from the shared <BayLightPool/> — the old four
          per-bay pointLights (warm room / screen accent / panel accent / prop
          fill) live on as its per-room recipe (BAY_LIGHT_RECIPES). */}
    </group>
  );
}

export default function Walls({ animate = true, mobile = false }: { animate?: boolean; mobile?: boolean }) {
  return (
    <group>
      <BayLightPool />
      {ROOMS.map((room) => (
        <Alcove key={room.id} room={room} animate={animate} mobile={mobile} />
      ))}
    </group>
  );
}
