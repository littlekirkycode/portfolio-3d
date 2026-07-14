"use client";

import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { EXPERIENCE, ACHIEVEMENTS, type Project } from "@/lib/constants";
import { withBase } from "@/lib/asset";
import { useIsMobile } from "@/lib/useIsMobile";
import { screenVertex, screenFragment } from "./shaders";
import { familyVar, hexA, roundRect, useTextTexture } from "./canvas2d";
import type { Room } from "./hallConfig";

/* ── per-kind hero screens on each bay's back wall (split out of Walls.tsx,
 *    finding 34): phone/browser/blueprint/terminal/poster renderers + the CRT
 *    shader wiring for the live phone galleries. <RoomScreen/> picks the right
 *    fixture for a room; everything else here is its private dressing. ── */

const INK = "#f4f1ea";

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
      roundRect(ctx, 40, h - 330, chipW, 54, 27);
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
      roundRect(ctx, 170, bar * 0.24, w - 230, bar * 0.52, bar * 0.26);
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
        roundRect(ctx, 720, bar + 190 + i * 34, i === 3 ? 190 : 320, 10, 5);
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
        roundRect(ctx, cx2, cy2, 320, 190, 14);
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

/** Picks each room's hero fixture: live phone gallery, browser mock,
 *  code terminal, CAD blueprint, or the poster card. */
export function RoomScreen({ room, animate }: { room: Room; animate: boolean }) {
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

/* ── code-terminal hologram (Capabilities — software-engineer vibe) ───────── */

function CodeHologram({ accent }: { accent: string }) {
  const render = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      roundRect(ctx, 5, 5, w - 10, h - 10, 18);
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
