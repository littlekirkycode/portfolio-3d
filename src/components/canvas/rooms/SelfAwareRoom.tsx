"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { roundRect } from "../canvas2d";
import { Board, FlowTube, INK, Segments, fonts, paintKicker, useAdditive, useGlow, type Painter } from "./holo";

/* ── SelfAware: an agentic AI life OS with retrieval-augmented memory ────────
 * The room's hero is the assistant itself: a glowing core on a projector
 * pedestal, wrapped in its MEMORY GRAPH (nodes = remembered facts, linked to
 * the core and to each other), with a token stream flowing from the core into
 * the phone — "real-time streaming" made literal. A recall board behind it
 * shows what retrieval looks like: memories with similarity scores. */

const CORE = new THREE.Vector3(-2.95, 1.78, 1.3);
const NODE_R = 0.72;
const N_NODES = 14;

const MEMORIES: { text: string; score: number }[] = [
  { text: "Prefers 7am workouts", score: 0.93 },
  { text: "Mum's birthday — Fri 14th", score: 0.88 },
  { text: "Goal: first 10k by June", score: 0.81 },
  { text: "No caffeine after 2pm", score: 0.74 },
];

function useRecallPainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, w, h) => {
      const { ser, mono, sans } = fonts();
      const pad = 42;
      paintKicker(ctx, "MEMORY RECALL", pad, 66, accent, 28);
      ctx.fillStyle = "rgba(244,241,234,0.55)";
      ctx.font = `500 22px ${mono}`;
      ctx.textAlign = "right";
      ctx.fillText("query: “plan my week”", w - pad, 64);
      let y = 136;
      for (const m of MEMORIES) {
        ctx.textAlign = "left";
        ctx.fillStyle = INK;
        ctx.font = `500 32px ${sans}`;
        ctx.fillText(`“${m.text}”`, pad, y);
        // similarity bar
        const bw = w - pad * 2 - 110;
        ctx.fillStyle = "rgba(244,241,234,0.1)";
        roundRect(ctx, pad, y + 16, bw, 10, 5);
        ctx.fill();
        ctx.fillStyle = accent;
        roundRect(ctx, pad, y + 16, bw * m.score, 10, 5);
        ctx.fill();
        ctx.textAlign = "right";
        ctx.fillStyle = accent;
        ctx.font = `600 26px ${mono}`;
        ctx.fillText(m.score.toFixed(2), w - pad, y + 28);
        y += 84;
      }
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `700 44px ${ser}`;
      ctx.fillText("3,214", pad, h - 40);
      const tw = ctx.measureText("3,214").width;
      ctx.fillStyle = "rgba(244,241,234,0.6)";
      ctx.font = `500 22px ${mono}`;
      ctx.fillText("MEMORIES · VECTOR RECALL", pad + tw + 16, h - 48);
    },
    [accent],
  );
}

/** Fibonacci-sphere node layout + link list (core spokes + nearest-neighbour). */
function useGraph() {
  return useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < N_NODES; i++) {
      const y = 1 - (2 * (i + 0.5)) / N_NODES;
      const r = Math.sqrt(1 - y * y);
      const a = i * 2.39996;
      nodes.push(new THREE.Vector3(Math.cos(a) * r, y * 0.8, Math.sin(a) * r).multiplyScalar(NODE_R));
    }
    const seg: number[] = [];
    nodes.forEach((n, i) => {
      if (i % 2 === 0) seg.push(0, 0, 0, n.x, n.y, n.z); // spokes to the core
      // link to the nearest other node
      let best = -1;
      let bd = Infinity;
      nodes.forEach((m, j) => {
        if (j === i) return;
        const d = n.distanceToSquared(m);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      const m = nodes[best];
      seg.push(n.x, n.y, n.z, m.x, m.y, m.z);
    });
    return { nodes, seg };
  }, []);
}

function Core({ accent, animate }: { accent: string; animate: boolean }) {
  const { nodes, seg } = useGraph();
  const graph = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const coreMat = useGlow(accent, 2.2);
  const nodeMat = useGlow("#dfe6ff", 1.3);
  const shellMat = useAdditive(accent, 0.1);
  const beamMat = useAdditive(accent, 0.07);
  const ico = useMemo(() => new THREE.IcosahedronGeometry(0.4, 1), []);
  const icoEdges = useMemo(() => new THREE.EdgesGeometry(ico), [ico]);
  useEffect(
    () => () => {
      ico.dispose();
      icoEdges.dispose();
    },
    [ico, icoEdges],
  );
  useFrame((_, rawDt) => {
    if (!animate) return;
    const dt = Math.min(rawDt, 1 / 30);
    if (graph.current) graph.current.rotation.y += dt * 0.12;
    if (shell.current) {
      shell.current.rotation.y -= dt * 0.25;
      shell.current.rotation.x += dt * 0.08;
    }
    if (ringA.current) ringA.current.rotation.z += dt * 0.4;
    if (ringB.current) ringB.current.rotation.z -= dt * 0.28;
  });
  return (
    <group>
      {/* projector pedestal */}
      <group position={[CORE.x, 0, CORE.z]}>
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.26, 0.36, 0.72, 6]} />
          <meshStandardMaterial color="#3a4462" emissive="#141c38" roughness={0.45} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.735, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.16, 0.24, 6]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        {/* faint projection beam up to the core */}
        <mesh position={[0, 1.02, 0]} material={beamMat}>
          <cylinderGeometry args={[0.3, 0.16, 0.58, 24, 1, true]} />
        </mesh>
      </group>

      <group position={CORE.toArray()}>
        <mesh material={coreMat}>
          <sphereGeometry args={[0.13, 32, 32]} />
        </mesh>
        <mesh material={shellMat}>
          <sphereGeometry args={[0.24, 32, 32]} />
        </mesh>
        <group ref={shell}>
          <lineSegments geometry={icoEdges}>
            <lineBasicMaterial color={accent} transparent opacity={0.75} toneMapped={false} />
          </lineSegments>
        </group>
        <mesh ref={ringA} rotation-x={1.2}>
          <torusGeometry args={[0.55, 0.006, 8, 96]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <mesh ref={ringB} rotation-x={2.0} rotation-y={0.6}>
          <torusGeometry args={[0.62, 0.004, 8, 96]} />
          <meshBasicMaterial color="#dfe6ff" transparent opacity={0.6} toneMapped={false} />
        </mesh>
        {/* memory graph */}
        <group ref={graph}>
          <Segments positions={seg} color={accent} opacity={0.35} />
          {nodes.map((n, i) => (
            <mesh key={i} position={n} material={i % 3 === 0 ? coreMat : nodeMat}>
              <sphereGeometry args={[i % 3 === 0 ? 0.042 : 0.03, 12, 12]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export default function SelfAwareRoom({ accent, animate }: { accent: string; animate: boolean }) {
  const recall = useRecallPainter(accent);
  return (
    <group>
      <Core accent={accent} animate={animate} />
      {/* token stream: core → the phone's left edge (screen centre ≈ x -1.55) */}
      <FlowTube
        points={[
          [CORE.x + 0.2, CORE.y + 0.05, CORE.z - 0.1],
          [-2.55, 2.35, 0.4],
          [-2.25, 2.25, -0.6],
          [-2.12, 2.05, -1.15],
        ]}
        color={accent}
        radius={0.011}
        speed={0.9}
        dashes={10}
        animate={animate}
      />
      {/* recall board up behind the core, on a wall arm */}
      <group position={[-3.3, 2.72, -0.95]} rotation-y={0.9}>
        <Board w={1.36} h={0.96} paint={recall} accent={accent} />
      </group>
    </group>
  );
}
