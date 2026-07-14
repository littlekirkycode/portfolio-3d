"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { Model } from "./ModelLoader";
import { scrollRefs, fxRefs, pointerRefs, useScrollStore } from "@/lib/scrollStore";
import { damp } from "@/lib/math";
import { useReducedMotion } from "@/lib/useReducedMotion";
import {
  cameraXAt,
  focusAt,
  galleryFocusAt,
  featureFocusAt,
  HALF_W,
  GALLERY_X,
  GALLERY_SIDE,
  FEATURE_X,
  BRIDGE_ENTER_P,
  ROOMS,
} from "./hallConfig";
import { familyVar } from "./canvas2d";
import { withBase } from "@/lib/asset";
import { playQuip } from "@/lib/useShipAudio";
import { showAchievement } from "@/components/ui/AchievementToast";
import { track } from "@/lib/analytics";

/**
 * UNIT-07 — escort drone (Quaternius "Robot Enemy Flying", CC0). Flies ~one
 * beat AHEAD of the camera down the corridor; when a bay takes focus it peels
 * off and PARKS high beside the bay plaque (past the opening frame) so it
 * never sits between the camera and the exhibit — the old centre-drift put it
 * square in the sightline mid-turn (QA: "he's in the way as you turn").
 * Runs the GLB's own skinned Idle/Run clips (weight-crossfaded by scroll
 * speed), pops dry one-liner speech bubbles per exhibit, and after ~4s of no
 * scrolling turns to face you with a bored head-tilt sway.
 *
 * Loaded WITHOUT cloning — this is drone.glb's only consumer, and skinned
 * rigs only animate reliably on their original skeleton.
 *
 * All temp objects live at module scope — ZERO allocations in useFrame.
 */

const DRONE_URL = withBase("/models/drone.glb");
// No module-scope preload: staged in ModelLoader's preloadDeferredModels()
// (idle-time) so the drone never competes with the corridor shell's fetch.

// how far (in progress units) the drone leads the camera
const LEAD = 0.035;
const HOVER_Y = 1.45;
const SCALE = 0.6; // world-units max dimension
const CLIP_IDLE = "CharacterArmature|Idle";
const CLIP_RUN = "CharacterArmature|Run";

/* ── speech bubbles ──────────────────────────────────────────────────────── */

const QUIP_HOLD = 4.5; // seconds a bubble stays up
const INK = "#f4f1ea";

const ROOM_QUIPS: Record<string, string> = {
  selfquest: "1.3M downloads. i counted.",
  selfaware: "remembers stuff so james doesn't have to.",
  selfgrow: "49 days clean. we're all proud of you.",
  nuremi: "i know a shortcut. it's this way. trust me.",
  xuabelle: "shiny. do NOT tap the glass.",
  capabilities: "he built me in a weekend. i have concerns.",
  experience: "six roles. one guy. zero complaints filed.",
  allied: "defence-grade. act natural.",
  achievements: "trophies shown larger than actual pride.",
};

const IDLE_QUIPS = [
  "no rush. i'm paid hourly.",
  "take your time. i'm literally floating.",
  "psst. the scroll wheel. use it.",
];

/** Idle lines + ONE time-aware line for the night-shift crowd (finding 45). */
function idleQuipsNow(): string[] {
  const h = new Date().getHours();
  if (h >= 0 && h <= 4) {
    return [
      ...IDLE_QUIPS,
      h === 0 ? "it's midnight where you are. respect." : `it's ${h}am where you are. respect.`,
    ];
  }
  return IDLE_QUIPS;
}

// escalating responses to being clicked/tapped — the 5th lands WITH the
// barrel roll (every 5th poke re-triggers it; the modulo keeps them aligned)
const POKE_QUIPS = [
  "careful. i'm load-bearing.",
  "UNIT-07 is not a toy.",
  "ok. that's mildly annoying.",
  "i know where you sleep. it's the crew bunk.",
  "fine. ONE barrel roll. don't tell james.",
];
const ROLL_DUR = 1.4; // seconds — the 720° payoff spin

/* ── crew log: visit count + bay dwell persistence (finding 45) ──────────────
 * Follows useShipAudio's localStorage pattern ("ship-audio"): tiny, guarded,
 * fails silent everywhere (private mode, disabled storage). */

const LS_LOG = "ship-log";
const LS_MORALE = "ship-morale"; // "1" once the achievement toast has shown

type ShipLog = { v: number; bays: Record<string, number> };

function readLog(): ShipLog {
  try {
    const raw = localStorage.getItem(LS_LOG);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ShipLog>;
      return {
        v: typeof parsed.v === "number" ? parsed.v : 0,
        bays:
          parsed.bays && typeof parsed.bays === "object"
            ? (parsed.bays as Record<string, number>)
            : {},
      };
    }
  } catch {}
  return { v: 0, bays: {} };
}

function writeLog(log: ShipLog): void {
  try {
    localStorage.setItem(LS_LOG, JSON.stringify(log));
  } catch {}
}

// one visit per page load (module scope survives StrictMode remounts)
let visitCounted = false;

// reused temps (never allocated per-frame)
const _look = new THREE.Object3D();
const _qTravel = new THREE.Quaternion();
const _qAim = new THREE.Quaternion();
const _qRoll = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _camRight = new THREE.Vector3();

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function Drone({ mobile = false }: { mobile?: boolean }) {
  const reduced = useReducedMotion();
  const camera = useThree((s) => s.camera);

  const groupRef = useRef<THREE.Group>(null); // position only
  const bodyRef = useRef<THREE.Group>(null); // rotation + model + lights
  const bubbleRef = useRef<THREE.Group>(null); // camera-billboarded
  const bubbleMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const tailMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const slabRef = useRef<THREE.Mesh>(null);
  const scanRef = useRef<THREE.Group>(null);
  const navARef = useRef<THREE.Mesh>(null);
  const navBRef = useRef<THREE.Mesh>(null);

  const t = useRef(0);
  const idleT = useRef(0);
  const idleBlend = useRef(0);
  const scanScale = useRef(0.001);
  const init = useRef(false);
  const runWeight = useRef(0);

  const quipKey = useRef<string | null>(null);
  const quipShownAt = useRef(-99);
  const quipOp = useRef(0);
  const idleQuipIdx = useRef(0);
  const idleQuipNextAt = useRef(0);
  const pokeIdx = useRef(-1);
  const pokeAt = useRef(-99);
  const bodyScale = useRef(1);
  const rollAt = useRef(-99); // t.current when a barrel roll started
  const bobKick = useRef(0); // reduced-motion 5th-poke hop (decays in-frame)

  // Time-aware idle table + the returning-visitor intro, both fixed at mount.
  const idleQuips = useMemo(() => idleQuipsNow(), []);
  // Returning visitors get a personalised intro naming the LEAST-dwelled bay
  // from their previous visits (the one they rushed past). Reads the log
  // BEFORE this load's visit is counted (the effect below runs post-render).
  const introQuip = useMemo(() => {
    const log = readLog();
    if (log.v < 1) return "UNIT-07. follow me.";
    const seen = Object.entries(log.bays);
    if (seen.length === 0) return "back again? the corridor's how you left it.";
    seen.sort((a, b) => a[1] - b[1]);
    const room = ROOMS.find((r) => r.id === seen[0][0]);
    if (!room) return "back again? i kept the lights on.";
    return `back again? the ${room.title.toLowerCase()} bay missed you.`;
  }, []);

  // Crew log: count the visit once per load; meter dwell per focused bay
  // (coarse focusedRoom transitions — never per-frame) so the NEXT visit's
  // intro can name the least-loved one.
  useEffect(() => {
    if (!visitCounted) {
      visitCounted = true;
      const log = readLog();
      log.v += 1;
      writeLog(log);
    }
    // R5: hidden-tab time must NOT count as dwell — the frame loop pauses and
    // focusedRoom can't change while hidden, but performance.now() keeps
    // advancing, so a 30-min tab switch used to book ~1800s against the open
    // bay and permanently skew the "missed you" intro (AnalyticsProvider
    // already guarded its own dwell metric this way). `since` is the start of
    // the current CREDITABLE (visible) stretch, or null while the tab is
    // hidden — so a pagehide/unmount flush after a long-hidden stretch
    // credits nothing.
    let current: string | null = useScrollStore.getState().focusedRoom;
    const visibleNow = () =>
      document.visibilityState === "hidden" ? null : performance.now();
    let since: number | null = visibleNow();
    const credit = () => {
      if (!current || since === null) return;
      const dwell = (performance.now() - since) / 1000;
      const log = readLog();
      log.bays[current] = (log.bays[current] ?? 0) + dwell;
      writeLog(log);
    };
    const unsub = useScrollStore.subscribe((s, prev) => {
      if (s.focusedRoom === prev.focusedRoom) return;
      credit();
      current = s.focusedRoom;
      since = visibleNow();
    });
    // flush the open bay when the tab goes away mid-dwell
    const onHide = () => {
      credit();
      since = visibleNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") credit(); // flush the visible stretch
      since = visibleNow(); // hidden → null (never creditable); visible → restart
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsub();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      credit();
    };
  }, []);

  // Body mounts through ModelLoader's <Model> — the ONE normalisation path
  // proven to size this FBX-converted rig correctly (a bespoke Box3 fit here
  // measured the armature's ×100 node differently from the skinned-vertex
  // path and rendered the bot at millimetre scale). The mixer below binds to
  // Model's internal SkeletonUtils clone by node name via bodyRef.
  const { animations } = useGLTF(DRONE_URL);
  const { actions } = useAnimations(animations, bodyRef);

  // Self-illumination + culling: grey standard materials are pitch-black on
  // the unlit corridor runs; lift each material's own colour into emissive.
  // Runs on the rig group AFTER Model mounts (parent effects run last);
  // idempotent (copy, not multiply) — drone.glb's materials are its own.
  useEffect(() => {
    groupRef.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false; // skinned bounds go stale under re-scaling
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat && mat.isMeshStandardMaterial) {
        mat.emissive.copy(mat.color);
        mat.emissiveIntensity = 0.32;
      }
    });
  }, []);

  // Skinned clips shipped IN the GLB: Idle plays always; Run blends in with
  // scroll speed (weights damped per-frame — no hard switches).
  useEffect(() => {
    const idle = actions[CLIP_IDLE];
    const run = actions[CLIP_RUN];
    idle?.reset().play();
    if (run) {
      run.reset().play();
      run.setEffectiveWeight(0);
    }
    return () => {
      idle?.stop();
      run?.stop();
    };
  }, [actions]);

  // soft vertical gradient for the scan cone (bright at the apex, fading out)
  const coneTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  // radial falloff for the anti-grav hover glow under the chassis
  const glowTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  // speech-bubble canvases — redrawn only when the quip CHANGES, never
  // per-frame. The tail lives on its OWN small texture/mesh: the slab slides
  // toward frame centre while parked, and the tail must stay anchored over
  // the bot (QA: "the arrow doesn't point to the robot").
  const bubble = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 144;
    const ctx = canvas.getContext("2d")!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const tailCanvas = document.createElement("canvas");
    tailCanvas.width = 96;
    tailCanvas.height = 72;
    const tailCtx = tailCanvas.getContext("2d")!;
    const tailTex = new THREE.CanvasTexture(tailCanvas);
    tailTex.colorSpace = THREE.SRGBColorSpace;
    return { canvas, ctx, tex, tailCanvas, tailCtx, tailTex };
  }, []);

  const drawQuip = (text: string, accent: string) => {
    const { ctx, tex, canvas, tailCtx, tailTex } = bubble;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const mono = familyVar("--ff-mono", "ui-monospace, monospace");
    let fs = 44;
    ctx.font = `500 ${fs}px ${mono}`;
    while (ctx.measureText(text).width > W - 140 && fs > 28) {
      fs -= 2;
      ctx.font = `500 ${fs}px ${mono}`;
    }
    const tw = ctx.measureText(text).width;
    const bw = tw + 76;
    const bx = (W - bw) / 2;
    const by = 18;
    const bh = H - 36;
    // slab + accent border
    ctx.beginPath();
    ctx.moveTo(bx + 18, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, 18);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, 18);
    ctx.arcTo(bx, by + bh, bx, by, 18);
    ctx.arcTo(bx, by, bx + bw, by, 18);
    ctx.closePath();
    ctx.fillStyle = "rgba(8,10,17,0.92)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, by + bh / 2 + 2);
    tex.needsUpdate = true;
    // tail (separate mesh, anchored over the bot)
    tailCtx.clearRect(0, 0, 96, 72);
    tailCtx.beginPath();
    tailCtx.moveTo(14, 6);
    tailCtx.lineTo(82, 6);
    tailCtx.lineTo(48, 62);
    tailCtx.closePath();
    tailCtx.fillStyle = "rgba(8,10,17,0.92)";
    tailCtx.fill();
    tailCtx.lineWidth = 5;
    tailCtx.strokeStyle = accent;
    tailCtx.stroke();
    tailTex.needsUpdate = true;
  };

  useFrame((_, rawDt) => {
    const g = groupRef.current;
    const body = bodyRef.current;
    if (!g || !body) return;
    const dt = Math.min(rawDt, 1 / 30);

    // Match the frozen Rig under reduced motion (camera parks at p=0.05).
    const p = reduced ? 0.05 : scrollRefs.progress;
    const f = focusAt(p);
    const ease = f.room ? f.ease : 0;
    const side = f.room ? f.room.side : 0;

    if (!reduced) t.current += dt;
    const bob = reduced ? 0 : Math.sin(t.current * 2.1) * 0.08;

    // Position: lead the camera down the hall; while a bay is focused, peel
    // off to a PARKING SPOT high beside the bay plaque — visible at the frame
    // edge, clear of the screen/panel sightline. (Old behaviour drifted to
    // the corridor centre at eye height = right in the way mid-turn.)
    const followX = cameraXAt(p + LEAD);
    const gf = galleryFocusAt(p);
    const ff = featureFocusAt(p);
    // bridge dock: past the last slot, ease aside so the camera never runs
    // into the escort at the end of the rail (QA: "you scroll into him")
    const bd = reduced ? 0 : clamp01((p - BRIDGE_ENTER_P) / 0.05);
    // Parking spots are tuned for the desktop frame. On mobile the camera
    // STEPS INTO the focused bay (Rig's portrait step-in) — a parked escort
    // there photobombs the close-up — so the escort just keeps leading.
    const parks = !mobile;
    let tx = followX;
    let tz = 0;
    let ty = HOVER_Y + bob;
    if (parks && f.room) {
      // top corner of the bay opening: inside the dwell frame (the ~47°
      // half-fov cuts at ±~2.4 lateral by the wall) but above/beside the
      // screen, info panel and label sightlines.
      const parkX = f.room.x + 1.9;
      tx = followX + (parkX - followX) * ease;
      tz = side * (HALF_W - 1.1) * ease;
      ty = HOVER_Y + 1.05 * ease + bob; // perch peeks over the info panel; bubble stays in frame
    } else if (parks && gf > 0) {
      // observation gallery: hover before the right panes, in frame with the
      // adrift pilot it's about to gossip about
      const parkX = GALLERY_X + 2.0;
      tx = followX + (parkX - followX) * gf;
      tz = GALLERY_SIDE * (HALF_W - 1.1) * gf;
      ty = HOVER_Y + 0.75 * gf + bob;
    } else if (parks && ff > 0) {
      // entrance showreel: pull aside to the panel's edge and watch it with
      // you instead of drifting out of frame down the corridor
      const parkX = FEATURE_X + 2.2;
      tx = followX + (parkX - followX) * ff;
      tz = (HALF_W - 1.1) * ff; // showreel hangs on the +z wall
      ty = HOVER_Y + 0.35 * ff + bob;
    } else if (!parks && (ff > 0 || gf > 0)) {
      // mobile, side-turned dwells: the lead spot sits at corridor centre —
      // dead in front of the lens once the camera faces the showreel/glazing
      // (QA: giant escort blocking the showreel). Fly on ahead, out of frame.
      tx = followX + 5 * Math.max(ff, gf);
    } else if (bd > 0) {
      // dock low over the port console row, clear of the bridge window and
      // the contact copy on the right half of the frame
      tx = followX + (167.5 - followX) * bd;
      tz = -2.3 * bd;
      ty = HOVER_Y + bob - 0.32 * bd;
    }

    // reduced-motion 5th-poke payoff: a modest hop instead of the barrel roll
    bobKick.current = damp(bobKick.current, 0, 3, dt);
    ty += bobKick.current;

    if (!init.current) {
      g.position.set(tx, ty, tz);
      init.current = true;
    }
    g.position.x = damp(g.position.x, tx, 5, dt);
    g.position.y = damp(g.position.y, ty, 5, dt);
    g.position.z = damp(g.position.z, tz, 5, dt);

    // Idle: no scroll for 4s → hover-turn to face the camera.
    if (!reduced && Math.abs(scrollRefs.velocity) < 0.02) idleT.current += dt;
    else idleT.current = 0;
    idleBlend.current = damp(idleBlend.current, idleT.current > 4 ? 1 : 0, 2.5, dt);

    // Orientation: travel direction → focused bay (by focus ease) → camera (idle).
    _look.position.copy(g.position);
    _look.lookAt(
      g.position.x + (scrollRefs.direction >= 0 ? 6 : -6),
      g.position.y,
      g.position.z,
    );
    _qTravel.copy(_look.quaternion);
    if (parks && f.room) {
      // aim INTO the bay at the prop cluster — the scan beam then runs
      // behind the floating info panel's plane instead of veiling it
      _look.lookAt(f.room.x - 0.4, 0.85, f.room.side * (HALF_W + 2.3));
      _qAim.copy(_look.quaternion);
      _qTravel.slerp(_qAim, ease);
    } else if (parks && gf > 0) {
      // face the pilot drifting in the glazing
      _look.lookAt(GALLERY_X + 1.14, 2.3, GALLERY_SIDE * HALF_W);
      _qAim.copy(_look.quaternion);
      _qTravel.slerp(_qAim, gf);
    } else if (parks && ff > 0) {
      // watch the showreel with you
      _look.lookAt(FEATURE_X, 1.72, HALF_W + 1);
      _qAim.copy(_look.quaternion);
      _qTravel.slerp(_qAim, ff);
    } else if (bd > 0) {
      // docked at the bridge: turn back to see you off
      _look.lookAt(camera.position.x, camera.position.y, 0);
      _qAim.copy(_look.quaternion);
      _qTravel.slerp(_qAim, bd);
    }
    if (idleBlend.current > 0.001) {
      // face you — and track your cursor with a small curious gaze offset
      _look.lookAt(
        camera.position.x + pointerRefs.x * 2.0,
        camera.position.y + pointerRefs.y * 1.0,
        0,
      );
      _qAim.copy(_look.quaternion);
      _qTravel.slerp(_qAim, idleBlend.current);
      // bored: a slow curious head-tilt sway while it waits on you
      _qRoll.setFromAxisAngle(_zAxis, Math.sin(t.current * 1.6) * 0.14 * idleBlend.current);
      _qTravel.multiply(_qRoll);
    }
    body.quaternion.slerp(_qTravel, 1 - Math.exp(-6 * dt));

    // 5th-poke payoff (finding 45): a full 720° barrel roll about the local
    // travel axis, composed AFTER the aim slerp — slerping toward a fast-
    // spinning target would lag and under-rotate. Ends at 4π ≡ identity, so
    // there is no snap when the window closes. (Never triggered under
    // reduced motion — see the poke handler.)
    const ru = (t.current - rollAt.current) / ROLL_DUR;
    if (ru >= 0 && ru < 1) {
      const rs = ru * ru * (3 - 2 * ru);
      _qRoll.setFromAxisAngle(_zAxis, rs * Math.PI * 4);
      body.quaternion.multiply(_qRoll);
    }

    // poke feedback: quick scale pop that settles back to 1
    bodyScale.current = damp(bodyScale.current, 1, 6, dt);
    body.scale.setScalar(bodyScale.current);

    // Clip blend: Run while the hall is scrolling past, Idle while lingering.
    const runOn = !reduced && Math.abs(scrollRefs.velocity) > 0.3;
    runWeight.current = damp(runWeight.current, runOn ? 1 : 0, 4, dt);
    const idleA = actions[CLIP_IDLE];
    const runA = actions[CLIP_RUN];
    if (idleA) {
      idleA.paused = reduced;
      idleA.setEffectiveWeight(1 - runWeight.current);
    }
    if (runA) {
      runA.paused = reduced;
      runA.setEffectiveWeight(runWeight.current);
    }

    // Scan cone: grows over ~0.4s when a bay (or the pilot) is focused.
    const scanOn = !reduced && (ease > 0.55 || gf > 0.55);
    scanScale.current = damp(scanScale.current, scanOn ? 1 : 0.001, 9, dt);
    const scan = scanRef.current;
    if (scan) {
      scan.scale.setScalar(scanScale.current);
      scan.visible = scanScale.current > 0.02;
    }

    // Nav lights: alternating blink on a timer (steady under reduced motion).
    const a = navARef.current;
    const b = navBRef.current;
    if (a) a.visible = reduced ? true : t.current % 1.4 < 0.45;
    if (b) b.visible = reduced ? true : (t.current + 0.7) % 1.4 < 0.45;

    /* ── speech bubble: pick a line, redraw ONLY on change, fade + billboard ── */
    const bub = bubbleRef.current;
    const bubMat = bubbleMatRef.current;
    if (bub && bubMat) {
      let key: string | null = null;
      let text = "";
      let accent = "#ff5c38";
      if (!reduced) {
        if (fxRefs.warp > 0.25) {
          // the DEPART lever is charging the jump
          key = "warp";
          text = "wait. WAIT. i live here—";
        } else if (pokeIdx.current >= 0 && t.current - pokeAt.current < QUIP_HOLD) {
          key = `poke:${pokeIdx.current}:${Math.floor(pokeAt.current * 10)}`;
          text = POKE_QUIPS[pokeIdx.current % POKE_QUIPS.length];
          accent = "#ffd27f";
        } else if (p > BRIDGE_ENTER_P + 0.005) {
          // (small offset past arrival so the dock quip lands after the turn)
          key = "bridge";
          text = "bridge ahead. don't touch the big lever.";
        } else if (parks && gf > 0.6) {
          key = "gallery";
          text = "that's the pilot. he's fine. probably.";
          accent = "#7fb0e8";
        } else if (parks && f.room && ease > 0.6) {
          key = `room:${f.room.id}`;
          text = ROOM_QUIPS[f.room.id] ?? "";
          accent = f.room.accent;
        } else if (parks && ff > 0.6) {
          key = "feature";
          text = "the showreel. i'm in the deleted scenes.";
        } else if (p < 0.045) {
          key = "intro";
          text = introQuip;
        } else if (idleT.current > 6) {
          if (t.current >= idleQuipNextAt.current) {
            idleQuipIdx.current = (idleQuipIdx.current + 1) % idleQuips.length;
            idleQuipNextAt.current = t.current + 7;
          }
          key = `idle:${idleQuipIdx.current}`;
          text = idleQuips[idleQuipIdx.current];
        }
      }
      if (key !== quipKey.current) {
        quipKey.current = key;
        if (key && text) {
          drawQuip(text, accent);
          quipShownAt.current = t.current;
          // 8-bit chirp with the bubble; pokes escalate the pitch (finding 44)
          playQuip(key.startsWith("poke:") ? pokeIdx.current + 1 : 0);
        }
      }
      const showing =
        !reduced && quipKey.current !== null && t.current - quipShownAt.current < QUIP_HOLD;
      quipOp.current = damp(quipOp.current, showing ? 1 : 0, 8, dt);
      bubMat.opacity = quipOp.current;
      if (tailMatRef.current) tailMatRef.current.opacity = quipOp.current;
      bub.visible = quipOp.current > 0.02;
      const s = 0.85 + 0.15 * quipOp.current;
      bub.scale.setScalar(s);
      bub.quaternion.copy(camera.quaternion); // billboard (parent is unrotated)
      bub.position.y = 0.62 + bob * 0.3 - 0.3 * Math.max(ease, gf, ff, bd);
      // While parked/docked the drone sits near a frame edge — slide the
      // SLAB (not the tail) toward frame centre so the text never clips
      // offscreen. After billboarding, the group's local +x IS screen-right,
      // so a local offset does it; the tail stays at x=0, anchored over the
      // bot and still touching the slab's near end.
      const slab = slabRef.current;
      if (slab) {
        const parkBlend = Math.max(ease, gf, ff, bd);
        _camRight.setFromMatrixColumn(camera.matrixWorld, 0);
        const sideSign =
          Math.sign(
            (g.position.x - camera.position.x) * _camRight.x +
              (g.position.z - camera.position.z) * _camRight.z,
          ) || 1;
        slab.position.x = -0.82 * parkBlend * sideSign;
      }
    }
  });

  return (
    <group ref={groupRef} name="drone-rig">
      {/* body group carries ALL rotation; the bubble stays outside it.
          Clickable: poking the escort cycles increasingly unimpressed quips. */}
      <group
        ref={bodyRef}
        onClick={(e) => {
          e.stopPropagation();
          track("drone_poked");
          pokeIdx.current = pokeIdx.current + 1;
          pokeAt.current = t.current;
          bodyScale.current = 1.25;
          // Every 5th poke: the payoff (finding 45). Reduced motion swaps the
          // 720° roll for a modest hop; the achievement toast fires ONCE ever.
          if (pokeIdx.current % POKE_QUIPS.length === POKE_QUIPS.length - 1) {
            if (reduced) bobKick.current = 0.28;
            else rollAt.current = t.current;
            try {
              if (!localStorage.getItem(LS_MORALE)) {
                localStorage.setItem(LS_MORALE, "1");
                showAchievement("ACHIEVEMENT: CREW MORALE OFFICER");
              }
            } catch {}
          }
        }}
      >
        <Model name="drone" maxDim={SCALE} onFloor={false} />

        {/* scan cone: open additive gradient, apex at the drone, opening forward
            (+z = the drone's look direction) */}
        <group ref={scanRef} scale={0.001}>
          <mesh position={[0, -0.05, 0.85]} rotation-x={-Math.PI / 2}>
            <coneGeometry args={[0.55, 1.6, 24, 1, true]} />
            <meshBasicMaterial
              map={coneTex}
              color="#9fd8ff"
              transparent
              opacity={0.4}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* blinking nav lights on the arm mounts */}
        <mesh ref={navARef} position={[-0.28, 0.08, 0]}>
          <sphereGeometry args={[0.032, 8, 8]} />
          <meshBasicMaterial color="#ff4b4b" toneMapped={false} />
        </mesh>
        <mesh ref={navBRef} position={[0.28, 0.08, 0]}>
          <sphereGeometry args={[0.032, 8, 8]} />
          <meshBasicMaterial color="#59ffa1" toneMapped={false} />
        </mesh>
      </group>

      {/* anti-grav hover glow — stays level while the body banks */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.34, 0]}>
        <circleGeometry args={[0.26, 24]} />
        <meshBasicMaterial
          map={glowTex}
          color="#7fd0ff"
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* speech bubble — billboarded to the camera, fades on a 4.5s hold.
          Slab slides toward frame centre while parked; the tail mesh stays
          at x=0 so it always points down at the bot. */}
      <group ref={bubbleRef} position={[0, 0.62, 0]} visible={false}>
        <mesh ref={slabRef} position={[0, 0.1, 0]}>
          <planeGeometry args={[2.0, 0.28]} />
          <meshBasicMaterial
            ref={bubbleMatRef}
            map={bubble.tex}
            transparent
            opacity={0}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, -0.09, 0.005]}>
          <planeGeometry args={[0.16, 0.12]} />
          <meshBasicMaterial
            ref={tailMatRef}
            map={bubble.tailTex}
            transparent
            opacity={0}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
