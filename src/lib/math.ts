/** Small math helpers shared across the scroll + WebGL layers. */

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent damping (use in useFrame: damp(prev, target, lambda, dt)). */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const mapRange = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  const t = (v - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * t;
};
