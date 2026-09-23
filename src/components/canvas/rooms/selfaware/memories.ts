/* ── SelfAware: the memories the room is built around ───────────────────────
 * One data set feeds BOTH the memory-core hologram (icon chips on its orbit)
 * and the wall-mounted recall display, so the room tells one story:
 * a query ("Plan my week") → retrieval lights the three most relevant memories
 * on the core's orbit → the display lists them with similarity, the agent's
 * answer and the tool call it made → the answer streams into the phone.
 * The memories are illustrative UI content (the app's own demo persona), not
 * product metrics.
 * ──────────────────────────────────────────────────────────────────────── */

export type IconKind = "dumbbell" | "calendar" | "gift" | "pin" | "flag" | "moon" | "cup" | "book" | "check";

export type Memory = { icon: IconKind; text: string; score?: number };

/** Orbit layout. `at` is the tile's bearing around the core in radians,
 *  measured from the direction that faces the dwell camera (+ = toward the
 *  viewer's right). Tiles keep to the flanks (|at| 0.95–2.25): none sits in
 *  the front/back wedge where it would cross the orb or the yoke arms: the three memories retrieval
 *  returned sit on the right (the side the answer streams out of, toward the
 *  phone); three dormant ones rest on the left as dark glass chips. */
export const ORBIT: (Memory & { at: number })[] = [
  { icon: "dumbbell", text: "Prefers 7am workouts", score: 0.93, at: 0.95 },
  { icon: "gift", text: "Mum’s birthday — Fri 14th", score: 0.88, at: 1.6 },
  { icon: "flag", text: "Goal: first 10k by June", score: 0.81, at: 2.25 },
  { icon: "moon", text: "Sleeps best by 11pm", at: -0.95 },
  { icon: "cup", text: "No caffeine after 2pm", at: -1.6 },
  { icon: "book", text: "Reading list", at: -2.25 },
];

export const RECALLED = ORBIT.filter((m) => m.score !== undefined).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

export const QUERY = "Plan my week";

/** What the agent does with the recall: the streamed answer, then the tool
 *  call it made. Illustrative demo content (the app's persona), not metrics. */
export const ANSWER = "3 runs at 7am · Mum’s gift on Tue";
export const ACTION = "4 events added to calendar";

/** Line-art icon centred on (cx, cy), fitting a `s`-sized square. Stroke +
 *  fill colours are taken from the current ctx state set by the caller. */
export function drawIcon(ctx: CanvasRenderingContext2D, kind: IconKind, cx: number, cy: number, s: number) {
  const u = s / 24; // icons are authored on a 24-unit grid
  ctx.save();
  ctx.translate(cx - 12 * u, cy - 12 * u);
  ctx.scale(u, u);
  ctx.lineWidth = 1.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const p = new Path2D();
  switch (kind) {
    case "dumbbell":
      p.moveTo(7, 12); p.lineTo(17, 12);
      p.rect(4, 7.5, 3, 9); p.rect(17, 7.5, 3, 9);
      p.moveTo(2.5, 10); p.lineTo(2.5, 14); p.moveTo(21.5, 10); p.lineTo(21.5, 14);
      break;
    case "calendar":
      p.roundRect(3.5, 5, 17, 15.5, 2.5);
      p.moveTo(3.5, 10); p.lineTo(20.5, 10);
      p.moveTo(8, 3); p.lineTo(8, 7); p.moveTo(16, 3); p.lineTo(16, 7);
      p.rect(7.5, 13, 3, 3);
      break;
    case "gift":
      p.rect(4, 10, 16, 10.5);
      p.rect(3, 7, 18, 3);
      p.moveTo(12, 7); p.lineTo(12, 20.5);
      p.moveTo(12, 7); p.bezierCurveTo(9, 2, 5, 4.5, 8, 7);
      p.moveTo(12, 7); p.bezierCurveTo(15, 2, 19, 4.5, 16, 7);
      break;
    case "pin":
      p.moveTo(12, 21.5);
      p.bezierCurveTo(7, 15.5, 5, 12.5, 5, 9.5);
      p.arc(12, 9.5, 7, Math.PI, 0);
      p.bezierCurveTo(19, 12.5, 17, 15.5, 12, 21.5);
      p.moveTo(14.6, 9.5); p.arc(12, 9.5, 2.6, 0, Math.PI * 2);
      break;
    case "flag":
      p.moveTo(5.5, 21); p.lineTo(5.5, 3.5);
      p.moveTo(5.5, 4.5); p.bezierCurveTo(9, 2.5, 12, 6.5, 19, 4.5);
      p.lineTo(19, 12.5); p.bezierCurveTo(12, 14.5, 9, 10.5, 5.5, 12.5);
      break;
    case "moon":
      // crescent opening to the upper right
      p.arc(12, 12, 8.5, -0.28 * Math.PI, 0.28 * Math.PI, true);
      p.bezierCurveTo(9.5, 18.5, 8.5, 6, 17.3, 5.3);
      p.closePath();
      break;
    case "cup":
      p.moveTo(4.5, 9); p.lineTo(16, 9); p.lineTo(15, 19); p.quadraticCurveTo(14.8, 20.5, 13.2, 20.5);
      p.lineTo(7.3, 20.5); p.quadraticCurveTo(5.7, 20.5, 5.5, 19); p.closePath();
      p.moveTo(16, 11); p.bezierCurveTo(21, 10.5, 21, 16.5, 15.4, 16.5);
      p.moveTo(8, 6.5); p.quadraticCurveTo(7, 4.8, 8, 3.2);
      p.moveTo(12, 6.5); p.quadraticCurveTo(11, 4.8, 12, 3.2);
      break;
    case "check":
      p.arc(12, 12, 9, 0, Math.PI * 2);
      p.moveTo(7.8, 12.3); p.lineTo(10.8, 15.2); p.lineTo(16.4, 9.2);
      break;
    case "book":
      p.moveTo(12, 6.5); p.bezierCurveTo(9, 4.5, 6, 4.5, 3, 5.5); p.lineTo(3, 19);
      p.bezierCurveTo(6, 18, 9, 18, 12, 20); p.bezierCurveTo(15, 18, 18, 18, 21, 19);
      p.lineTo(21, 5.5); p.bezierCurveTo(18, 4.5, 15, 4.5, 12, 6.5); p.lineTo(12, 20);
      break;
  }
  ctx.stroke(p);
  ctx.restore();
}
