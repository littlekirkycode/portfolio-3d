"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roundRect, useTextTexture } from "../../canvas2d";
import { INK, accentInk, fonts, track } from "../holo";
import { Seedlings, useDeferredDispose, type NurseryMats, type Sprout } from "./kit";

/* ── the group: five cloches on one table ─────────────────────────────────────
 * Social accountability made physical. A low walnut-topped table holds five
 * glass bell cloches — one per member of the challenge group, each sheltering
 * its own seedling. A single accent ring runs through all five bases (you
 * don't relapse alone) — the table's only light; every base is a machined
 * steel check-in ring, and the drum's plaque says it: 5/5 checked in.
 * ──────────────────────────────────────────────────────────────────────── */

export const MEMBERS = 5;
const R = 0.56; // table radius
const H = 0.3; // table height
const RING = 0.37; // cloche ring radius
const SAUCER_H = 0.022;
const PLQ_CW = 640;
const PLQ_CH = 120;
const PLQ_W = 0.8;
const PLQ_H = PLQ_W * (PLQ_CH / PLQ_CW);

const spots = Array.from({ length: MEMBERS }, (_, i) => {
  const a = Math.PI / 2 + (i / MEMBERS) * Math.PI * 2;
  return { x: Math.cos(a) * RING, z: Math.sin(a) * RING };
});

/** Bell-jar profile (radius, height) for LatheGeometry. */
const BELL = [
  [0.095, 0],
  [0.095, 0.15],
  [0.091, 0.185],
  [0.079, 0.215],
  [0.058, 0.24],
  [0.03, 0.254],
  [0.001, 0.258],
].map(([r, y]) => new THREE.Vector2(r, y));

function useLabelPainter(accent: string) {
  return useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const { ser, mono } = fonts();
      roundRect(ctx, 2, 2, w - 4, h - 4, 14);
      ctx.fillStyle = "#10141f";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(244,241,234,0.2)";
      ctx.stroke();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `600 86px ${ser}`;
      const nw = ctx.measureText("5/5").width;
      ctx.font = `600 56px ${mono}`;
      track(ctx, 0.06, 56);
      const lw = ctx.measureText("CHECKED IN").width;
      const x0 = (w - (nw + 26 + lw)) / 2;
      ctx.fillStyle = accentInk(accent, 0.2);
      ctx.fillText("CHECKED IN", x0 + nw + 26, h / 2 + 3);
      track(ctx, 0);
      ctx.fillStyle = INK;
      ctx.font = `600 86px ${ser}`;
      ctx.fillText("5/5", x0, h / 2 + 4);
    },
    [accent],
  );
}

export function GroupCircle({ accent, mats, animate }: { accent: string; mats: NurseryMats; animate: boolean }) {
  const saucerRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const domeRef = useRef<THREE.InstancedMesh>(null);
  const knobRef = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(
    () => ({
      saucer: new THREE.CylinderGeometry(0.1, 0.092, SAUCER_H, 28),
      ring: new THREE.TorusGeometry(0.1, 0.004, 6, 40),
      dome: new THREE.LatheGeometry(BELL, 32),
      knob: new THREE.SphereGeometry(0.016, 14, 10),
    }),
    [],
  );
  useDeferredDispose(geos);
  const sprouts = useMemo<Sprout[]>(
    () => spots.map((s, i) => ({ x: s.x, y: H + SAUCER_H, z: s.z, age: 0.42 + 0.09 * ((i * 3) % 5), seed: 90 + i * 11 })),
    [],
  );
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    spots.forEach((s, i) => {
      o.rotation.set(0, 0, 0);
      o.position.set(s.x, H + SAUCER_H / 2, s.z);
      o.updateMatrix();
      saucerRef.current?.setMatrixAt(i, o.matrix);
      o.position.set(s.x, H + SAUCER_H, s.z);
      o.updateMatrix();
      domeRef.current?.setMatrixAt(i, o.matrix);
      o.position.set(s.x, H + SAUCER_H + 0.266, s.z);
      o.updateMatrix();
      knobRef.current?.setMatrixAt(i, o.matrix);
      o.position.set(s.x, H + SAUCER_H + 0.002, s.z);
      o.rotation.set(Math.PI / 2, 0, 0);
      o.updateMatrix();
      ringRef.current?.setMatrixAt(i, o.matrix);
    });
    for (const r of [saucerRef, ringRef, domeRef, knobRef]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, []);

  const label = useLabelPainter(accent);
  const labelTex = useTextTexture(PLQ_CW, PLQ_CH, label);
  const bodyH = H - 0.085;

  return (
    <group>
      {/* recessed dark plinth: a quiet shadow gap (same language as the bed) */}
      <mesh position={[0, 0.03, 0]} material={mats.plinth}>
        <cylinderGeometry args={[R - 0.06, R - 0.06, 0.06, 48]} />
      </mesh>
      {/* body + walnut top with a machined edge */}
      <mesh position={[0, 0.06 + (H - 0.085) / 2, 0]} material={mats.walnut}>
        <cylinderGeometry args={[R, R - 0.015, H - 0.085, 48]} />
      </mesh>
      <mesh position={[0, H - 0.0125, 0]} material={mats.lip}>
        <cylinderGeometry args={[R + 0.006, R + 0.006, 0.025, 48]} />
      </mesh>
      <mesh position={[0, H + 0.001, 0]} rotation-x={-Math.PI / 2} material={mats.body}>
        <circleGeometry args={[R - 0.012, 48]} />
      </mesh>
      {/* the shared ring through every member's base */}
      <mesh position={[0, H + 0.003, 0]} rotation-x={Math.PI / 2} material={mats.ledTrim}>
        <torusGeometry args={[RING, 0.0035, 6, 96]} />
      </mesh>
      {/* check-in plaque wrapped onto the drum's front face */}
      <mesh position={[0, 0.06 + bodyH / 2, 0]}>
        <cylinderGeometry args={[R + 0.003 - 0.015 * (0.5 - PLQ_H / bodyH / 2), R - 0.012 + 0.015 * (0.5 - PLQ_H / bodyH / 2), PLQ_H, 24, 1, true, -PLQ_W / R / 2, PLQ_W / R]} />
        <meshBasicMaterial map={labelTex} color="#dcdcdc" toneMapped={false} />
      </mesh>
      <instancedMesh ref={saucerRef} args={[geos.saucer, mats.ceramic, MEMBERS]} />
      <instancedMesh ref={ringRef} args={[geos.ring, mats.lip, MEMBERS]} />
      <Seedlings sprouts={sprouts} mats={mats} animate={animate} scale={0.8} />
      <instancedMesh ref={knobRef} args={[geos.knob, mats.lip, MEMBERS]} />
      <instancedMesh ref={domeRef} args={[geos.dome, mats.glass, MEMBERS]} renderOrder={2} />
    </group>
  );
}
