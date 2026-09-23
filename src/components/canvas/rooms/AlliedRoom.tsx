"use client";

import { useThree } from "@react-three/fiber";
import Cmm from "./allied/Cmm";
import Kit from "./allied/Kit";
import Report from "./allied/Report";
import { useAlliedMats } from "./allied/mats";

/* ── Allied: product engineering in defence manufacturing ────────────────────
 * Hardware from spec to production, read left → right as one inspection cell:
 *  - SPEC: the blueprint of part AK-01 on the hero screen (back wall).
 *  - INSPECT (left column, the hero): a bridge-type CMM on a speckled granite
 *    plate, its ruby-tipped probe slowly touch-probing the machined 7075
 *    bracket AK-01; above it, on a wall swing-arm, the controller display with
 *    three GD&T feature-control frames, all PASS.
 *  - QUALIFY (centre stage, on the mat): the ruggedised LRU bolted to a
 *    vibration shaker on its seismic base, facing the camera.
 *  - SHIP (right front, off the mat): its transit case + spares.
 * The LRU on the shaker is the centre-stage hero (lit, directly under the
 * blueprint it was built to); the CMM + report board are the left-hand exhibit
 * that proves it. Every floor prop sits on a soft contact shadow.
 * Neutral industrial materials; the amber accent appears only as light — the
 * machine's brand stripe, the probe tip, a status LED, trims, the display rim.
 *
 * Framing (dwell camera ≈ room-local (0, 1.62, 6.15), vfov 62°): the CMM tops
 * out at eye level so it sits wholly below the horizon; the display's bottom
 * edge sits just above it and its top stays under the escort drone, which
 * parks at ≈ (−1.9, 2.3, 3.5) in front of the opening. The LRU stays below the
 * hero screen's bottom edge and left of the info panel; the cases sit right of
 * the panel's bottom corner. */

export default function AlliedRoom({ accent, animate, mobile = false }: { accent: string; animate: boolean; mobile?: boolean }) {
  const m = useAlliedMats(accent); // one material set for the whole cell
  /* FovFit holds the VERTICAL fov for aspect ≥ 1, so a narrower desktop frame
   * (4:3, 16:10 laptops) crops the flanks. `k` slides the flank exhibits
   * inward from their 16:10+ marks (k = 0) to their 4:3 marks (k = 1): the
   * board + CMM toward centre (the swing-arm simply extends — its bracket
   * stays on the wall), the cases toward the panel with the spares case
   * dropped so the stack stays under the panel's bottom edge. */
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const k = Math.min(1, Math.max(0, (1.62 - aspect) / (1.62 - 1.33)));
  const q = (v: number) => Math.round(v * 100) / 100; // steady geometry keys
  if (mobile) {
    return (
      <group>
        {/* portrait: the camera steps in and the screen/panel stack centre-frame,
            so the flank + floor pieces would crowd/overlap the panel. The
            inspection report hangs from the ceiling above the hero screen
            instead — the one Allied-specific read in the phone frame. */}
        <Report accent={accent} m={m} position={[0, 3.3, 1.3]} rotY={0} mount="ceiling" scale={0.9} />
      </group>
    );
  }
  return (
    <group>
      <Cmm m={m} animate={animate} position={[q(-2.95 + 0.34 * k), 0, 1.25]} />
      <Report accent={accent} m={m} position={[q(-3.1 + 0.5 * k), 2.0, 1.35]} rotY={0.55} wallX={-3.7} />
      <Kit accent={accent} m={m} cases={[q(3.05 - 0.67 * k), q(2.15 - 0.35 * k)]} spares={k < 0.5} />
    </group>
  );
}
