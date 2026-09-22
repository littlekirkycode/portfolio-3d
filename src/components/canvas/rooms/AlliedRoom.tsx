"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Board, Edges, INK, Segments, Spin, fonts, useAdditive, type Painter } from "./holo";

/* ── Allied: product engineering in defence manufacturing ────────────────────
 * Hardware from spec to production, shown as an inspection cell: a machined
 * bracket turning on a metrology turntable, CAD edges traced over the metal,
 * a laser scan plane slowly sweeping it, and tolerance callouts pinned to the
 * features. Ruggedised flight cases stack behind — the product shipping. */

const T = { x: -2.8, z: 1.22 }; // turntable centre
const TOP = 0.86; // turntable surface

/** The machined part, built from primitives so each feature is real geometry
 *  (and gets its own CAD edge overlay). Local origin = part base centre. */
function Part({ accent }: { accent: string }) {
  const metal = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#d3d9e4", roughness: 0.32, metalness: 0.35 }),
    [],
  );
  const bore = useMemo(() => new THREE.MeshStandardMaterial({ color: "#07080c", roughness: 0.6, metalness: 0.4 }), []);
  const geos = useMemo(
    () => ({
      plate: new THREE.BoxGeometry(0.62, 0.07, 0.4),
      upright: new THREE.BoxGeometry(0.14, 0.34, 0.4),
      boss: new THREE.CylinderGeometry(0.1, 0.1, 0.14, 40),
      gusset: new THREE.BoxGeometry(0.2, 0.2, 0.04),
      hole: new THREE.CylinderGeometry(0.036, 0.036, 0.075, 24),
      cross: new THREE.CylinderGeometry(0.07, 0.07, 0.145, 32),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
      metal.dispose();
      bore.dispose();
    },
    [geos, metal, bore],
  );
  const edge = accent;
  return (
    <group>
      <group position={[0, 0.035, 0]}>
        <mesh geometry={geos.plate} material={metal} />
        <Edges geometry={geos.plate} color={edge} opacity={0.8} />
      </group>
      <group position={[-0.24, 0.07 + 0.17, 0]}>
        <mesh geometry={geos.upright} material={metal} />
        <Edges geometry={geos.upright} color={edge} opacity={0.8} />
        {/* cross bore through the upright */}
        <mesh geometry={geos.cross} material={bore} rotation-z={Math.PI / 2} position={[0, 0.04, 0]} />
      </group>
      <group position={[0.1, 0.07 + 0.07, 0]}>
        <mesh geometry={geos.boss} material={metal} />
        <Edges geometry={geos.boss} color={edge} opacity={0.8} threshold={30} />
        <mesh geometry={geos.hole} material={bore} position={[0, 0.04, 0]} scale={[1.2, 1.1, 1.2]} />
      </group>
      {([-0.14, 0.14] as const).map((z) => (
        <group key={z} position={[-0.12, 0.17, z]} rotation-z={Math.PI / 4}>
          <mesh geometry={geos.gusset} material={metal} scale={[0.7, 0.7, 1]} />
        </group>
      ))}
      {([[0.24, 0.14], [0.24, -0.14]] as const).map(([x, z]) => (
        <mesh key={`${x}${z}`} geometry={geos.hole} material={bore} position={[x, 0.04, z]} />
      ))}
    </group>
  );
}

function ScanPlane({ accent, animate }: { accent: string; animate: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const fill = useAdditive(accent, 0.1);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (animate) t.current += Math.min(dt, 1 / 30);
    // slow ease up and down over the part (6s round trip)
    ref.current.position.y = TOP + 0.04 + (0.5 - 0.5 * Math.cos((t.current / 6) * Math.PI * 2)) * 0.52;
  });
  return (
    <group ref={ref} position={[T.x, TOP, T.z]}>
      <mesh rotation-x={-Math.PI / 2} material={fill}>
        <planeGeometry args={[1.1, 0.86]} />
      </mesh>
      <Segments
        positions={[-0.55, 0, -0.43, 0.55, 0, -0.43, 0.55, 0, -0.43, 0.55, 0, 0.43, 0.55, 0, 0.43, -0.55, 0, 0.43, -0.55, 0, 0.43, -0.55, 0, -0.43]}
        color={accent}
        opacity={0.9}
      />
    </group>
  );
}

function useCalloutPainter(accent: string, k: string, v: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono } = fonts();
      ctx.fillStyle = "rgba(8,10,18,0.78)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 6, h);
      ctx.textAlign = "left";
      ctx.fillStyle = accent;
      ctx.font = `600 ${Math.round(h * 0.28)}px ${mono}`;
      ctx.fillText(k, 22, h * 0.4);
      ctx.fillStyle = INK;
      ctx.font = `600 ${Math.round(h * 0.34)}px ${mono}`;
      ctx.fillText(v, 22, h * 0.82);
    },
    [accent, k, v],
  );
}

function Callout({ accent, k, v, at, to }: { accent: string; k: string; v: string; at: [number, number, number]; to: [number, number, number] }) {
  const paint = useCalloutPainter(accent, k, v);
  return (
    <group>
      <Board w={0.62} h={0.2} res={372} paint={paint} accent={accent} slab={false} position={at} rotation-y={0.35} />
      <Segments positions={[at[0] + 0.26, at[1] - 0.1, at[2], ...to]} color={accent} opacity={0.7} />
    </group>
  );
}

function useStencil(): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { mono } = fonts();
      ctx.fillStyle = "#2c3024";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(233,226,196,0.85)";
      ctx.font = `700 ${Math.round(h * 0.2)}px ${mono}`;
      ctx.textAlign = "left";
      ctx.fillText("ALLIED", 18, h * 0.34);
      ctx.font = `600 ${Math.round(h * 0.12)}px ${mono}`;
      ctx.fillText("ASSY 04-118  //  QTY 04", 18, h * 0.58);
      ctx.fillText("HANDLE WITH CARE", 18, h * 0.8);
    },
    [],
  );
}

function FlightCase({ w, h, d, pos, ry }: { w: number; h: number; d: number; pos: [number, number, number]; ry: number }) {
  const stencil = useStencil();
  return (
    <group position={pos} rotation-y={ry}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color="#4d5440" roughness={0.75} metalness={0.15} />
      </mesh>
      {/* aluminium edge extrusions */}
      {([h * 0.02, h * 0.98] as const).map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[w + 0.02, 0.03, d + 0.02]} />
          <meshStandardMaterial color="#9aa2ae" roughness={0.35} metalness={0.9} />
        </mesh>
      ))}
      {/* latches */}
      {([-w * 0.3, w * 0.3] as const).map((x) => (
        <mesh key={x} position={[x, h * 0.62, d / 2 + 0.012]}>
          <boxGeometry args={[0.08, 0.06, 0.025]} />
          <meshStandardMaterial color="#b9c0ca" roughness={0.3} metalness={0.95} />
        </mesh>
      ))}
      <Board w={w * 0.8} h={h * 0.42} res={320} paint={stencil} accent="#e9e2c4" slab={false} position={[0, h * 0.34, d / 2 + 0.003]} />
    </group>
  );
}

export default function AlliedRoom({ accent, animate }: { accent: string; animate: boolean }) {
  return (
    <group>
      {/* metrology turntable */}
      <group position={[T.x, 0, T.z]}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.9, 0.8, 0.8]} />
          <meshStandardMaterial color="#3a3f4c" emissive="#1a1d26" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.83, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.05, 48]} />
          <meshStandardMaterial color="#4a505e" roughness={0.35} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0.857, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.48, 0.5, 64]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>
      <Spin speed={0.28} animate={animate} position={[T.x, TOP, T.z]} scale={1.45}>
        <Part accent={accent} />
      </Spin>
      <ScanPlane accent={accent} animate={animate} />
      {/* tolerance callouts (fixed in space; leaders to the part) */}
      <Callout accent={accent} k="BORE Ø" v="12.000 ±0.005" at={[-3.25, 1.92, 1.42]} to={[T.x, TOP + 0.2, T.z]} />
      <Callout accent={accent} k="FLATNESS" v="0.010 A" at={[-2.55, 2.2, 1.6]} to={[T.x + 0.1, TOP + 0.08, T.z]} />
      <Callout accent={accent} k="MATERIAL" v="7075-T6 AL" at={[-3.3, 1.52, 1.95]} to={[T.x - 0.2, TOP + 0.05, T.z + 0.1]} />
      {/* ruggedised flight cases, stacked behind */}
      <FlightCase w={0.9} h={0.55} d={0.6} pos={[-3.2, 0, -0.55]} ry={0.55} />
      <FlightCase w={0.7} h={0.42} d={0.5} pos={[-3.18, 0.55, -0.52]} ry={0.72} />
      <FlightCase w={0.6} h={0.5} d={0.5} pos={[-2.45, 0, -1.1]} ry={0.3} />
    </group>
  );
}
