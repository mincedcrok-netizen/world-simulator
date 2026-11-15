import { fbm2D } from '../utils/Noise.js';

const SEA_LEVEL = 0.5;
const BAND_WIDTH = 0.042;
const MAJOR_EVERY = 5;

const mix = (a, b, t) => a + (b - a) * t;
const mixColor = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];

const DEEP = [11, 29, 39];
const SHALLOW = [26, 66, 82];
const LOWLAND = [38, 62, 52];
const HIGHLAND = [84, 82, 64];
const LINE_WATER = [120, 175, 195];
const LINE_LAND = [210, 190, 140];
const LINE_COAST = [220, 190, 120];

/**
 * Paint a contour-map style backdrop once. It is drawn from a fixed seed on a
 * small canvas that CSS stretches, so it costs a single one-off ~50 ms pass
 * and nothing afterwards (no animation, no per-frame work).
 */
export function drawMenuBackdrop(canvas, { width = 800, height = 450, seed = 20260315 } = {}) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    console.warn('[Menu] 2D canvas unavailable; menu backdrop skipped.');
    return;
  }

  const elevation = new Float32Array(width * height);
  const band = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const e = fbm2D(seed, x / 170, y / 170, 4);
      elevation[y * width + x] = e;
      band[y * width + x] = Math.floor(e / BAND_WIDTH);
    }
  }

  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const e = elevation[i];
      let color;
      if (e < SEA_LEVEL) color = mixColor(SHALLOW, DEEP, Math.min(1, (SEA_LEVEL - e) / 0.3));
      else color = mixColor(LOWLAND, HIGHLAND, Math.min(1, (e - SEA_LEVEL) / 0.3));

      const right = x + 1 < width ? i + 1 : i;
      const below = y + 1 < height ? i + width : i;
      const crossesCoast = (e >= SEA_LEVEL) !== (elevation[right] >= SEA_LEVEL) || (e >= SEA_LEVEL) !== (elevation[below] >= SEA_LEVEL);
      const crossesBand = band[i] !== band[right] || band[i] !== band[below];

      if (crossesCoast) {
        color = mixColor(color, LINE_COAST, 0.7);
      } else if (crossesBand) {
        const major = Math.max(band[i], band[right], band[below]) % MAJOR_EVERY === 0;
        color = mixColor(color, e < SEA_LEVEL ? LINE_WATER : LINE_LAND, major ? 0.32 : 0.16);
      }

      const o = i * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
