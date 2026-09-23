import { hexA } from "../../canvas2d";
import { fonts, type Painter } from "../holo";
import { BLVD, BLVD_Z, MAP_R, P, PICKS, R, RIVER_HW, ROAD, ROUTE, SEARCH_R, YOU, buildCity, riverZ } from "./layout";

/* The street plate painted onto the table's glass. Few, bold layers so it
 * reads from the corridor: dark ground, streets, one river, the concierge's
 * search circle round you, the route, the pick rings and a bearing bezel —
 * with a faint horizon falloff toward the back edge and an inner shadow
 * under the rim, so the plate reads as a recessed vitrine top, not a decal.
 * Drawn once (static canvas). */

export function makePlatePainter(accent: string): Painter {
  return (ctx, S) => {
    const k = S / (2 * R); // px per world unit
    const X = (x: number) => (x + R) * k;
    const Z = (z: number) => (z + R) * k;
    const lav = "rgba(206,198,236,";
    const { mono } = fonts();

    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, R * k, 0, Math.PI * 2);
    ctx.clip();

    // ground — deep blue-violet glass, a touch lighter at the centre
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, R * k);
    g.addColorStop(0, "#1d1b30");
    g.addColorStop(0.9, "#15142a");
    g.addColorStop(1, "#111022");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, MAP_R * k, 0, Math.PI * 2);
    ctx.clip();

    // streets — asphalt bands a step lighter than the ground
    const n = Math.ceil(MAP_R / P) + 1;
    for (let i = -n; i <= n; i++) {
      const v = i * P;
      const bx = Math.abs(v) < 1e-6;
      const bz = Math.abs(v - BLVD_Z) < 1e-6;
      ctx.fillStyle = lav + (bx ? "0.16)" : "0.1)");
      const wx = (bx ? BLVD : ROAD) * 2 * k;
      ctx.fillRect(X(v) - wx / 2, 0, wx, S);
      ctx.fillStyle = lav + (bz ? "0.16)" : "0.1)");
      const wz = (bz ? BLVD : ROAD) * 2 * k;
      ctx.fillRect(0, Z(v) - wz / 2, S, wz);
    }

    // river — water band with crisp embankments
    ctx.fillStyle = "#24365a";
    ctx.beginPath();
    for (let x = -R; x <= R + 0.001; x += 0.02) ctx.lineTo(X(x), Z(riverZ(x) - RIVER_HW));
    for (let x = R; x >= -R - 0.001; x -= 0.02) ctx.lineTo(X(x), Z(riverZ(x) + RIVER_HW));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(170,196,240,0.55)";
    ctx.lineWidth = 3;
    for (const off of [-RIVER_HW, RIVER_HW]) {
      ctx.beginPath();
      for (let x = -R; x <= R + 0.001; x += 0.02) {
        const px = X(x);
        const pz = Z(riverZ(x) + off);
        if (x === -R) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      }
      ctx.stroke();
    }

    // depth: the back of the map falls off toward the horizon
    const hz = ctx.createLinearGradient(0, 0, 0, S);
    hz.addColorStop(0, "rgba(6,5,16,0.42)");
    hz.addColorStop(0.45, "rgba(6,5,16,0.08)");
    hz.addColorStop(1, "rgba(6,5,16,0)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, 0, S, S);

    // the concierge's search circle round you ("near you")
    const cx = X(YOU[0]);
    const cz = Z(YOU[1]);
    const cr = SEARCH_R * k;
    const fill = ctx.createRadialGradient(cx, cz, 0, cx, cz, cr);
    fill.addColorStop(0, hexA(accent, 0.34));
    fill.addColorStop(0.75, hexA(accent, 0.22));
    fill.addColorStop(1, hexA(accent, 0.3));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cz, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA(accent, 1);
    ctx.lineWidth = 12;
    ctx.setLineDash([40, 22]);
    ctx.stroke();
    ctx.setLineDash([]);
    // the searched district as a plan: lot footprints, clipped to the circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cz, cr - 8, 0, Math.PI * 2);
    ctx.clip();
    for (const b of buildCity()) {
      if (!b.plan) continue;
      const x = X(b.x - b.w / 2);
      const y = Z(b.z - b.d / 2);
      ctx.fillStyle = "rgba(222,212,255,0.16)";
      ctx.fillRect(x, y, b.w * k, b.d * k);
      ctx.strokeStyle = "rgba(222,212,255,0.42)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, b.w * k - 2, b.d * k - 2);
    }
    ctx.restore();
    // inner shadow under the bezel rim (the plate sits recessed in it)
    const ish = ctx.createRadialGradient(S / 2, S / 2, MAP_R * k * 0.82, S / 2, S / 2, MAP_R * k);
    ish.addColorStop(0, "rgba(4,3,12,0)");
    ish.addColorStop(1, "rgba(4,3,12,0.5)");
    ctx.fillStyle = ish;
    ctx.fillRect(0, 0, S, S);
    ctx.restore(); // map clip

    // route underlay: soft accent band + bright core
    const route = () => {
      ctx.beginPath();
      ROUTE.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = hexA(accent, 0.55);
    ctx.lineWidth = 26;
    route();
    ctx.stroke();
    ctx.strokeStyle = "rgba(240,234,255,0.9)";
    ctx.lineWidth = 7;
    route();
    ctx.stroke();

    // pick plazas — a ground ring under each pin (the hero gets a double ring)
    PICKS.forEach(({ at, hero }) => {
      ctx.fillStyle = hexA(accent, hero ? 0.5 : 0.35);
      ctx.beginPath();
      ctx.arc(X(at[0]), Z(at[1]), (hero ? 0.036 : 0.028) * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hero ? "rgba(244,241,234,0.95)" : hexA(accent, 1);
      ctx.lineWidth = hero ? 6 : 5;
      ctx.stroke();
      if (hero) {
        ctx.strokeStyle = hexA(accent, 0.9);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(X(at[0]), Z(at[1]), 0.052 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // you are here
    ctx.fillStyle = hexA(accent, 0.45);
    ctx.beginPath();
    ctx.arc(cx, cz, 0.036 * k, 0, Math.PI * 2);
    ctx.fill();

    // bearing bezel band
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, R * k, 0, Math.PI * 2);
    ctx.arc(S / 2, S / 2, MAP_R * k, 0, Math.PI * 2, true);
    ctx.fillStyle = "#1b1930";
    ctx.fill();
    ctx.strokeStyle = hexA(accent, 0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, MAP_R * k, 0, Math.PI * 2);
    ctx.stroke();
    for (let a = 0; a < 360; a += 10) {
      if (a === 0) continue; // N glyph sits there
      const major = a % 30 === 0;
      const t = (a * Math.PI) / 180 - Math.PI / 2;
      const r0 = (R - 0.012) * k;
      const r1 = (R - (major ? 0.036 : 0.024)) * k;
      ctx.strokeStyle = lav + (major ? "0.7)" : "0.32)");
      ctx.lineWidth = major ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.cos(t) * r0, S / 2 + Math.sin(t) * r0);
      ctx.lineTo(S / 2 + Math.cos(t) * r1, S / 2 + Math.sin(t) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(244,241,234,0.95)";
    ctx.font = `700 34px ${mono}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", S / 2, (R - MAP_R) * k * 0.5 + 2);
    ctx.restore();
  };
}
