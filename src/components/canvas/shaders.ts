/**
 * GLSL string library for the cinematic scrolling scene.
 *
 * These are plain template-literal strings consumed by raw `<shaderMaterial>`
 * elements (no .glsl loader, no `extend()`/custom JSX). Brand colors are
 * hardcoded inside the fragment shaders so they survive minification and do not
 * depend on CSS-var plumbing:
 *   bg       #07070a
 *   accent   #ff5c38
 *   accent-2 #4d6cfa
 *   glow     #ff7a4d
 */

/* ─────────────────────────────────────────────────────────────────────────
   Shared noise helpers (simplex + fbm). Prepended where needed.
   ───────────────────────────────────────────────────────────────────────── */
const NOISE_CHUNK = /* glsl */ `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x){ return mod289(((x * 34.0) + 1.0) * x); }

  // 2D simplex noise (Ashima)
  float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // fractional brownian motion
  float fbm(vec2 p){
    float total = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 5; i++){
      total += snoise(p * freq) * amp;
      freq *= 2.02;
      amp  *= 0.5;
    }
    return total;
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   BACKGROUND — deep space through the observation-bridge window.
   Three parallax star layers (jittered grid, per-star size + twinkle) over
   chromatic blue/violet/magenta fbm nebula clouds, all drifting slowly
   with uTime + a touch of pointer/scroll parallax. Mostly black — it must read
   unmistakably as SPACE, not marble. Rendered toneMapped:false; star peaks sit
   just above the bloom threshold for a gentle glint.
   ───────────────────────────────────────────────────────────────────────── */
export const backgroundVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const backgroundFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform float uVelocity;
  uniform vec2  uMouse;

  varying vec2 vUv;

  ${NOISE_CHUNK}

  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // One star layer: jittered grid; each occupied cell gets a star with its own
  // position, size and twinkle phase/rate. density = fraction of lit cells.
  float stars(vec2 uv, float scale, float density, float t){
    vec2 g = uv * scale;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float rnd = hash21(id);
    if(rnd > density) return 0.0;
    vec2 off = (vec2(hash21(id + 3.7), hash21(id + 9.1)) - 0.5) * 0.7;
    float d = length(f - off);
    float size = mix(0.03, 0.10, hash21(id + 5.3));
    float star = smoothstep(size, 0.0, d);
    float tw = 0.55 + 0.45 * sin(t * (0.8 + 3.0 * rnd / density) + rnd * 40.0);
    return star * tw;
  }

  void main(){
    vec2 uv = vUv;

    // The bridge window is ~2:1 — equalise so stars stay round, not stretched.
    vec2 suv = (uv - 0.5) * vec2(2.05, 1.0);

    float t = uTime;

    // Slow drift, plus a whisper of pointer/scroll parallax. Near layers move
    // more than far ones -> depth.
    vec2 drift = vec2(t * 0.006, t * 0.0022);
    vec2 par = uMouse * 0.012 + vec2(uProgress * 0.05, 0.0);

    float s1 = stars(suv + drift * 0.5 + par * 0.4, 22.0, 0.10, t);        // far, faint
    float s2 = stars(suv + drift + par * 0.7 + 3.1, 12.0, 0.14, t);        // mid
    float s3 = stars(suv + drift * 1.8 + par + 7.7, 6.0, 0.10, t * 0.7);   // near, few, big

    // Blue-violet nebula clouds behind the stars — deliberately CHROMATIC so
    // the window reads as deep space, not smoke: deep blue + violet fields,
    // with a magenta core where the two overlap.
    vec2 np = suv * 1.6 + vec2(t * 0.008, 0.0) + uMouse * 0.03;
    float n1 = fbm(np);
    float n2 = fbm(np * 0.55 + vec2(4.7, 2.3) - t * 0.005);
    vec3 neb1 = vec3(0.110, 0.200, 0.560); // deep blue
    vec3 neb2 = vec3(0.400, 0.190, 0.640); // violet
    vec3 neb3 = vec3(0.640, 0.200, 0.500); // magenta core

    float c1 = smoothstep(0.05, 0.95, n1);
    float c2 = smoothstep(0.25, 1.05, n2);

    vec3 col = vec3(0.004, 0.006, 0.014);  // deep-space base — near black
    // Weights tuned so the space-read lands from MID-CORRIDOR (~25 units out),
    // not only at the contact dwell close-up.
    col += neb1 * c1 * 0.38;
    col += neb2 * c2 * 0.28;
    col += neb3 * c1 * c2 * 0.40;

    // Star colours: far layer cool blue, near layer warm white.
    col += vec3(0.55, 0.65, 0.85) * s1 * 0.55;
    col += vec3(0.85, 0.90, 1.00) * s2 * 1.00;
    col += vec3(1.00, 0.97, 0.92) * s3 * 1.40;

    // Fast scrolls give the clouds a brief energetic lift.
    col += neb2 * abs(uVelocity) * 0.05;

    // Soft vignette toward the window frame -> the void recedes at the edges.
    float vig = smoothstep(1.25, 0.35, length((uv - 0.5) * vec2(1.6, 2.0)));
    col *= mix(0.55, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   PARTICLES — dust motes filling the depth volume.
   Each point is given a per-vertex random seed; the vertex shader animates a
   slow drift and a parallax response to scroll + pointer, and sizes points by
   distance. The fragment shader draws a soft round sprite tinted by depth.
   ───────────────────────────────────────────────────────────────────────── */
export const particlesVertex = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uVelocity;
  uniform vec2  uMouse;
  uniform float uSize;
  uniform float uPixelRatio;

  attribute float aSeed;
  attribute float aScale;

  varying float vSeed;
  varying float vDepth;
  varying float vTwinkle;

  void main(){
    vSeed = aSeed;

    vec3 pos = position;

    // Gentle organic drift, phase-offset per particle.
    float ph = aSeed * 6.2831853;
    pos.x += sin(uTime * 0.12 + ph) * 0.6;
    pos.y += cos(uTime * 0.10 + ph * 1.3) * 0.5;
    pos.z += sin(uTime * 0.08 + ph * 0.7) * 0.4;

    // Parallax: nearer particles (larger aScale) react more to the pointer.
    pos.xy += uMouse * (0.4 + aScale * 0.8);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;

    gl_Position = projectionMatrix * mv;

    // Size attenuation by distance, with a velocity-driven streak on fast scroll.
    float size = uSize * aScale * uPixelRatio;
    size *= (1.0 + abs(uVelocity) * 0.6);
    gl_PointSize = size * (12.0 / max(vDepth, 0.6));

    vTwinkle = 0.5 + 0.5 * sin(uTime * 1.6 + ph * 3.0);
  }
`;

export const particlesFragment = /* glsl */ `
  precision highp float;

  uniform float uProgress;

  varying float vSeed;
  varying float vDepth;
  varying float vTwinkle;

  void main(){
    // Soft circular falloff.
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if(d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    alpha = pow(alpha, 1.6);

    vec3 accent  = vec3(1.000, 0.361, 0.220); // #ff5c38
    vec3 accent2 = vec3(0.302, 0.424, 0.980); // #4d6cfa
    vec3 glow    = vec3(1.000, 0.478, 0.302); // #ff7a4d

    // Tint shifts with progress + per-particle seed for variety.
    vec3 col = mix(accent, accent2, clamp(uProgress + (vSeed - 0.5) * 0.4, 0.0, 1.0));
    col = mix(col, glow, 0.3);

    // Fade with depth so far motes melt into the fog.
    float depthFade = smoothstep(34.0, 4.0, vDepth);
    alpha *= depthFade * (0.35 + 0.65 * vTwinkle);

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   PATH — glowing directional floor guide.
   Repeating chevrons stream along the corridor toward the scroll direction,
   brightening/streaking with scroll velocity; hue lerps across the journey.
   Rendered additive + emissive so Bloom catches it.
   ───────────────────────────────────────────────────────────────────────── */
export const pathVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const pathFragment = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uVelocity;
  uniform float uDir;
  uniform float uProgress;
  varying vec2 vUv;

  void main(){
    float y = abs(vUv.y - 0.5) * 2.0;            // 0 centre .. 1 lane edge
    float dir = uDir >= 0.0 ? 1.0 : -1.0;
    float speed = 0.5 + abs(uVelocity) * 0.5;
    float x = vUv.x * 70.0 - uTime * speed * dir;
    float f = fract(x - y * 1.3);                 // skew by |y| -> chevron
    float chev = smoothstep(0.5, 0.16, abs(f - 0.5));
    float edge = smoothstep(1.0, 0.4, y);         // fade to lane edges
    float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);

    vec3 a  = vec3(1.000, 0.361, 0.220);          // #ff5c38
    vec3 a2 = vec3(0.302, 0.424, 0.980);          // #4d6cfa
    vec3 col = mix(a, a2, clamp(uProgress, 0.0, 1.0));

    float moving = 0.35 + 0.9 * min(abs(uVelocity), 1.0);
    float alpha = chev * edge * ends * moving;
    alpha = max(alpha, edge * ends * 0.10);       // faint idle glow
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   MONOLITH — emissive landmark surface.
   A view-dependent fresnel rim glow plus a slow scanning energy seam that
   sweeps across the form, animated by time and nudged by scroll.
   ───────────────────────────────────────────────────────────────────────── */
export const monolithVertex = /* glsl */ `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vPos;

  void main(){
    vUv = uv;
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const monolithFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uProgress;
  uniform vec3  uColor;
  uniform float uSeed;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;
  varying vec3 vPos;

  void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vViewDir);

    // Fresnel rim — the body stays near-black, edges catch the accent.
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);

    // A travelling energy seam along the long axis.
    float seam = sin((vPos.y * 1.4) - uTime * 1.2 + uSeed * 6.28 + uProgress * 4.0);
    seam = smoothstep(0.86, 1.0, seam);

    vec3 base = vec3(0.02, 0.02, 0.03);
    vec3 col = base;
    col += uColor * fres * 1.4;
    col += uColor * seam * 1.1;

    // subtle interior gradient so flat faces are not dead.
    col += uColor * 0.06 * (0.5 + 0.5 * vUv.y);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ─────────────────────────────────────────────────────────────────────────
   SCREEN — CRT / TV display surface.
   Samples a portrait image texture and applies barrel curvature, scanlines,
   a chromatic split, flicker, grain and a vignette. Rendered emissive
   (toneMapped:false) so Bloom turns it into a glowing screen in the dark hall.
   ───────────────────────────────────────────────────────────────────────── */
export const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const screenFragment = /* glsl */ `
  precision highp float;
  uniform sampler2D uTexture;
  uniform sampler2D uTexNext;
  uniform float uTime;
  uniform float uOn;     // 0..1 brightness / power-on
  uniform float uCrt;    // 0 = crisp glass (phone), 1 = full CRT
  uniform float uMix;    // 0..1 slideshow transition progress
  uniform float uTrans;  // 0 = dissolve, 1 = slide
  uniform vec3  uTint;
  varying vec2 vUv;

  vec2 curve(vec2 uv){
    uv = uv * 2.0 - 1.0;
    vec2 o = abs(uv.yx) / vec2(8.0, 6.0);
    uv += uv * o * o;
    return uv * 0.5 + 0.5;
  }
  float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 samp(sampler2D tex, vec2 uv, float off){
    vec3 s;
    s.r = texture2D(tex, uv + vec2(off, 0.0)).r;
    s.g = texture2D(tex, uv).g;
    s.b = texture2D(tex, uv - vec2(off, 0.0)).b;
    return pow(s, vec3(2.2));
  }

  void main(){
    // Curvature only when CRT (phones stay flat glass).
    vec2 uv = mix(vUv, curve(vUv), uCrt);
    if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float off = 0.0008 * mix(0.4, 1.0, uCrt);
    vec3 col;
    if(uMix <= 0.001){
      col = samp(uTexture, uv, off);
    } else if(uTrans > 0.5){
      // filmstrip slide
      float p = uv.x + uMix;
      col = (p < 1.0) ? samp(uTexture, vec2(p, uv.y), off)
                      : samp(uTexNext, vec2(p - 1.0, uv.y), off);
    } else {
      // noisy dissolve
      vec3 a = samp(uTexture, uv, off);
      vec3 b = samp(uTexNext, uv, off);
      float thr = rand(floor(uv * vec2(36.0, 78.0)));
      col = mix(a, b, smoothstep(thr - 0.14, thr + 0.14, uMix));
    }

    // CRT artefacts scale with uCrt (≈0 on phones).
    col *= mix(1.0, 0.965 + 0.035 * sin(uv.y * 300.0), uCrt);
    col *= mix(1.0, 0.99 + 0.01 * sin(uTime * 4.0), uCrt);
    // NO per-pixel grain here. A ±0.002 rand() term — far below perception —
    // rendered as DENSE WHITE SPECKLE over dark screenshots on real GPUs
    // (QA: "white spots all over the posters"; empirically bisected to this
    // one term, mechanism driver-side). Scanlines above carry the CRT feel;
    // the poster canvases also bake their own grain sheet.
    col = max(col, vec3(0.0));
    // Glass vignette (kept subtle on phones for a screen-edge falloff).
    float vig = smoothstep(1.2, 0.35, length(vUv - 0.5) * 1.4);
    col *= mix(0.82, 1.06, vig);
    // Phosphor tint + power, lifted so it reads as emissive.
    col = mix(col, col * uTint, 0.1) * 1.12 * uOn;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
