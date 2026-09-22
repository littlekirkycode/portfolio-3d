"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { Board, Stand, fonts, type Painter } from "./holo";

/* ── Xuabelle: an editorial jewellery storefront ─────────────────────────────
 * The room becomes the boutique the site sells from: each piece under its own
 * museum vitrine (glass, gilt edges, a cap downlight over the piece)
 * and a warm lightbox poster with the storefront's own line — refined,
 * editorial, quiet. */

const GOLD = "#d8b673";

const glassGeo = /* @__PURE__ */ new THREE.BoxGeometry(0.58, 0.62, 0.58);
const glassEdges = /* @__PURE__ */ new THREE.EdgesGeometry(glassGeo);

/** Glass case that sits on a plinth top; children are the displayed piece. */
export function Vitrine({ children, label }: { children: ReactNode; label?: string }) {
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#cfd8ff",
        transparent: true,
        opacity: 0.07,
        roughness: 0.05,
        metalness: 0.9,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => glass.dispose(), [glass]);
  return (
    <group>
      {children}
      <group position={[0, 0.31, 0]}>
        <mesh geometry={glassGeo} material={glass} />
        <lineSegments geometry={glassEdges}>
          <lineBasicMaterial color={GOLD} transparent opacity={0.85} toneMapped={false} />
        </lineSegments>
      </group>
      {/* cap + downlight */}
      <mesh position={[0, 0.635, 0]}>
        <boxGeometry args={[0.62, 0.035, 0.62]} />
        <meshStandardMaterial color="#1c1714" roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.615, 0]} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.07, 24]} />
        <meshBasicMaterial color="#fff2da" toneMapped={false} />
      </mesh>
      {label && <Tag label={label} />}
    </group>
  );
}

function Tag({ label }: { label: string }) {
  const paint = useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono } = fonts();
      ctx.fillStyle = "rgba(20,14,12,0.85)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = GOLD;
      ctx.font = `600 ${Math.round(h * 0.42)}px ${mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, w / 2, h / 2 + 1);
    },
    [label],
  );
  return (
    <Board w={0.4} h={0.07} res={400} paint={paint} accent={GOLD} slab={false} position={[0, 0.02, 0.3]} rotation-x={-0.5} />
  );
}

function usePosterPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono } = fonts();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2a1512");
      g.addColorStop(1, "#140b0a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 6;
      ctx.strokeRect(18, 18, w - 36, h - 36);
      ctx.lineWidth = 2;
      ctx.strokeRect(34, 34, w - 68, h - 68);

      ctx.textAlign = "center";
      ctx.fillStyle = GOLD;
      ctx.font = `500 26px ${mono}`;
      ctx.fillText("THE  AW26  EDIT", w / 2, 108);

      // line-art solitaire
      const cx = w / 2;
      const cy = h * 0.42;
      ctx.strokeStyle = "#f1dfb8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 40, 118, 118, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 52, cy - 78);
      ctx.lineTo(cx + 52, cy - 78);
      ctx.lineTo(cx + 74, cy - 50);
      ctx.lineTo(cx, cy + 2);
      ctx.lineTo(cx - 74, cy - 50);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 74, cy - 50);
      ctx.lineTo(cx + 74, cy - 50);
      ctx.moveTo(cx - 22, cy - 78);
      ctx.lineTo(cx - 30, cy - 50);
      ctx.lineTo(cx, cy + 2);
      ctx.lineTo(cx + 30, cy - 50);
      ctx.lineTo(cx + 22, cy - 78);
      ctx.stroke();

      ctx.fillStyle = "#f6ead2";
      ctx.font = `700 92px ${ser}`;
      ctx.fillText("XUABELLE", w / 2, h * 0.72);
      ctx.font = `italic 400 44px ${ser}`;
      ctx.fillStyle = "#e9d3a6";
      ctx.fillText("Fine jewellery,", w / 2, h * 0.72 + 70);
      ctx.fillText("quietly radiant.", w / 2, h * 0.72 + 122);
      ctx.fillStyle = accent;
      ctx.font = `500 22px ${mono}`;
      ctx.fillText("XUABELLE.VERCEL.APP", w / 2, h - 70);
    },
    [accent],
  );
}

export default function XuabelleRoom({ accent }: { accent: string }) {
  const poster = usePosterPainter(accent);
  return (
    <group position={[-3.2, 0, -0.62]} rotation-y={0.85}>
      <Stand top={0.72} accent={GOLD} />
      {/* lightbox: frame + poster + warm edge glow */}
      <mesh position={[0, 1.55, -0.03]}>
        <boxGeometry args={[1.12, 1.7, 0.05]} />
        <meshStandardMaterial color="#1a1310" roughness={0.4} metalness={0.7} />
      </mesh>
      <Board w={1.04} h={1.62} paint={poster} accent={accent} slab={false} position={[0, 1.55, 0.001]} />
    </group>
  );
}
