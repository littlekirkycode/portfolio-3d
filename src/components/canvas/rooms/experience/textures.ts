"use client";

import * as THREE from "three";

/** Fine walnut grain (module cache): long streaks along the slab's length,
 *  light-valued so it only modulates the wood colour. */
let _grainTex: THREE.CanvasTexture | null = null;
export function getGrainTex() {
  if (!_grainTex) {
    const W = 512;
    const H = 128;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ececec";
    ctx.fillRect(0, 0, W, H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 90; k++) {
      const y0 = rnd() * H;
      const a = 0.08 + rnd() * 0.16;
      const amp = 0.6 + rnd() * 2.4;
      const f = 1 + rnd() * 3;
      ctx.strokeStyle = rnd() > 0.35 ? `rgba(58,36,22,${a})` : `rgba(255,244,228,${a * 0.9})`;
      ctx.lineWidth = 0.6 + rnd() * 1.8;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = y0 + Math.sin((x / W) * Math.PI * 2 * f + k) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    _grainTex = new THREE.CanvasTexture(c);
    _grainTex.colorSpace = THREE.SRGBColorSpace;
    _grainTex.anisotropy = 8;
    _grainTex.wrapS = _grainTex.wrapT = THREE.RepeatWrapping;
  }
  return _grainTex;
}

