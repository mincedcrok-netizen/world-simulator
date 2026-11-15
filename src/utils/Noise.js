/**
 * Small, dependency-free 2D value noise. Deterministic for a given seed.
 * Used by the temporary Phase 1 map and the menu backdrop.
 */

/** Hash an integer lattice point to a float in [0, 1). */
export function hash2D(seed, x, y) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1). */
export function valueNoise2D(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2D(seed, x0, y0);
  const b = hash2D(seed, x0 + 1, y0);
  const c = hash2D(seed, x0, y0 + 1);
  const d = hash2D(seed, x0 + 1, y0 + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Fractal (multi-octave) noise normalised to roughly [0, 1]. */
export function fbm2D(seed, x, y, octaves = 3, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise2D(seed + i * 101, x * frequency, y * frequency);
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / total;
}
