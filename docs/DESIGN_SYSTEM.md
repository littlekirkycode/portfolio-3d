# KIRKHAM·01 — ship design system

The site is a scroll-driven walk down a spaceship corridor (React Three Fiber). Nine
recessed bays each present one part of James Kirkham's CV; the DOM layers a HUD, nav
and content cards over the canvas. This document is the shared brief for anyone
authoring rooms, panels or UI, so the ship reads as ONE authored place.

## 1. Art direction

- **Dark ship, lit exhibits.** The hall is moody steel; each bay is a lit exhibit with
  one accent colour. Premium, calm, cinematic — think a high-end product launch set,
  not a game level or a neon arcade.
- **Authored, not dressed.** Every object in a room must be *there for a reason* in the
  room's story, sit physically (on the floor, on a plinth, on a mount/arm — never
  floating without a projector/rig that explains it), and be lit so its form reads.
  No black silhouettes, no clip-art props dropped on a mat.
- **One hero per room.** Each bay has a single centrepiece that visualises the project,
  supported by 2–4 secondary elements. Resist clutter.
- **Truthful content.** Numbers and facts come from `src/lib/constants.ts` (SITE,
  PROJECTS, SKILLS, EXPERIENCE, ACHIEVEMENTS). Never invent metrics.

## 2. Colour + materials — `src/components/canvas/theme.ts`

- `NEUTRAL.*` for every structural surface. Darkest authored surface is
  `NEUTRAL.hullShadow` — never `#000`, never an unlit near-black standard material.
- One accent per bay (`room.accent` from constants). Use it for **light and small
  emitters/trims** (`MATERIALS.emit(accent, GLOW.trim|line|hot)`), not to paint large
  lit surfaces. Large surfaces are neutrals, optionally `tintNeutral(neutral, accent, ≤0.15)`.
- `WARM` is the only secondary hue (practical lamps, brass, wood).
- Use `MATERIALS.*` presets (paint, paintLight, steel, polished, rubber, wood, glass).
  They're tuned for the scene's studio environment (`Scene.tsx` `ENV_INTENSITY`) and
  the bay light pool. Metals are fine now (there is an environment to reflect) — but
  check every material in a screenshot.
- GLB props (`Model name=…`, Kenney/Quaternius low-poly) may be re-materialed by
  traversing the clone and swapping to presets when their stock colours clash.
- Bloom threshold is 0.78 luminance. `GLOW.trim` stays under it, `GLOW.line` just
  blooms, `GLOW.hot` for tiny true light sources only.

## 3. UI language (in-world boards + DOM)

- In-world boards: `rooms/holo.tsx` `Board` + `paintSlab` — translucent dark slab,
  accent rim, mono kicker (`--ff-mono`), serif display numerals (`--ff-display`),
  body in `--ff-body`. Keep text large enough to read from the dwell camera
  (≥ ~12px on a 1440×900 screenshot).
- DOM: same three fonts, INK `#f4f1ea` on dark, accent as the only colour. Glassy
  cards must stay legible over any bay (sufficient backdrop blur/tint + contrast).

## 4. Motion + comfort (hard rules)

- **Nothing flashes, blinks, strobes or pulses** faster than a 3 s eased cycle. No
  travelling light pulses. No floating particle "dots". No random sparkles.
- Motion is slow, eased and purposeful (a hologram turning, data flowing along a line).
- Respect reduced motion (components get `animate`; freeze time-based motion when false).
- The camera is scroll-driven (`Rig.tsx`, `hallConfig.ts`); nothing else moves it.

## 5. Room space (RoomProps-local coordinates)

Each bay file `rooms/<Name>Bay.tsx` renders inside a group whose origin is on the niche
floor 1.55 in front of the back wall. **+z = toward the opening/camera** (opening at
z≈+2.45), side walls x = ±3.7, back wall face z≈−1.85, ceiling y = 4.

Desktop dwell camera looks straight in from the corridor centreline:

- **Hero screen** (app screenshots / poster, `bayScreens.tsx`) owns the back wall at
  x∈[−3.1, 0], y≈1.1–3.0 — don't put anything in front of it taller than ~1.0.
- **Info panel** (`bayPanels.tsx`) floats at x∈[0, 3.15], z≈+0.95, y≈0.5–3.1.
- **Room label** hangs at y≈2.85–3.55, x∈[−1.45, 1.45], z≈+1.55.
- **Free showcase zones:** the LEFT column x < −2.4 (tall OK), the front floor strip
  z∈[1.3, 2.3] (low, ≤0.6), the narrow right lane x∈[3.3, 3.6], z∈[0.8, 2.3].
- Mobile portrait: the camera steps toward the bay and the screen/panel stack in the
  centre; left-column content is mostly off-frame. `mobile` is passed to every bay.

Scroll progress → dwell stops (use for screenshots): airlock 0 · showreel 0.135 ·
SelfQuest 0.25 · SelfAware 0.31 · SelfGrow 0.37 · Nuremi 0.43 · Xuabelle 0.49 ·
observation gallery 0.55 · Capabilities 0.61 · Experience 0.67 · Allied 0.73 ·
Milestones 0.79 · bridge 1.0. Corridor transit views: e.g. 0.20, 0.28, 0.52.

## 6. Performance budget

- Bays are distance-gated; still keep each bay ≲ 60 extra draw calls and ≲ 3 canvas
  textures (≤ 1024 px). Prefer instancing for repeated parts. No new scene lights
  (light count is a compile-time constant — see Walls' BayLightPool note).
- Canvas textures redraw only on change, never per frame.

## 7. Verification (headless GPU Chrome harness)

Dev server: `http://localhost:3123/` (shared). Harness dir (has puppeteer-core):
`C:\Users\james\AppData\Local\Temp\claude\C--Users-james\06ba8a89-104f-42fb-becd-399ad1e2be8f\scratchpad\shot`

- Screenshots: `PS="0.25,0.31" node <harness>/shoot.mjs <outDir>/<prefix> [url] [w] [h]`
  (create outDir first; 1440×900 default; phones: `... http://localhost:3123/ 390 844`).
  Prints `p actualP focusedRoom file` per stop, then console errors. View PNGs with Read.
- Flicker/flash probe: `node <harness>/probe.mjs <outDir> <p0> [p1] [frames]` — dwell
  probe when p1 omitted. `maxCellFlash` < ~12 calm, > 25 = something flashes; it saves
  the frames around the worst event.
- Always also: `npx tsc --noEmit -p .` and `npx eslint <your files>`.
