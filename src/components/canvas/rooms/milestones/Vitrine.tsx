"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WARM } from "../../theme";
import { getPuckTex } from "../shared";
import { atlasPlane, MuseumPlinth, type FameMats } from "./kit";
import { ATLAS, PLAQUE_RECT } from "./Podium";

/* ── a museum vitrine: lacquered plinth, glass case, lit canopy ─────────────
 * The case carries its OWN light the way a real showcase does: a warm
 * diffuser in the canopy (visible from the eye line, which sits below it), a
 * very faint static light cone through the glass and a warm pool on the deck
 * under the piece. No scene lights — emissive + additive only, all static. */

const PLINTH_H = 0.92;
const PW = 0.6; // plinth width/depth
const CW = 0.52; // case width/depth
const CH = 0.78; // case glass height

function useConeMat() {
  const m = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(WARM) }, uA: { value: 0.085 } },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vY = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uA;
        varying float vY;
        void main() {
          float a = uA * smoothstep(0.0, 1.0, vY) * (0.35 + 0.65 * vY);
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    mat.toneMapped = false;
    return mat;
  }, []);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

export function Vitrine({ m, tex, children }: { m: FameMats; tex: THREE.Texture; children: ReactNode }) {
  const cone = useConeMat();
  const g = useMemo(
    () => ({
      // one box = four panes + lid (its bottom face is hidden by the deck)
      glass: new THREE.BoxGeometry(CW, CH, CW),
      // brass frame: four corner posts + top and bottom perimeter rails,
      // merged into one draw — the frame is what makes the glass read
      posts: mergeGeometries([
        ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) =>
          new THREE.BoxGeometry(0.016, CH, 0.016).translate((sx * CW) / 2, 0, (sz * CW) / 2),
        ),
        ...[CH / 2 - 0.008, -CH / 2 + 0.012].flatMap((y) => {
          const t = y > 0 ? 0.016 : 0.024;
          return [
            new THREE.BoxGeometry(CW + 0.016, t, 0.016).translate(0, y, CW / 2),
            new THREE.BoxGeometry(CW + 0.016, t, 0.016).translate(0, y, -CW / 2),
            new THREE.BoxGeometry(0.016, t, CW + 0.016).translate(CW / 2, y, 0),
            new THREE.BoxGeometry(0.016, t, CW + 0.016).translate(-CW / 2, y, 0),
          ];
        }),
      ]),
      canopy: new THREE.BoxGeometry(CW + 0.04, 0.08, CW + 0.04),
      diffuser: new THREE.PlaneGeometry(CW - 0.1, CW - 0.1),
      cone: new THREE.CylinderGeometry(0.17, 0.25, CH - 0.04, 32, 1, true),
      plate: new THREE.BoxGeometry(0.56, 0.18, 0.012),
      plaque: atlasPlane(
        0.54,
        0.54 * (PLAQUE_RECT.h / PLAQUE_RECT.w),
        PLAQUE_RECT.ax / ATLAS,
        PLAQUE_RECT.ay / ATLAS,
        (PLAQUE_RECT.ax + PLAQUE_RECT.w) / ATLAS,
        (PLAQUE_RECT.ay + PLAQUE_RECT.h) / ATLAS,
      ),
    }),
    [],
  );
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g]);
  const deck = PLINTH_H;
  return (
    <group>
      {/* profiled museum plinth: reveal, skirting + brass foot band, panelled shaft, stone cap */}
      <MuseumPlinth m={m} w={PW} d={PW} h={PLINTH_H} />
      {/* engraved brass plaque on the plinth face */}
      <group position={[0, PLINTH_H * 0.5, PW / 2 + 0.01]}>
        <mesh geometry={g.plate} material={m.brass} />
        <mesh geometry={g.plaque} position-z={0.0065}>
          <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>

      {/* the piece + the warm pool it stands in */}
      <mesh position-y={deck + 0.003} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial
          map={getPuckTex()}
          color={WARM}
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <group position-y={deck}>{children}</group>

      {/* glass case (panes + lid in one box), slim brass corner posts */}
      <group position-y={deck + CH / 2}>
        <mesh geometry={g.glass} material={m.glass} />
        <mesh geometry={g.posts} material={m.brass} />
        <mesh geometry={g.cone} material={cone} position-y={-0.02} />
      </group>
      {/* canopy with its warm diffuser facing down into the case */}
      <mesh geometry={g.canopy} material={m.lacquer} position-y={deck + CH + 0.04} />
      <mesh geometry={g.diffuser} material={m.warmLine} rotation-x={Math.PI / 2} position-y={deck + CH - 0.002} />
    </group>
  );
}
