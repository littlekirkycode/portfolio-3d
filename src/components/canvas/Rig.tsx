"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { PerspectiveCamera } from "three";
import { scrollRefs, useScrollStore } from "@/lib/scrollStore";
import {
  EYE_Y,
  cameraXAt,
  cameraGlideXAt,
  focusAt,
  featureFocusAt,
  galleryFocusAt,
  parkIndexAt,
  progressAtCameraX,
  stopSpacingAt,
  stopsBetween,
  GALLERY_SIDE,
} from "./hallConfig";

type RigProps = { frozen?: boolean; mobile?: boolean };

/** Portrait step distances: how far the camera walks TOWARD (+) or AWAY from
 *  (−) the focused exhibit (world z) at full dwell. Desktop stays on the
 *  corridor centreline. Bays: portrait reads side-glanced alcoves too small,
 *  so the camera closes ~half the gap and frames them head-on. Showreel: the
 *  panel is WIDE — portrait must back off or it crops both edges (QA mobile
 *  shot1). Gallery: no step — the drifting pilot sits off-centre in the
 *  glazing run and any step-in pushes him out of the narrow frame. */
const STEP_BAY = 1.8;
const STEP_FEATURE = -0.6;
const STEP_GALLERY = 0;

/* ── motion tuning ─────────────────────────────────────────────────────────
 * Two ways the camera moves:
 *
 * 1. FREE SCROLL (wheel, trackpad, touch, arrow keys). The scroll progress is
 *    run through ONE critically-damped spring (the "playhead"); camera X is
 *    read off the authored path (hallConfig) at that playhead. The HEAD is a
 *    calmer layer on top: the authored yaw at (a little ahead of) the
 *    playhead is its TARGET, and the actual yaw follows through a velocity-
 *    AND acceleration-limited follower (a person turning their head, not a
 *    gimbal), converging EXACTLY onto the target at rest.
 *
 * 2. GLIDES (nav jump, phone hop, dwell settle, Home/End, hash link). The
 *    provider publishes each glide's start, end and duration
 *    (scrollRefs.glide), so the camera is CHOREOGRAPHED over exactly that
 *    duration instead of chasing the page: camera x eases from where it is to
 *    the destination on a quintic (zero velocity + acceleration at both
 *    ends), and the head follows the authored yaw at that x (one-stop hops:
 *    a single cosine pan spread over the whole hop, finishing as the camera
 *    parks) or, on long trips, turns to look down the corridor, flies, and
 *    turns into the destination bay. Following the dwell path through the
 *    page glide instead crammed the whole travel into the middle third of
 *    the hop (the parks eat the rest): the camera darted at ~4x its average
 *    speed and the head could only arrive late. */
/** Playhead spring stiffness (rad/s). Critically damped: no overshoot; ~0.3 s
 *  to cover 63% of a step, ~0.65 s to settle. */
const PLAY_OMEGA = 7.5;
/** Stiffer playhead while a programmatic glide WITHOUT a fixed duration runs
 *  (rare: a Lenis-internal lerp glide) — it is already smooth. */
const PLAY_OMEGA_GLIDE = 13;
/** Heuristic teleport detection, for scroll jumps that did NOT come through
 *  an `immediate` scrollTo (those bump scrollRefs.cutSeq and always cut):
 *  raw progress jumping this far in ONE frame at an impossible speed. The
 *  speed test keeps a long frame hitch during a legitimate glide from being
 *  mistaken for one; SNAP_ALWAYS catches a teleport inside a hitch. */
const SNAP_JUMP = 0.15;
const SNAP_SPEED = 2.5; // progress/s — nav glides peak ~0.6
const SNAP_ALWAYS = 0.4;
/** Head-turn authority ("gaze", 0..1) during FREE scroll — how much of the
 *  authored turn the head follows. It only drops when the visitor is RUSHING:
 *   - trip length: where the scroll is HEADED (the wheel target) more than
 *     ~1.6 exhibits from the playhead → look down the corridor, not at every
 *     bay flashing past. Counted in exhibits (hallConfig stopCoord), not raw
 *     progress, so the long lobby stops behave like room-to-room hops.
 *   - speed: sustained fast scrolling (≥ GAZE_V0 exhibits/s). Ignored while
 *     the playhead, the scroll and its destination all sit inside the SAME
 *     park — scrolling within a room's hold never nods the head.
 *  Both use steep falloffs: leave a walk alone, decisive when rushing. */
const GAZE_TRIP = 1.6; // exhibits — authority halves at this trip length
const GAZE_V0 = 1.8; // exhibits/s — authority halves at this speed
/** Authority is itself a critically-damped spring (smooth start, no kick). */
const GAZE_OMEGA_DROP = 6;
const GAZE_OMEGA_RISE = 5;
/** Head follower limits (free scroll). VMAX: peak pan rate (deg/s). AMAX: how
 *  quickly a pan may build up / wind down (deg/s²). GAIN: proportional
 *  approach rate near the target (1/s). A lower gain lets a careful
 *  notch-by-notch walker's pans run together into one continuous turn
 *  instead of a 15→110→15°/s step on every notch. */
const YAW_VMAX = (160 * Math.PI) / 180;
const YAW_AMAX = (380 * Math.PI) / 180;
const YAW_GAIN = 3.2;
/** The head LEADS the body: its target is the authored yaw a little AHEAD of
 *  the playhead (velocity × YAW_LEAD seconds, never past where the scroll is
 *  headed, at most YAW_LEAD_MAX progress). At rest the lead is zero, so dwell
 *  frames are exact. */
const YAW_LEAD = 0.4;
const YAW_LEAD_MAX = 0.03;
/** Follower sub-step (s): keeps the limiter frame-rate independent. */
const YAW_H = 1 / 240;
/** Portrait step-in follows its own spring so it moves with the head. */
const STEP_OMEGA = 5;
/** Glide choreography: trips longer than CHO_LONG_LO exhibits start turning
 *  the head down the corridor for the flight (fully by CHO_LONG_HI); the
 *  turn-away / turn-in each take CHO_TURN of the glide's duration. */
const CHO_LONG_LO = 1.25;
const CHO_LONG_HI = 1.85;
const CHO_TURN = 0.38;
/** Largest playhead velocity handed back to the free-scroll spring when a
 *  glide is interrupted (progress/s) — the choreographed playhead crosses
 *  parks in a frame, which is invisible but would read as a huge velocity. */
const CHO_HANDOFF_V = 0.25;
/** Largest frame step integrated (s). Guards tab-switch hiccups only. */
const MAX_DT = 0.1;
/** Look-target distance (only the direction matters). */
const LOOK_R = 6;
const HALF_PI = Math.PI / 2;

// stable debug payload for window.__rig — see the bottom of Rig's useFrame
const rigDebug = {
  /** R3F frames rendered by the rig (harness: derivative over real frames) */
  frame: 0,
  /** teleports taken (cutSeq bumps + heuristic snaps) */
  snaps: 0,
  /** true while a glide is being choreographed */
  cho: false,
  p: 0,
  playP: 0,
  playV: 0,
  dest: 0,
  gaze: 1,
  camX: 0,
  camZ: 0,
  targetX: 0,
  lookX: 0,
  lookZ: 0,
  yawDeg: 0,
  yawTargetDeg: 0,
  focusRoom: null as string | null,
  focusEase: 0,
  galleryEase: 0,
};

/** Exact critically-damped spring step (frame-rate independent for any dt).
 *  Mutates s.{x, v} toward `to`. */
function springStep(s: { x: number; v: number }, to: number, omega: number, dt: number) {
  const e0 = s.x - to;
  const k = s.v + omega * e0;
  const ex = Math.exp(-omega * dt);
  s.x = to + (e0 + k * dt) * ex;
  s.v = (s.v - omega * k * dt) * ex;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** Quintic smootherstep: zero 1st AND 2nd derivative at both ends. */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const settleIn = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);

/** Authored head yaw (rad) at playhead p, before gaze: 0 = straight down the
 *  hall (+x), ±π/2 = square to the ±z wall. Focus bands never overlap;
 *  opposite-wall neighbours hand over at a slot boundary with matched slopes.
 *  Aiming exactly lateral at full focus IS the flat-panel rule: the camera
 *  parks at the exhibit's x, so a 90° yaw frames the bay centre, the gallery
 *  glazing and the recessed showreel head-on. */
function pathYaw(p: number): number {
  const f = focusAt(p);
  if (f.room) return f.room.side * f.ease * HALF_PI;
  const gf = galleryFocusAt(p);
  if (gf > 0) return GALLERY_SIDE * gf * HALF_PI;
  return featureFocusAt(p) * HALF_PI; // showreel: +z wall
}

/** Portrait step-in target (world z) at playhead p, before gaze. */
function pathStep(p: number): number {
  const f = focusAt(p);
  return (
    (f.room ? f.ease * f.room.side * STEP_BAY : 0) +
    galleryFocusAt(p) * GALLERY_SIDE * STEP_GALLERY +
    featureFocusAt(p) * STEP_FEATURE
  );
}

/**
 * Camera dolly down the corridor. X follows a waypoint path (see hallConfig)
 * that EASES + PARKS at each exhibit; the head pans from one exhibit to the
 * next across the corridor and faces each one squarely while parked.
 */
export default function Rig({ frozen = false, mobile = false }: RigProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const st = useRef({
    play: { x: 0, v: 0 },
    gaze: { x: 1, v: 0 },
    yaw: { x: 0, v: 0 },
    step: { x: 0, v: 0 },
    lastRaw: 0,
    lastCut: 0,
    lastCamX: 0,
    booted: false,
    /** glide choreography (see "GLIDES" above) */
    cho: {
      on: false,
      seq: 0,
      t0: 0,
      dur: 1,
      from: 0,
      to: 0,
      x0: 0,
      x1: 0,
      yaw0: 0,
      yaw1: 0,
      yawOff: 0,
      step0: 0,
      step1: 0,
      stepOff: 0,
      depth: 0,
      vx: 0,
      vyaw: 0,
      vstep: 0,
    },
    camV: 0,
  });
  const focusedId = useRef<string | null>(null);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, MAX_DT);
    const raw = scrollRefs.progress;
    const s = st.current;
    const c = s.cho;

    // First frame / teleport / reduced motion: everything IS the scroll
    // position. (First frame: the Canvas camera boots at x=0 and damping from
    // there flew through the backstage lobby on every load. Reduced motion
    // (finding 22): the camera stays fully SCROLL-MAPPED with zero time-based
    // easing — position, head and step-in alike.)
    const jump = Math.abs(raw - s.lastRaw);
    const cut = scrollRefs.cutSeq !== s.lastCut;
    s.lastCut = scrollRefs.cutSeq;
    const teleport =
      cut ||
      jump > SNAP_ALWAYS ||
      (jump > SNAP_JUMP && jump / Math.max(rawDt, 1e-3) > SNAP_SPEED);

    // A new glide (fixed duration, still running) → choreograph it.
    const g = scrollRefs.glide;
    if (g.seq !== c.seq) {
      c.seq = g.seq;
      c.on = false;
      if (s.booted && !frozen && !teleport && g.dur > 0 && scrollRefs.gliding) {
        c.on = true;
        c.t0 = g.t0;
        c.dur = Math.max(0.2, g.dur);
        c.from = s.play.x;
        c.to = g.to;
        c.x0 = s.lastCamX;
        c.x1 = cameraXAt(g.to);
        c.yaw1 = pathYaw(g.to);
        c.step1 = mobile ? pathStep(g.to) : 0;
        c.depth = clamp01(
          (stopsBetween(c.from, c.to) - CHO_LONG_LO) / (CHO_LONG_HI - CHO_LONG_LO),
        );
        // Continuity: whatever the head / step were doing when the glide
        // began (mid-turn, mid-flick) is folded in as an offset that fades
        // out with the glide, so the choreography starts exactly where the
        // camera is.
        const q0 = progressAtCameraX(c.x0, c.from, c.to);
        c.yaw0 = s.yaw.x;
        c.yawOff = s.yaw.x - pathYaw(q0);
        c.step0 = s.step.x;
        c.stepOff = s.step.x - (mobile ? pathStep(q0) : 0);
        // ...and so is its VELOCITY (a second tap mid-hop, a nav click
        // mid-flick): carried in through a quintic Hermite term that is gone
        // by the end, instead of stopping dead and re-accelerating.
        const span = Math.max(Math.abs(c.x1 - c.x0), 2);
        c.vx = Math.max(-span, Math.min(span, s.camV * c.dur));
        c.vyaw = s.yaw.v * c.dur;
        c.vstep = s.step.v * c.dur;
      }
    }

    let yawTarget: number;
    let stepTarget: number;
    let camX: number;
    let choGaze = 1;
    if (!s.booted || frozen || teleport) {
      if (s.booted && teleport) rigDebug.snaps++;
      c.on = false;
      s.play.x = raw;
      s.play.v = 0;
      s.gaze.x = 1;
      s.gaze.v = 0;
      yawTarget = pathYaw(raw);
      stepTarget = mobile ? pathStep(raw) : 0;
      s.yaw.x = yawTarget;
      s.yaw.v = 0;
      s.step.x = stepTarget;
      s.step.v = 0;
      s.booted = true;
      camX = cameraXAt(raw);
    } else if (c.on) {
      // ── glide choreography ──
      const u = clamp01((performance.now() - c.t0) / (c.dur * 1000));
      const e = smoother(u);
      const h1 = u * (1 + u * u * (-6 + u * (8 - 3 * u))); // H'(0)=1, H(1)=H'(1)=H''(1)=0
      const x = c.x0 + (c.x1 - c.x0) * e + c.vx * h1;
      const q = progressAtCameraX(x, c.from, c.to);
      // short hop: the authored yaw along the way (+ start offset fading out)
      const fade = 1 - e;
      const yawShort = pathYaw(q) + c.yawOff * fade;
      const stepShort = mobile ? pathStep(q) + c.stepOff * fade : 0;
      // long trip: turn away → look down the corridor → turn in
      const wOut = settleIn(clamp01(u / CHO_TURN));
      const wIn = settleIn(clamp01((u - (1 - CHO_TURN)) / CHO_TURN));
      const yawLong = c.yaw0 * (1 - wOut) + c.yaw1 * wIn;
      const stepLong = c.step0 * (1 - wOut) + c.step1 * wIn;
      yawTarget = yawShort + (yawLong - yawShort) * c.depth + c.vyaw * h1;
      stepTarget = stepShort + (stepLong - stepShort) * c.depth + c.vstep * h1;
      choGaze = 1 - c.depth * Math.min(wOut, 1 - wIn);
      const idt = dt > 1e-4 ? 1 / dt : 0;
      s.play.v = (q - s.play.x) * idt;
      s.play.x = q;
      s.yaw.v = (yawTarget - s.yaw.x) * idt;
      s.yaw.x = yawTarget;
      s.step.v = (stepTarget - s.step.x) * idt;
      s.step.x = stepTarget;
      s.gaze.x = 1;
      s.gaze.v = 0;
      camX = x;
      const done = u >= 1;
      if (done || !scrollRefs.gliding || g.seq !== c.seq) {
        // Hand back to free scroll. Finished: everything is exactly at the
        // destination and at rest. Interrupted (the visitor scrolled): the
        // spring / follower carry on from the current state and velocity.
        c.on = false;
        if (done) {
          s.play.v = 0;
          s.yaw.v = 0;
          s.step.v = 0;
        } else {
          s.play.v = Math.max(-CHO_HANDOFF_V, Math.min(CHO_HANDOFF_V, s.play.v));
          s.yaw.v = Math.max(-YAW_VMAX, Math.min(YAW_VMAX, s.yaw.v));
        }
      }
    } else {
      const omega = scrollRefs.gliding ? PLAY_OMEGA_GLIDE : PLAY_OMEGA;
      springStep(s.play, raw, omega, dt);
      const p = s.play.x;

      // ── gaze authority (see GAZE_*) ──
      const dest = Number.isFinite(scrollRefs.destination) ? scrollRefs.destination : raw;
      const park = parkIndexAt(p);
      const parked = park >= 0 && parkIndexAt(raw) === park && parkIndexAt(dest) === park;
      // Speed estimate LEADS the playhead: a critically-damped spring trails a
      // steady scroll by 2v/ω, so |raw − p|·ω/2 reads the speed it is about to
      // reach. Converted to exhibits/s at the local stop spacing.
      const speed = parked
        ? 0
        : Math.max(Math.abs(s.play.v), (Math.abs(raw - p) * omega) / 2) / stopSpacingAt(p);
      const rv = speed / GAZE_V0;
      const rv2 = rv * rv;
      const trip = Math.max(stopsBetween(dest, p), stopsBetween(raw, p));
      const rt = trip / GAZE_TRIP;
      const rt3 = rt * rt * rt;
      const gTarget = Math.min(1 / (1 + rv2 * rv2), 1 / (1 + rt3 * rt3));
      springStep(
        s.gaze,
        gTarget,
        gTarget < s.gaze.x ? GAZE_OMEGA_DROP : GAZE_OMEGA_RISE,
        dt,
      );
      s.gaze.x = Math.min(1, Math.max(0, s.gaze.x));

      let lead = s.play.v * YAW_LEAD;
      lead = Math.max(-YAW_LEAD_MAX, Math.min(YAW_LEAD_MAX, lead));
      let pLead = p + lead;
      // never look past the stop the scroll is heading for
      if (lead > 0 && dest >= p) pLead = Math.min(pLead, dest);
      else if (lead < 0 && dest <= p) pLead = Math.max(pLead, dest);
      yawTarget = pathYaw(pLead) * s.gaze.x;
      stepTarget = mobile ? pathStep(p) * s.gaze.x : 0;

      // ── head follower: velocity + acceleration limited, brakes so it
      //    arrives at rest (v ≤ √(2·a·|err|)), never overshoots ──
      const y = s.yaw;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(YAW_H, left);
        left -= h;
        const err = yawTarget - y.x;
        const ae = Math.abs(err);
        const vDes =
          Math.sign(err) * Math.min(YAW_VMAX, ae * YAW_GAIN, Math.sqrt(2 * YAW_AMAX * ae));
        const dv = vDes - y.v;
        const maxDv = YAW_AMAX * h;
        y.v += dv > maxDv ? maxDv : dv < -maxDv ? -maxDv : dv;
        y.x += y.v * h;
      }
      if (Math.abs(yawTarget - y.x) < 1e-5 && Math.abs(y.v) < 1e-4) {
        y.x = yawTarget;
        y.v = 0;
      }

      springStep(s.step, stepTarget, STEP_OMEGA, dt);

      // Walking → the dwell path (eases in, parks, eases out). Rushing → the
      // park-free glide path (hallConfig GLIDE), so a flick travels instead
      // of stop-going at every exhibit. Identical at every room dwell centre.
      const gaze = s.gaze.x;
      const dwellX = cameraXAt(p);
      camX = gaze >= 1 ? dwellX : cameraGlideXAt(p) + (dwellX - cameraGlideXAt(p)) * gaze;
    }
    s.lastRaw = raw;
    if (dt > 1e-4) {
      const v = (camX - s.lastCamX) / dt;
      s.camV = teleport ? 0 : Math.max(-120, Math.min(120, v));
    }
    s.lastCamX = camX;
    const p = s.play.x;
    const gaze = c.on ? choGaze : s.gaze.x;

    const zPos = s.step.x;
    camera.position.set(camX, EYE_Y, zPos);

    const yaw = s.yaw.x;
    const lookX = camX + Math.cos(yaw) * LOOK_R;
    const lookZ = zPos + Math.sin(yaw) * LOOK_R;
    camera.lookAt(lookX, EYE_Y, lookZ);

    // Publish the camera's playhead for lockstep consumers (frame-data refs).
    scrollRefs.cameraProgress = p;
    scrollRefs.gaze = gaze;

    // Publish the focused bay (coarse — only on change) so the DOM can show a
    // "Visit project" link for it. Uses the head's ACTUAL turn, so the HUD
    // (and the URL hash) change when the visitor is looking at the bay, and a
    // flick through the corridor never strobes them.
    const f = focusAt(p);
    const fid = f.room && (yaw * f.room.side) / HALF_PI > 0.85 ? f.room.id : null;
    if (fid !== focusedId.current) {
      focusedId.current = fid;
      useScrollStore.getState().setFocusedRoom(fid);
    }

    // Debug/verify hook (read by the screenshot + motion harnesses). One
    // stable object mutated in place (no per-frame allocation), exposed
    // non-enumerably so window-walking dev tooling never serialises it.
    rigDebug.frame++;
    rigDebug.cho = c.on;
    rigDebug.p = raw;
    rigDebug.playP = p;
    rigDebug.playV = s.play.v;
    rigDebug.dest = scrollRefs.destination;
    rigDebug.gaze = gaze;
    rigDebug.camX = camX;
    rigDebug.camZ = zPos;
    rigDebug.targetX = cameraXAt(raw);
    rigDebug.lookX = lookX;
    rigDebug.lookZ = lookZ;
    rigDebug.yawDeg = (yaw * 180) / Math.PI;
    rigDebug.yawTargetDeg = (yawTarget * 180) / Math.PI;
    rigDebug.focusRoom = f.room?.id ?? null;
    rigDebug.focusEase = f.ease;
    rigDebug.galleryEase = galleryFocusAt(p);
    if (!(window as { __rig?: object }).__rig) {
      Object.defineProperty(window, "__rig", { value: rigDebug, configurable: true });
    }
  });

  return null;
}
