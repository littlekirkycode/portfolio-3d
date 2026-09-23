"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { hexA, roundRect } from "../../canvas2d";
import { GLOW, MATERIALS } from "../../theme";
import { Board, INK, fonts, paintGlass, paintKicker, type Painter } from "../holo";

/* ── the concierge's answer, projected above the table ──────────────────────
 * The question the map is answering, and the reply that pinned pick 1, on
 * the ship's shared glass card (denser, so the copy holds over the wall). A
 * leader line runs from the card's bottom notch down to pin 1's head, so the
 * chat and the map read as one moment of the product.
 *
 * Placement: left showcase column, above the raked table and turned toward
 * the dwell camera. Left edge ≈ (−3.59, z 2.09) — clear of the side wall at
 * −3.70; right edge ≈ (−2.53, z 1.00) — left of the hero-screen frame
 * pillar. Bottom edge (y 1.93) clears pin 1's head. A small polished emitter
 * bead sits on the bottom edge where the leader leaves the card. */

export const PANEL = { x: -3.06, y: 2.32, z: 1.54, w: 1.52, h: 0.78, ry: 0.8 };
const RES = 768;
const NOTCH_U = 0.62; // leader anchor along the bottom edge (0..1)

/** Set `font` at the largest size ≤ max whose `text` fits in `maxW`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, max: number, maxW: number) {
  let size = max;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 24 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function useConciergePainter(accent: string): Painter {
  return useMemo<Painter>(
    () => (ctx, W, H) => {
      const { sans, ser } = fonts();
      const pad = 36;
      paintGlass(ctx, W, H, accent, { density: 1.14, r: 26 });

      // leader notch on the bottom edge
      const nx = W * NOTCH_U;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(nx, H - 6, 9, 0, Math.PI * 2);
      ctx.fill();

      // kicker (shared style)
      paintKicker(ctx, "NUREMI · CONCIERGE", pad, 62, accent, 38);
      ctx.fillStyle = "rgba(244,241,234,0.1)";
      ctx.fillRect(pad, 82, W - pad * 2, 2);

      // the question (user bubble, right)
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const q = "Find me a quiet café for a meeting.";
      fitFont(ctx, q, "500", sans, 42, W - pad * 2 - 56);
      const bw = ctx.measureText(q).width + 52;
      ctx.fillStyle = "rgba(244,241,234,0.14)";
      roundRect(ctx, W - pad - bw, 98, bw, 66, 24);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillText(q, W - pad - bw + 26, 145);

      // the answer (concierge bubble, full width)
      const ax = pad;
      const ay = 180;
      const aw = W - pad * 2;
      const ah = H - ay - 32;
      ctx.fillStyle = hexA(accent, 0.24);
      roundRect(ctx, ax, ay, aw, ah, 24);
      ctx.fill();
      ctx.strokeStyle = hexA(accent, 0.62);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // pin-1 badge — the same mark as the map's pin 1
      const bx = ax + 44;
      const by = ay + 52;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(bx, by, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.font = `700 30px ${sans}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("1", bx, by + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = INK;
      const t1 = "Quiet café — pinned.";
      fitFont(ctx, t1, "600", ser, 56, aw - 104);
      ctx.fillText(t1, ax + 84, ay + 70);
      const t2 = "3 picks near you · route ready.";
      fitFont(ctx, t2, "400", sans, 40, aw - 104);
      ctx.fillStyle = "rgba(244,241,234,0.86)";
      ctx.fillText(t2, ax + 84, ay + 120);
    },
    [accent],
  );
}

export default function ConciergePanel({
  accent,
  heroAnchor,
}: {
  accent: string;
  heroAnchor: RefObject<THREE.Object3D | null>;
}) {
  const paint = useConciergePainter(accent);
  const root = useRef<THREE.Group>(null);
  const leader = useRef<THREE.Mesh>(null);
  const cap = useRef<THREE.Mesh>(null);
  const mats = useMemo(
    () => ({
      line: MATERIALS.emit(accent, GLOW.line * 0.85),
      cap: MATERIALS.emit(INK, 0.95),
      bead: MATERIALS.polished(),
      lens: MATERIALS.emit("#e9ddff", GLOW.line),
    }),
    [accent],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // notch position in room-local space (fixed)
  const notch = useMemo(() => {
    const lx = (NOTCH_U - 0.5) * PANEL.w;
    const v = new THREE.Vector3(lx, -PANEL.h / 2 + 0.006, 0);
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), PANEL.ry);
    return v.add(new THREE.Vector3(PANEL.x, PANEL.y, PANEL.z));
  }, []);

  const tmp = useMemo(() => ({ a: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    const anchor = heroAnchor.current;
    const g = root.current;
    const l = leader.current;
    const c = cap.current;
    if (!anchor || !g || !l || !c) return;
    anchor.getWorldPosition(tmp.a);
    g.worldToLocal(tmp.a); // room-local
    c.position.copy(tmp.a);
    tmp.d.subVectors(notch, tmp.a);
    const len = tmp.d.length();
    l.position.addVectors(notch, tmp.a).multiplyScalar(0.5);
    l.scale.set(1, len, 1);
    l.quaternion.setFromUnitVectors(tmp.up, tmp.d.normalize());
  });

  return (
    <group ref={root}>
      <group position={[PANEL.x, PANEL.y, PANEL.z]} rotation-y={PANEL.ry}>
        <Board w={PANEL.w} h={PANEL.h} res={RES} paint={paint} accent={accent} slab={false} />
        {/* emitter bead on the bottom edge — where the leader leaves the card */}
        <group position={[(NOTCH_U - 0.5) * PANEL.w, -PANEL.h / 2, 0]}>
          <mesh rotation-x={Math.PI / 2} material={mats.bead}>
            <cylinderGeometry args={[0.02, 0.02, 0.018, 20]} />
          </mesh>
          <mesh position={[0, 0, 0.0095]} material={mats.lens}>
            <circleGeometry args={[0.011, 20]} />
          </mesh>
        </group>
      </group>
      <mesh ref={leader} material={mats.line}>
        <cylinderGeometry args={[0.005, 0.005, 1, 8]} />
      </mesh>
      {/* where the leader lands on pin 1's head */}
      <mesh ref={cap} material={mats.cap}>
        <sphereGeometry args={[0.013, 16, 12]} />
      </mesh>
    </group>
  );
}
