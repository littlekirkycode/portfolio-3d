"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  HALF_W,
  WALL_H,
  ROOMS,
  ALCOVE_OPEN_W,
  FEATURE_X,
  GALLERY_X,
  GALLERY_SPAN,
  GALLERY_SIDE,
  GATES,
  PORTHOLES,
  START_X,
  WALL_START,
  BRIDGE_ENTRY_X,
  ATRIUM_C,
  TILE,
} from "../hallConfig";
import { familyVar, roundRect } from "../canvas2d";
import { NEUTRAL } from "../theme";

/* ── the corridor between the rooms ──────────────────────────────────────────
 * The blank wall runs used to be one flat repeated kit tile for 20-30 m at a
 * time. This layer authors them as a ship's working corridor:
 *
 *  - WALL MODULES on the 2 m tile grid (between the 4 m pilaster ribs), in
 *    a deliberate rhythm of four types: framed inset PANELS, SERVICE bays
 *    (pipes, valve wheel, junction box), VENT grilles and status DISPLAYS
 *    (environment / power / comms / crew). They stop at 2.2 m so the cove
 *    down-wash lights the band above them.
 *  - FLOOR GRATES: slotted steel grating along both walls (the glossy centre
 *    keeps the ceiling-light reflections).
 *  - CABLE TRAYS: a tray with cable runs along each ceiling edge, under the
 *    beams, cut round the blade signs, gates and the open atrium.
 *  - CREW FITTINGS in the module rhythm: fold-down benches and emergency
 *    cabinets (glazed door, extinguisher).
 *  - DECK IDENTITY: per-deck light-strip colour + wall-plate tint, and large
 *    painted stencils ("DECK 02 · EXHIBITS 04–06 · BRIDGE") on the band
 *    above the modules.
 *
 * Everything is instanced: one InstancedMesh per (module type × material),
 * so ~20 draws for the whole hall. No lights; the only emitters are small
 * steady status LEDs and the display screens (nothing blinks).
 * ──────────────────────────────────────────────────────────────────────── */

const MOD_W = 1.76;
const MOD_Y0 = 0.22;
const MOD_Y1 = 2.2;
const MOD_H = MOD_Y1 - MOD_Y0;
const HALL_X0 = START_X + 3.4; // just past the airlock door
const HALL_X1 = BRIDGE_ENTRY_X - 0.2;

type Side = 1 | -1;
type Span = [number, number];

/* Each deck (split by the bulkhead gates) gets its own light colour + wall
 * tint and its own painted stencils: 01 cool blue, 02 violet, 03 warm amber. */
const DECK_COLORS = ["#8fb4ee", "#a58cf5", "#e6b27a"] as const;
const deckOf = (x: number): number => GATES.filter((g) => x > g.x).length;

/** Wall cuts per side: bay openings + their plaques, the showreel recess, the
 *  gallery glazing, bulkhead-gate collars and portholes. */
function wallCuts(side: Side): Span[] {
  const cuts: Span[] = ROOMS.filter((r) => r.side === side).map((r) => [
    r.x - (ALCOVE_OPEN_W / 2 + 1.25),
    r.x + (ALCOVE_OPEN_W / 2 + 1.25),
  ]);
  if (side === 1) cuts.push([FEATURE_X - 3.6, FEATURE_X + 3.6]);
  if (side === GALLERY_SIDE) cuts.push([GALLERY_X - GALLERY_SPAN / 2 - 0.4, GALLERY_X + GALLERY_SPAN / 2 + 0.4]);
  for (const g of GATES) cuts.push([g.x - 0.7, g.x + 0.7]);
  for (const p of PORTHOLES) if (p.side === side) cuts.push([p.x - 1.7, p.x + 1.7]);
  return cuts;
}
const blocked = (x0: number, x1: number, cuts: Span[]) => cuts.some(([a, b]) => x1 > a && x0 < b);

type ModType = "panel" | "service" | "vent" | "display" | "bench" | "locker";
type Slot = { x: number; side: Side; type: ModType; variant: number; deck: number };

/** Module slots on tile-column centres, typed by a fixed 10-slot rhythm so
 *  each run reads composed rather than random: panels carry the run, with a
 *  service bay, a vent, a display, a fold-down bench and an emergency
 *  cabinet in every cycle. */
const SLOTS: Slot[] = (() => {
  const out: Slot[] = [];
  for (const side of [-1, 1] as Side[]) {
    const cuts = wallCuts(side);
    let k = side === 1 ? 5 : 0; // half a cycle out of phase: the walls never mirror
    let displays = side === 1 ? 1 : 0;
    for (let x = WALL_START + TILE / 2; x < HALL_X1; x += TILE) {
      if (x - MOD_W / 2 < HALL_X0 || x + MOD_W / 2 > HALL_X1) continue;
      // the rhythm carries across bays/gates (runs are short — resetting it
      // per run meant the later slots in the cycle never came up)
      if (blocked(x - MOD_W / 2, x + MOD_W / 2, cuts)) continue;
      const m = k % 10;
      const type: ModType =
        m === 2 ? "service"
        : m === 5 ? "vent"
        : m === 7 ? "display"
        : m === 4 ? "bench"
        : m === 9 ? "locker"
        : "panel";
      out.push({ x, side, type, variant: type === "display" ? displays++ % 4 : k, deck: deckOf(x) });
      k++;
    }
  }
  return out;
})();

/* ── module geometry (local: x along the wall, y up, +z out of the wall) ── */

type Part = { geo: THREE.BufferGeometry; mat: MatKey };
type MatKey = "plate" | "frame" | "panel" | "steel" | "dark" | "led" | "ledWarm" | "pipe" | "strip" | "seat" | "glass" | "red";
/** Materials that vary per deck (tint / light colour). */
const DECK_MATS: MatKey[] = ["plate", "strip"];

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
};

function frameParts(z: number, t = 0.05, d = 0.05): THREE.BufferGeometry[] {
  const cx = 0;
  const cy = MOD_Y0 + MOD_H / 2;
  return [
    box(MOD_W, t, d, cx, MOD_Y1 - t / 2, z),
    box(MOD_W, t, d, cx, MOD_Y0 + t / 2, z),
    box(t, MOD_H, d, -MOD_W / 2 + t / 2, cy, z),
    box(t, MOD_H, d, MOD_W / 2 - t / 2, cy, z),
  ];
}

function buildModule(type: ModType): Part[] {
  const cy = MOD_Y0 + MOD_H / 2;
  const parts: Part[] = [];
  const add = (mat: MatKey, ...gs: THREE.BufferGeometry[]) => gs.forEach((geo) => parts.push({ geo, mat }));
  // every module: backing plate + perimeter frame + kick plate + light strip
  add("plate", box(MOD_W, MOD_H, 0.03, 0, cy, 0.015));
  add("frame", ...frameParts(0.045));
  add("steel", box(MOD_W - 0.1, 0.22, 0.02, 0, MOD_Y0 + 0.16, 0.04));
  // steady cool light strip under the top frame — a calm rhythm down the hall
  add("strip", box(MOD_W - 0.16, 0.014, 0.01, 0, MOD_Y1 - 0.075, 0.052));
  if (type === "panel") {
    add("panel", box(MOD_W - 0.34, 1.24, 0.03, 0, cy + 0.2, 0.045));
    add("dark", box(MOD_W - 0.34, 0.012, 0.01, 0, cy + 0.02, 0.062), box(MOD_W - 0.34, 0.012, 0.01, 0, cy + 0.42, 0.062));
    add("frame", box(0.14, 0.05, 0.03, MOD_W / 2 - 0.3, cy + 0.72, 0.065));
    add("led", box(0.03, 0.03, 0.012, MOD_W / 2 - 0.3, cy + 0.72, 0.082));
  } else if (type === "service") {
    add("dark", box(MOD_W - 0.12, MOD_H - 0.12, 0.01, 0, cy, 0.032));
    for (const px of [-0.55, -0.4, -0.25]) {
      const p = new THREE.CylinderGeometry(0.035, 0.035, MOD_H - 0.1, 12);
      p.translate(px, cy, 0.1);
      add("pipe", p);
    }
    for (const by of [MOD_Y0 + 0.45, MOD_Y1 - 0.4]) add("frame", box(0.48, 0.06, 0.1, -0.4, by, 0.07));
    const wheel = new THREE.TorusGeometry(0.1, 0.014, 8, 28);
    wheel.translate(-0.4, cy + 0.12, 0.2);
    add("steel", wheel);
    const hub = new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10);
    hub.rotateX(Math.PI / 2);
    hub.translate(-0.4, cy + 0.12, 0.15);
    add("steel", hub);
    add("panel", box(0.5, 0.62, 0.1, 0.38, cy + 0.2, 0.08));
    add("frame", box(0.5, 0.05, 0.02, 0.38, cy + 0.47, 0.14));
    add("ledWarm", box(0.26, 0.02, 0.012, 0.38, cy + 0.02, 0.137));
    add("led", box(0.03, 0.03, 0.012, 0.56, cy + 0.02, 0.137));
  } else if (type === "vent") {
    add("dark", box(MOD_W - 0.36, 1.1, 0.02, 0, cy + 0.25, 0.035));
    for (let i = 0; i < 9; i++) add("frame", box(MOD_W - 0.38, 0.05, 0.1, 0, cy - 0.23 + i * 0.12, 0.07, -0.55));
    add("frame", ...[
      box(MOD_W - 0.3, 0.05, 0.08, 0, cy + 0.83, 0.06),
      box(MOD_W - 0.3, 0.05, 0.08, 0, cy - 0.33, 0.06),
    ]);
    add("steel", box(0.36, 0.08, 0.02, 0, cy - 0.5, 0.05));
  } else if (type === "bench") {
    // fold-down crew bench: padded back, seat slab on two brackets
    add("seat", box(MOD_W - 0.3, 0.5, 0.07, 0, 0.9, 0.07));
    add("seat", box(MOD_W - 0.3, 0.08, 0.42, 0, 0.47, 0.25));
    add("steel", box(MOD_W - 0.3, 0.02, 0.02, 0, 0.44, 0.46));
    for (const bx of [-0.62, 0.62]) add("frame", box(0.05, 0.26, 0.38, bx, 0.3, 0.21));
    add("frame", box(0.3, 0.06, 0.02, MOD_W / 2 - 0.35, 1.6, 0.045));
  } else if (type === "locker") {
    // emergency cabinet: glazed door, extinguisher inside, warm header
    const lx = -0.3;
    add("panel", box(0.8, 1.5, 0.26, lx, cy + 0.05, 0.13));
    add("dark", box(0.66, 1.2, 0.01, lx, cy - 0.02, 0.2));
    add(
      "frame",
      box(0.8, 0.06, 0.04, lx, cy + 0.77, 0.27),
      box(0.8, 0.06, 0.04, lx, cy - 0.67, 0.27),
      box(0.06, 1.5, 0.04, lx - 0.37, cy + 0.05, 0.27),
      box(0.06, 1.5, 0.04, lx + 0.37, cy + 0.05, 0.27),
    );
    const ext = new THREE.CylinderGeometry(0.085, 0.085, 0.58, 16);
    ext.translate(lx, cy - 0.2, 0.13);
    add("red", ext);
    const top = new THREE.CylinderGeometry(0.03, 0.05, 0.1, 10);
    top.translate(lx, cy + 0.14, 0.13);
    add("dark", top);
    add("glass", box(0.68, 1.34, 0.01, lx, cy + 0.05, 0.285));
    add("ledWarm", box(0.5, 0.04, 0.01, lx, cy + 0.69, 0.295));
    add("steel", box(0.03, 0.22, 0.04, lx + 0.28, cy + 0.05, 0.3));
    // small service plate beside it
    add("frame", box(0.46, 0.34, 0.03, 0.45, cy + 0.35, 0.045));
    add("led", box(0.03, 0.03, 0.012, 0.45, cy + 0.35, 0.062));
  } else {
    // display bay: bezel + (screen drawn separately) + keypad greebles
    add("panel", box(1.36, 0.84, 0.06, 0, cy + 0.3, 0.05));
    for (let i = 0; i < 6; i++) add("steel", box(0.07, 0.05, 0.02, -0.18 + (i % 3) * 0.12, cy - 0.3 - Math.floor(i / 3) * 0.08, 0.05));
    add("led", box(0.03, 0.03, 0.012, 0.24, cy - 0.34, 0.052));
  }
  return parts;
}

/* ── display screens ─────────────────────────────────────────────────────── */

const SCREEN_W = 1.22;
const SCREEN_H = SCREEN_W * (288 / 512);

function paintStatus(ctx: CanvasRenderingContext2D, variant: number) {
  const mono = familyVar("--ff-mono", "ui-monospace, monospace");
  const sans = familyVar("--ff-body", "system-ui, sans-serif");
  const W = 512;
  const H = 288;
  const accent = "#7fb0e8";
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d1524");
  bg.addColorStop(1, "#070b13");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(127,176,232,0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, W - 10, H - 10, 10);
  ctx.stroke();
  ctx.textBaseline = "middle";
  const title = ["ENVIRONMENT", "POWER GRID", "COMMS ARRAY", "CREW"][variant];
  ctx.font = `600 20px ${mono}`;
  ctx.fillStyle = accent;
  ctx.textAlign = "left";
  ctx.fillText(title, 26, 36);
  ctx.textAlign = "right";
  ctx.fillStyle = "#6fe0a8";
  ctx.fillText("NOMINAL", W - 26, 36);
  ctx.fillStyle = "rgba(127,176,232,0.2)";
  ctx.fillRect(26, 58, W - 52, 2);
  ctx.textAlign = "left";
  const row = (label: string, value: string, y: number, frac: number) => {
    ctx.font = `500 18px ${mono}`;
    ctx.fillStyle = "rgba(244,241,234,0.6)";
    ctx.fillText(label, 26, y);
    ctx.font = `600 30px ${sans}`;
    ctx.fillStyle = "#f4f1ea";
    ctx.textAlign = "right";
    ctx.fillText(value, W - 26, y);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(26, y + 24, W - 52, 6);
    ctx.fillStyle = accent;
    ctx.fillRect(26, y + 24, (W - 52) * frac, 6);
  };
  if (variant === 0) {
    row("O2", "21.0 %", 94, 0.7);
    row("PRESSURE", "101 kPa", 158, 0.62);
    row("TEMP", "20.5 °C", 222, 0.5);
  } else if (variant === 1) {
    row("REACTOR", "98 %", 94, 0.98);
    row("LIFE SUPPORT", "24 %", 158, 0.24);
    row("EXHIBITS", "31 %", 222, 0.31);
  } else if (variant === 2) {
    row("UPLINK", "STABLE", 94, 0.9);
    row("LATENCY", "42 ms", 158, 0.2);
    row("CHANNELS", "3 OPEN", 222, 0.6);
  } else {
    ctx.font = `600 18px ${mono}`;
    ctx.fillStyle = "rgba(244,241,234,0.6)";
    ctx.fillText("ON DUTY · 1 / 1", 26, 96);
    ctx.font = `700 44px ${sans}`;
    ctx.fillStyle = "#f4f1ea";
    ctx.fillText("James Kirkham", 26, 150);
    ctx.font = `500 20px ${sans}`;
    ctx.fillStyle = "rgba(244,241,234,0.72)";
    ctx.fillText("Founder & Full-Stack Engineer", 26, 196);
    ctx.font = `500 16px ${mono}`;
    ctx.fillStyle = accent;
    ctx.fillText("ROLES: CAPTAIN · ENGINEER · EVERYTHING", 26, 240);
  }
}

function useStatusTextures() {
  const texs = useMemo(
    () =>
      [0, 1, 2, 3].map((v) => {
        const c = document.createElement("canvas");
        c.width = 1024;
        c.height = 576;
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        return { c, t, v };
      }),
    [],
  );
  useEffect(() => {
    const draw = () =>
      texs.forEach(({ c, t, v }) => {
        const ctx = c.getContext("2d")!;
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        paintStatus(ctx, v);
        t.needsUpdate = true;
      });
    draw();
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && draw()).catch(() => {});
    return () => {
      cancelled = true;
      texs.forEach(({ t }) => t.dispose());
    };
  }, [texs]);
  return texs.map((x) => x.t);
}

/* ── placement helpers ───────────────────────────────────────────────────── */

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Matrix for a module on wall `side` at hall x (wall face = local z 0). */
function slotMatrix(x: number, side: Side, out: THREE.Matrix4) {
  _q.setFromAxisAngle(Y_AXIS, side < 0 ? 0 : Math.PI);
  _p.set(x, 0, side * HALF_W);
  return out.compose(_p, _q, _s);
}

function Instanced({ geo, mat, mats }: { geo: THREE.BufferGeometry; mat: THREE.Material; mats: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mats]);
  if (!mats.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, mats.length]} frustumCulled={false} />;
}

/* ── wall modules ────────────────────────────────────────────────────────── */

function WallModules({ mats }: { mats: Record<string, THREE.Material> }) {
  const screens = useStatusTextures();
  const batches = useMemo(() => {
    const out: { key: string; geo: THREE.BufferGeometry; mat: string; mats: THREE.Matrix4[] }[] = [];
    for (const type of ["panel", "service", "vent", "display", "bench", "locker"] as ModType[]) {
      const slots = SLOTS.filter((s) => s.type === type);
      if (!slots.length) continue;
      const matrices = slots.map((s) => slotMatrix(s.x, s.side, new THREE.Matrix4()));
      const byDeck = [0, 1, 2].map((d) => slots.flatMap((s, i) => (s.deck === d ? [matrices[i]] : [])));
      const parts = buildModule(type);
      const byMat = new Map<MatKey, THREE.BufferGeometry[]>();
      for (const p of parts) {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
        g.deleteAttribute("uv");
        (byMat.get(p.mat) ?? byMat.set(p.mat, []).get(p.mat)!).push(g);
      }
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        if (DECK_MATS.includes(mat)) {
          byDeck.forEach((ms, d) => {
            if (ms.length) out.push({ key: `${type}-${mat}-${d}`, geo: merged, mat: `${mat}${d}`, mats: ms });
          });
        } else {
          out.push({ key: `${type}-${mat}`, geo: merged, mat, mats: matrices });
        }
      }
    }
    return out;
  }, []);
  useEffect(() => () => batches.forEach((b) => b.geo.dispose()), [batches]);
  const screenGeo = useMemo(() => new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), []);
  useEffect(() => () => screenGeo.dispose(), [screenGeo]);
  const screenBatches = useMemo(
    () =>
      [0, 1, 2, 3].map((v) =>
        SLOTS.filter((s) => s.type === "display" && s.variant === v).map((s) => {
          const m = slotMatrix(s.x, s.side, new THREE.Matrix4());
          return m.multiply(new THREE.Matrix4().makeTranslation(0, MOD_Y0 + MOD_H / 2 + 0.3, 0.082));
        }),
      ),
    [],
  );
  const screenMats = useMemo(
    () => screens.map((t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color(0.85, 0.85, 0.85) })),
    [screens],
  );
  useEffect(() => () => screenMats.forEach((m) => m.dispose()), [screenMats]);
  return (
    <group>
      {batches.map((b) => (
        <Instanced key={b.key} geo={b.geo} mat={mats[b.mat]} mats={b.mats} />
      ))}
      {screenBatches.map((ms, v) => (
        <Instanced key={`scr${v}`} geo={screenGeo} mat={screenMats[v]} mats={ms} />
      ))}
    </group>
  );
}

/* ── floor grates ────────────────────────────────────────────────────────── */

const GRATE_W = 0.62;
const GRATE_Z = HALF_W - 0.14 - GRATE_W / 2;

function FloorGrates() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2a303c";
    g.fillRect(0, 0, 256, 128);
    // slots across the grate
    for (let x = 10; x < 250; x += 14) {
      g.fillStyle = "#07090e";
      g.fillRect(x, 14, 7, 100);
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(x + 7, 14, 1, 100);
    }
    g.strokeStyle = "#48505e";
    g.lineWidth = 4;
    g.strokeRect(2, 2, 252, 124);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.75, polygonOffset: true, polygonOffsetFactor: -2 }),
    [tex],
  );
  useEffect(
    () => () => {
      tex.dispose();
      mat.dispose();
    },
    [tex, mat],
  );
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(TILE - 0.04, GRATE_W);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const matrices = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (const side of [-1, 1] as Side[]) {
      const cuts: Span[] = ROOMS.filter((r) => r.side === side).map((r) => [r.x - ALCOVE_OPEN_W / 2 - 0.9, r.x + ALCOVE_OPEN_W / 2 + 0.9]);
      for (const g of GATES) cuts.push([g.x - 0.5, g.x + 0.5]);
      for (let x = WALL_START + TILE / 2; x < HALL_X1; x += TILE) {
        if (x - TILE / 2 < HALL_X0 - 1 || blocked(x - TILE / 2, x + TILE / 2, cuts)) continue;
        out.push(new THREE.Matrix4().makeTranslation(x, 0.008, side * GRATE_Z));
      }
    }
    return out;
  }, []);
  return <Instanced geo={geo} mat={mat} mats={matrices} />;
}

/* ── ceiling cable trays ─────────────────────────────────────────────────── */

const TRAY_Y = 3.5;
const TRAY_Z = HALF_W - 0.62;

function CableTrays({ mats }: { mats: Record<string, THREE.Material> }) {
  const segs = useMemo(() => {
    // blade signs hang ~5.2 m before each bay (Wayfinding), gates, atrium
    const cuts: Span[] = [];
    for (const r of ROOMS) cuts.push([r.x - 6.2, r.x - 4.2], [r.x + 4.2, r.x + 6.2]);
    for (const g of GATES) cuts.push([g.x - 0.8, g.x + 0.8]);
    cuts.push([ATRIUM_C - TILE * 2.5 - 0.3, ATRIUM_C + TILE * 2.5 + 0.3]);
    cuts.sort((a, b) => a[0] - b[0]);
    const out: Span[] = [];
    let x = HALL_X0;
    for (const [a, b] of cuts) {
      if (a > x + 0.8) out.push([x, Math.min(a, HALL_X1)]);
      x = Math.max(x, b);
    }
    if (x < HALL_X1 - 0.8) out.push([x, HALL_X1]);
    return out.filter(([a, b]) => b - a > 0.8);
  }, []);
  const parts = useMemo(() => {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const cable = new THREE.CylinderGeometry(1, 1, 1, 10);
    cable.rotateZ(Math.PI / 2);
    const trays: THREE.Matrix4[] = [];
    const lips: THREE.Matrix4[] = [];
    const cables: THREE.Matrix4[] = [];
    const hangers: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    for (const side of [-1, 1] as Side[]) {
      const z = side * TRAY_Z;
      for (const [a, b] of segs) {
        const len = b - a;
        const cx = (a + b) / 2;
        trays.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, TRAY_Y, z), q, new THREE.Vector3(len, 0.02, 0.44)));
        for (const s of [-1, 1]) {
          lips.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, TRAY_Y + 0.05, z + s * 0.21), q, new THREE.Vector3(len, 0.1, 0.02)));
        }
        [
          [-0.12, 0.045, 0.034],
          [-0.03, 0.04, 0.03],
          [0.06, 0.05, 0.04],
          [0.14, 0.035, 0.026],
        ].forEach(([dz, dy, r]) =>
          cables.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, TRAY_Y + 0.01 + dy, z + dz), q, new THREE.Vector3(len, r, r))),
        );
        for (let hx = a + 0.6; hx < b - 0.3; hx += 2) {
          hangers.push(new THREE.Matrix4().compose(new THREE.Vector3(hx, (TRAY_Y + WALL_H) / 2, z), q, new THREE.Vector3(0.03, WALL_H - TRAY_Y, 0.03)));
        }
      }
    }
    return { unitBox, cable, trays, lips, cables, hangers };
  }, [segs]);
  useEffect(
    () => () => {
      parts.unitBox.dispose();
      parts.cable.dispose();
    },
    [parts],
  );
  return (
    <group>
      <Instanced geo={parts.unitBox} mat={mats.frame} mats={parts.trays} />
      <Instanced geo={parts.unitBox} mat={mats.frame} mats={parts.lips} />
      <Instanced geo={parts.cable} mat={mats.dark} mats={parts.cables} />
      <Instanced geo={parts.unitBox} mat={mats.steel} mats={parts.hangers} />
    </group>
  );
}

/* ── deck stencils ───────────────────────────────────────────────────────── */

const STENCIL_W = 2.5;
const STENCIL_H = STENCIL_W * (256 / 1024);

/** Exhibit index range painted on each deck ("EXHIBITS 04–06"). */
const DECK_RANGE = [0, 1, 2].map((d) => {
  const idx = ROOMS.filter((r) => deckOf(r.x) === d).map((r) => r.index);
  return idx.length ? `EXHIBITS ${idx[0]}–${idx[idx.length - 1]}` : "";
});

function paintStencil(ctx: CanvasRenderingContext2D, deck: number, arrowLeft: boolean) {
  const mono = familyVar("--ff-mono", "ui-monospace, monospace");
  const c = DECK_COLORS[deck];
  ctx.clearRect(0, 0, 1024, 256);
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const x0 = arrowLeft ? 150 : 24;
  ctx.globalAlpha = 0.78;
  ctx.font = `700 118px ${mono}`;
  ctx.fillText(`DECK 0${deck + 1}`, x0, 104);
  ctx.globalAlpha = 0.55;
  ctx.fillRect(x0, 178, 840, 5);
  ctx.font = `600 38px ${mono}`;
  ctx.fillText(`${DECK_RANGE[deck]}   ·   BRIDGE`, x0, 222);
  // arrow toward the bridge (+x): points right on the −z wall, left on +z
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = 16;
  ctx.beginPath();
  if (arrowLeft) {
    ctx.moveTo(110, 60);
    ctx.lineTo(40, 128);
    ctx.lineTo(110, 196);
  } else {
    ctx.moveTo(912, 60);
    ctx.lineTo(982, 128);
    ctx.lineTo(912, 196);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function DeckStencils() {
  const texs = useMemo(
    () =>
      [0, 1, 2].flatMap((d) =>
        [false, true].map((left) => {
          const c = document.createElement("canvas");
          c.width = 1024;
          c.height = 256;
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          return { c, t, d, left };
        }),
      ),
    [],
  );
  useEffect(() => {
    const draw = () =>
      texs.forEach(({ c, t, d, left }) => {
        paintStencil(c.getContext("2d")!, d, left);
        t.needsUpdate = true;
      });
    draw();
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && draw()).catch(() => {});
    return () => {
      cancelled = true;
      texs.forEach(({ t }) => t.dispose());
    };
  }, [texs]);
  const mats = useMemo(
    () => texs.map(({ t }) => new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })),
    [texs],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  // every ~9th panel slot per side, at least 14 m apart
  const spots = useMemo(() => {
    const out: { x: number; side: Side; deck: number }[] = [];
    for (const side of [-1, 1] as Side[]) {
      let n = side === 1 ? 4 : 1;
      let lastX = -Infinity;
      for (const s of SLOTS) {
        if (s.side !== side || s.type !== "panel") continue;
        n++;
        if (n % 9 !== 0 || s.x - lastX < 14) continue;
        out.push({ x: s.x, side, deck: s.deck });
        lastX = s.x;
      }
    }
    return out;
  }, []);
  return (
    <group>
      {spots.map((sp, i) => (
        <mesh
          key={i}
          position={[sp.x, 2.74, sp.side * (HALF_W - 0.03)]}
          rotation-y={sp.side < 0 ? 0 : Math.PI}
          material={mats[sp.deck * 2 + (sp.side > 0 ? 1 : 0)]}
        >
          <planeGeometry args={[STENCIL_W, STENCIL_H]} />
        </mesh>
      ))}
    </group>
  );
}

/* ── the layer ───────────────────────────────────────────────────────────── */

export default function HallDressing() {
  const mats = useMemo<Record<string, THREE.Material>>(
    () => ({
      ...Object.fromEntries(
        DECK_COLORS.flatMap((c, d) => [
          [`plate${d}`, new THREE.MeshStandardMaterial({ color: new THREE.Color("#283042").lerp(new THREE.Color(c), 0.07), roughness: 0.58, metalness: 0.3 })],
          [`strip${d}`, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.62), toneMapped: false })],
        ]),
      ),
      seat: new THREE.MeshStandardMaterial({ color: "#2b303d", roughness: 0.66, metalness: 0.08 }),
      glass: new THREE.MeshStandardMaterial({ color: "#cfd8ff", roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.16, depthWrite: false }),
      red: new THREE.MeshStandardMaterial({ color: "#b0402c", roughness: 0.4, metalness: 0.3 }),
      frame: new THREE.MeshStandardMaterial({ color: "#4f5a70", roughness: 0.34, metalness: 0.7 }),
      panel: new THREE.MeshStandardMaterial({ color: "#4a556f", roughness: 0.46, metalness: 0.3 }),
      steel: new THREE.MeshStandardMaterial({ color: NEUTRAL.steel, roughness: 0.32, metalness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: "#0f1219", roughness: 0.7, metalness: 0.2 }),
      pipe: new THREE.MeshStandardMaterial({ color: "#5a6478", roughness: 0.3, metalness: 0.85 }),
      led: new THREE.MeshBasicMaterial({ color: new THREE.Color("#6fe0a8").multiplyScalar(0.9), toneMapped: false }),
      ledWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb070").multiplyScalar(0.7), toneMapped: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return (
    <group>
      <WallModules mats={mats} />
      <FloorGrates />
      <CableTrays mats={mats} />
      <DeckStencils />
    </group>
  );
}
