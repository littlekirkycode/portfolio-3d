"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { atlasPlane, MuseumPlinth, remapUV, type FameMats } from "./milestones/kit";
import { ATLAS, MEDAL_LABEL_RECT, MEDAL_RECT, RIBBON_RECT } from "./milestones/Podium";

/* ── Milestones: the Founders Uni medal ──────────────────────────────────────
 * The old roll-of-honour board restated the info card line for line. The
 * card already lists the wins, so this corner now shows one of them as an
 * OBJECT instead: the Founders University $25K offer (ACHIEVEMENTS, constants)
 * struck as a gilt medal, hung on a navy-and-gold ribbon from a brass clasp on a T-stand
 * on a honed-stone plinth, the way a museum hangs a decoration. The medal is
 * real PBR gold with a transparent field; only the struck relief ($25K, rings,
 * arc legend) is drawn, in darker engraved gold with a bright lip. The small
 * print lives where it can be read: a brass label on the plinth face. */

const PL_W = 0.5;
const PL_D = 0.4;
const PL_H = 0.84; // floor → top of the stone cap
const POST = 0.72; // stand height above the cap
const MR = 0.19; // medal radius
const RIB = 0.24; // ribbon drop (crossbar → suspension ring)
const RIB_W = 0.13;
const LBL_W = 0.46; // brass label on the plinth face

export default function MilestonesRoom({ m, tex }: { m: FameMats; tex: THREE.Texture }) {
  const ribLen = RIB;
  const g = useMemo(
    () => ({
      // brass T-stand: turned foot + post + crossbar + finials, one draw
      stand: mergeGeometries([
        new THREE.CylinderGeometry(0.075, 0.09, 0.022, 40).translate(0, 0.011, 0),
        new THREE.CylinderGeometry(0.03, 0.05, 0.03, 32).translate(0, 0.037, 0),
        new THREE.CylinderGeometry(0.011, 0.013, POST, 20).translate(0, POST / 2, 0),
        new THREE.CylinderGeometry(0.01, 0.01, 0.3, 20).rotateZ(Math.PI / 2).translate(0, POST, 0),
        new THREE.SphereGeometry(0.018, 16, 12).translate(0.15, POST, 0),
        new THREE.SphereGeometry(0.018, 16, 12).translate(-0.15, POST, 0),
      ]),
      // brass clasp bar the ribbon folds over under the crossbar
      clasp: new THREE.BoxGeometry(RIB_W + 0.02, 0.022, 0.014),
      ribbon: remapUV(
        new THREE.PlaneGeometry(RIB_W, ribLen),
        RIBBON_RECT.ax / ATLAS,
        RIBBON_RECT.ay / ATLAS,
        (RIBBON_RECT.ax + RIBBON_RECT.w) / ATLAS,
        (RIBBON_RECT.ay + RIBBON_RECT.h * (ribLen / 0.34)) / ATLAS,
      ),
      disc: new THREE.CylinderGeometry(MR, MR, 0.018, 72).rotateX(Math.PI / 2),
      rim: new THREE.TorusGeometry(MR - 0.004, 0.008, 10, 72),
      ring: new THREE.TorusGeometry(0.018, 0.005, 8, 24),
      face: remapUV(
        new THREE.CircleGeometry(MR - 0.006, 72),
        MEDAL_RECT.ax / ATLAS,
        MEDAL_RECT.ay / ATLAS,
        (MEDAL_RECT.ax + MEDAL_RECT.w) / ATLAS,
        (MEDAL_RECT.ay + MEDAL_RECT.h) / ATLAS,
      ),
      label: atlasPlane(
        LBL_W,
        LBL_W * (MEDAL_LABEL_RECT.h / MEDAL_LABEL_RECT.w),
        MEDAL_LABEL_RECT.ax / ATLAS,
        MEDAL_LABEL_RECT.ay / ATLAS,
        (MEDAL_LABEL_RECT.ax + MEDAL_LABEL_RECT.w) / ATLAS,
        (MEDAL_LABEL_RECT.ay + MEDAL_LABEL_RECT.h) / ATLAS,
      ),
      plate: new THREE.BoxGeometry(LBL_W + 0.02, LBL_W * (MEDAL_LABEL_RECT.h / MEDAL_LABEL_RECT.w) + 0.02, 0.012),
    }),
    [ribLen],
  );
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  const ribbonMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }), [tex]);
  useEffect(() => () => ribbonMat.dispose(), [ribbonMat]);

  const top = PL_H + POST; // crossbar height
  const ringY = top - RIB;
  const cy = ringY - 0.018 - MR + 0.004;
  return (
    <group>
      {/* profiled museum plinth: reveal, skirting + brass foot band, panelled shaft, stone cap */}
      <MuseumPlinth m={m} w={PL_W} d={PL_D} h={PL_H} />
      {/* engraved brass label: FOUNDERS UNI / ACCELERATOR · $25K · 2.5% */}
      <group position={[0, PL_H * 0.56, PL_D / 2 + 0.008]}>
        <mesh geometry={g.plate} material={m.brass} />
        <mesh geometry={g.label} position-z={0.0065}>
          <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      {/* stand, set slightly back so the medal hangs over the cap's centre */}
      <group position={[0, PL_H, -0.05]}>
        <mesh geometry={g.stand} material={m.brass} />
      </group>
      {/* ribbon: one straight silk drop from a brass clasp to the suspension ring
          (a V read as a letter against the wall) */}
      <mesh geometry={g.ribbon} material={ribbonMat} position={[0, (top - 0.02 + ringY) / 2, -0.035]} scale-y={(RIB - 0.02) / RIB} />
      <mesh geometry={g.clasp} material={m.brass} position={[0, top - 0.024, -0.035]} />
      {/* the medal */}
      <group position={[0, cy, -0.03]} rotation-x={-0.06}>
        <mesh geometry={g.ring} material={m.gold} position-y={MR + 0.014} />
        <mesh geometry={g.disc} material={m.gold} />
        <mesh geometry={g.rim} material={m.gold} position-z={0.009} />
        <mesh geometry={g.face} position-z={0.0095}>
          <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
