"use client";

import { Model, SpinY } from "../ModelLoader";
import { Plinth, d2r, type BayProps } from "./shared";
import XuabelleRoom, { Vitrine } from "./XuabelleRoom";

/** Xuabelle bay — the complete room composition (installation + props).
 *  Xuabelle — the boutique: every piece in its own vitrine + the storefront's lightbox */
export default function XuabelleBay({ accent, animate }: BayProps) {
  return (
      <group>
        <XuabelleRoom accent={accent} />
        <Plinth h={1.2} x={0} z={-0.85} accent={accent}>
          <Vitrine label="N°01 · SOLITAIRE">
            <SpinY speed={0.5} animate={animate}>
              <Model name="ring" maxDim={0.42} position={[0, 0.06, 0]} />
            </SpinY>
          </Vitrine>
        </Plinth>
        {/* upZ lays the flat model face-up BEFORE the bbox pass */}
        <Plinth h={0.9} x={-2.6} z={1.5} accent={accent}>
          <Vitrine label="N°02 · RIVIÈRE">
            <Model name="necklace" maxDim={0.46} upZ rotation={[0, d2r(30), 0]} />
          </Vitrine>
        </Plinth>
        <Plinth h={0.85} x={3.5} z={1.75} accent={accent}>
          <Vitrine label="N°03 · EMERALD">
            <SpinY speed={0.35} animate={animate}>
              <Model name="gem" maxDim={0.34} position={[0, 0.08, 0]} rotation={[0, d2r(-32), 0]} />
            </SpinY>
          </Vitrine>
        </Plinth>
        <Plinth h={1.0} x={3.45} z={0.5} accent={accent}>
          <Vitrine label="N°04 · TIARA">
            <SpinY speed={0.25} animate={animate}>
              <Model name="crown" maxDim={0.38} rotation={[0, d2r(15), 0]} />
            </SpinY>
          </Vitrine>
        </Plinth>
      </group>
  );
}
