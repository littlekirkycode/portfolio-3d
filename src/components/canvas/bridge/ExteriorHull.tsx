"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ROOMS, ALCOVE_OPEN_W, ALCOVE_DEPTH, HALF_W, WALL_H, GALLERY_X, GALLERY_SIDE, GALLERY_SPAN } from "../hallConfig";

/* ── the ship's outer hull, where a window can see it ────────────────────────
 * The observation gallery's clear glazing looks out along the side of the
 * ship, so the neighbouring bay's outside shows through it. Without a skin
 * that read as bare interior wall tiles. This dresses the outward faces of
 * any gallery-side bay inside the window's view cone with an exterior hull:
 * dark panelled plating, a hull-plate grid and a row of steady running
 * lights. Each plane sits just outside the kit wall's outer face, so from
 * inside the bay the wall tiles hide it.
 * ──────────────────────────────────────────────────────────────────────── */

const HALF = ALCOVE_OPEN_W / 2;
const WALL_T = 0.6; // kit wall slab thickness
const OUT_Z = HALF_W + ALCOVE_DEPTH + WALL_T; // bay back wall outer face (|z|)
const TOP_Y = WALL_H + WALL_T + 0.02; // bay ceiling outer face

function hullTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a3242";
  g.fillRect(0, 0, 512, 512);
  // plate grid: 4×4 plates, alternating tone
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? "#323b4d" : "#262d3b";
      g.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
    }
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 4;
  for (let v = 0; v <= 512; v += 128) {
    g.beginPath();
    g.moveTo(v, 0);
    g.lineTo(v, 512);
    g.moveTo(0, v);
    g.lineTo(512, v);
    g.stroke();
  }
  // rivet rows
  g.fillStyle = "rgba(255,255,255,0.08)";
  for (let v = 10; v < 512; v += 128)
    for (let u = 12; u < 512; u += 16) {
      g.fillRect(u, v, 2, 2);
      g.fillRect(v, u, 2, 2);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

type Face = { pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; mat: THREE.MeshStandardMaterial };

export default function ExteriorHull() {
  const { faces, lightSpots, lights, base } = useMemo(() => {
    const base = hullTexture();
    const S = GALLERY_SIDE;
    const depth = ALCOVE_DEPTH + WALL_T + 0.3;
    const faceMat = (w: number, h: number) => {
      const t = base.clone();
      t.repeat.set(w / 4, h / 4);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.6 });
    };
    const faces: Face[] = [];
    const lightSpots: [number, number, number][] = [];
    for (const r of ROOMS) {
      if (r.side !== S || Math.abs(r.x - GALLERY_X) > GALLERY_SPAN / 2 + HALF + 6) continue;
      const toward = r.x > GALLERY_X ? -1 : 1; // end wall facing the gallery
      const endX = r.x + toward * (HALF + WALL_T / 2 + 0.03);
      const midZ = S * (HALF_W + depth / 2);
      const W = ALCOVE_OPEN_W + WALL_T + 0.1;
      faces.push({ pos: [endX, TOP_Y / 2, midZ], rot: [0, toward < 0 ? -Math.PI / 2 : Math.PI / 2, 0], size: [depth, TOP_Y], mat: faceMat(depth, TOP_Y) });
      faces.push({ pos: [r.x, TOP_Y, midZ], rot: [-Math.PI / 2, 0, 0], size: [W, depth], mat: faceMat(W, depth) });
      faces.push({ pos: [r.x, TOP_Y / 2, S * (OUT_Z + 0.02)], rot: [0, S > 0 ? 0 : Math.PI, 0], size: [W, TOP_Y], mat: faceMat(W, TOP_Y) });
      for (const f of [0.25, 0.5, 0.75]) lightSpots.push([endX, TOP_Y - 0.12, S * (HALF_W + depth * f)]);
    }
    const lights = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffcf9a").multiplyScalar(1.1), toneMapped: false });
    return { faces, lightSpots, lights, base };
  }, []);
  useEffect(
    () => () => {
      faces.forEach((f) => {
        f.mat.map?.dispose();
        f.mat.dispose();
      });
      lights.dispose();
      base.dispose();
    },
    [faces, lights, base],
  );
  return (
    <group>
      {faces.map((f, i) => (
        <mesh key={i} position={f.pos} rotation={f.rot} material={f.mat}>
          <planeGeometry args={f.size} />
        </mesh>
      ))}
      {/* steady running lights along the end wall's roof edge */}
      {lightSpots.map((p, i) => (
        <mesh key={`l${i}`} position={p} material={lights}>
          <sphereGeometry args={[0.05, 10, 10]} />
        </mesh>
      ))}
    </group>
  );
}
