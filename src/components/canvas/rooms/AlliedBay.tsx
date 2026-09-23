"use client";

import { type BayProps } from "./shared";
import AlliedRoom from "./AlliedRoom";

/** Allied bay — the complete room composition: a precision inspection cell
 *  (spec → CMM inspection → shaker qualification → transit case).
 *  Everything is authored in AlliedRoom/allied/*; no stock props. */
export default function AlliedBay({ accent, animate, mobile }: BayProps) {
  return <AlliedRoom accent={accent} animate={animate} mobile={mobile} />;
}
