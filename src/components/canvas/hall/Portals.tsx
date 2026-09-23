"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ALCOVE_OPEN_W, GALLERY_SIDE, GALLERY_SPAN, GALLERY_X, HALF_W, ROOMS, WALL_H, type Room } from "../hallConfig";
import { familyVar, roundRect } from "../canvas2d";
import { GLOW } from "../theme";

/* ── room entrance portals ───────────────────────────────────────────────────
 * Every bay opening gets an architectural portal on the corridor wall:
 * chunky chamfered jambs (their inner chamfer carries the room's accent as a
 * steady light line), a header beam spanning the opening with a lit lower
 * lip, and an "EXHIBIT 0N" sign on its corridor face (this replaced the old
 * wall plaque). Alcove-local convention as Walls: group at
 * [room.x, 0, side·HALF_W], rotY 0 (−z wall) or π (+z wall); local +z points
 * into the corridor. The header sits above the dwell camera's sightline to
 * the room label and the bay's ceiling light (checked from the corridor
 * centreline), so nothing inside the bay is hidden.
 * ──────────────────────────────────────────────────────────────────────── */

const HALF = ALCOVE_OPEN_W / 2;
const J_IN = HALF - 0.1; // jamb inner face (just inside the opening edge)
const J_OUT = HALF + 0.8; // jamb outer edge along the wall
const J_D = 0.42; // protrusion into the corridor
const CH = 0.14; // chamfer on the inner-front edge
const HEAD_Y0 = 3.56;

/** Jamb cross-section in (x, z) — chamfered where the opening meets the hall. */
function jambGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // shape y = −local z (the rotateX below maps it back to +z)
  s.moveTo(J_IN, 0);
  s.lineTo(J_OUT, 0);
  s.lineTo(J_OUT, -J_D);
  s.lineTo(J_IN + CH, -J_D);
  s.lineTo(J_IN, -(J_D - CH));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: WALL_H, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

function useSignTexture(room: Room) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => {
    const draw = () => {
      const c = tex.image as HTMLCanvasElement;
      const ctx = c.getContext("2d")!;
      const mono = familyVar("--ff-mono", "ui-monospace, monospace");
      const sans = familyVar("--ff-body", "system-ui, sans-serif");
      ctx.clearRect(0, 0, 1024, 160);
      ctx.fillStyle = "#0b0f18";
      roundRect(ctx, 4, 4, 1016, 152, 18);
      ctx.fill();
      ctx.strokeStyle = "rgba(244,241,234,0.12)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = room.accent;
      roundRect(ctx, 28, 58, 44, 44, 8);
      ctx.fill();
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = `600 40px ${mono}`;
      ctx.fillStyle = room.accent;
      ctx.fillText(`EXHIBIT ${room.index}`, 100, 82);
      const w = ctx.measureText(`EXHIBIT ${room.index}`).width;
      ctx.fillStyle = "rgba(244,241,234,0.25)";
      ctx.fillRect(100 + w + 28, 50, 2, 64);
      ctx.font = `700 56px ${sans}`;
      ctx.fillStyle = "#e6e3dc";
      ctx.fillText(room.title.toUpperCase(), 100 + w + 58, 84);
      tex.needsUpdate = true;
    };
    draw();
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && draw()).catch(() => {});
    return () => {
      cancelled = true;
      tex.dispose();
    };
  }, [tex, room]);
  return tex;
}

function Portal({ room, geo, mats }: { room: Room; geo: THREE.BufferGeometry; mats: { frame: THREE.Material; trim: THREE.Material } }) {
  const sign = useSignTexture(room);
  const glow = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(room.accent).multiplyScalar(GLOW.line), toneMapped: false }),
    [room.accent],
  );
  const lip = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(room.accent).multiplyScalar(GLOW.trim), toneMapped: false }),
    [room.accent],
  );
  useEffect(
    () => () => {
      glow.dispose();
      lip.dispose();
    },
    [glow, lip],
  );
  const rotY = room.side < 0 ? 0 : Math.PI;
  const m = room.side < 0 ? 1 : -1; // local x → world x sign
  // a jamb whose footprint would land on the observation-gallery glazing is
  // dropped (Capabilities' bay starts flush at the gallery's far edge)
  const jambs = ([-1, 1] as const).filter((s) => {
    if (room.side !== GALLERY_SIDE) return true;
    const a = room.x + m * s * J_IN;
    const b = room.x + m * s * J_OUT;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return !(hi > GALLERY_X - GALLERY_SPAN / 2 && lo < GALLERY_X + GALLERY_SPAN / 2);
  });
  const leftEdge = jambs.includes(-1) ? -J_OUT : -HALF;
  const rightEdge = jambs.includes(1) ? J_OUT : HALF;
  const headW = rightEdge - leftEdge;
  const headCx = (leftEdge + rightEdge) / 2;
  return (
    <group position={[room.x, 0, room.side * HALF_W]} rotation-y={rotY}>
      {jambs.map((s) => (
        <group key={s} scale={[s, 1, 1]}>
          <mesh geometry={geo} material={mats.frame} />
          {/* accent light line on the chamfer */}
          <mesh position={[J_IN + CH / 2 - 0.006, WALL_H / 2 - 0.2, J_D - CH / 2 + 0.006]} rotation-y={-Math.PI / 4} material={glow}>
            <boxGeometry args={[0.03, WALL_H - 0.9, 0.012]} />
          </mesh>
          {/* steel kick + cap trims on the jamb face */}
          <mesh position={[(J_IN + J_OUT) / 2 + CH / 2, 0.14, J_D + 0.006]} material={mats.trim}>
            <boxGeometry args={[J_OUT - J_IN - CH, 0.28, 0.012]} />
          </mesh>
        </group>
      ))}
      {/* header beam + lit lower lip + sign */}
      <mesh position={[headCx, (HEAD_Y0 + WALL_H) / 2, J_D / 2]} material={mats.frame}>
        <boxGeometry args={[headW, WALL_H - HEAD_Y0, J_D]} />
      </mesh>
      <mesh position={[headCx, HEAD_Y0 - 0.006, J_D - 0.05]} material={lip}>
        <boxGeometry args={[headW - 0.4, 0.012, 0.03]} />
      </mesh>
      <mesh position={[0, (HEAD_Y0 + WALL_H) / 2, J_D + 0.004]}>
        <planeGeometry args={[2.7, 2.7 * (160 / 1024)]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function Portals() {
  const geo = useMemo(() => jambGeometry(), []);
  const mats = useMemo(
    () => ({
      frame: new THREE.MeshStandardMaterial({ color: "#2e3648", roughness: 0.36, metalness: 0.7 }),
      trim: new THREE.MeshStandardMaterial({ color: "#8d96a8", roughness: 0.3, metalness: 0.85 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mats.frame.dispose();
      mats.trim.dispose();
    },
    [geo, mats],
  );
  return (
    <group>
      {ROOMS.map((r) => (
        <Portal key={r.id} room={r} geo={geo} mats={mats} />
      ))}
    </group>
  );
}
