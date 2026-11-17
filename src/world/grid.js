/**
 * Small grid helpers shared by the generators. Maps are row-major:
 * index = y * width + x.
 */

// Direction codes used for river flow: 0 = none, then clockwise from north.
//   8 1 2
//   7 . 3
//   6 5 4
export const DIR_DX = Object.freeze([0, 0, 1, 1, 1, 0, -1, -1, -1]);
export const DIR_DY = Object.freeze([0, -1, -1, 0, 1, 1, 1, 0, -1]);

const CODE_LOOKUP = [
  [8, 1, 2],
  [7, 0, 3],
  [6, 5, 4],
]; // [dy + 1][dx + 1]

/** Direction code for a step of (dx, dy), each in -1..1; 0 when both are 0. */
export function directionCode(dx, dy) {
  return CODE_LOOKUP[dy + 1][dx + 1];
}

/** The 8 neighbour offsets (same order as direction codes 1..8). */
export const N8_DX = Object.freeze([0, 1, 1, 1, 0, -1, -1, -1]);
export const N8_DY = Object.freeze([-1, -1, 0, 1, 1, 1, 0, -1]);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Chessboard (8-neighbour) distance from every tile to the nearest source
 * tile, searched breadth-first up to `maxDist`. Tiles farther away get 255.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} sources Non-zero = source tile.
 * @param {number} maxDist
 * @returns {Uint8Array}
 */
export function distanceField(width, height, sources, maxDist) {
  const size = width * height;
  const dist = new Uint8Array(size).fill(255);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i++) {
    if (sources[i]) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const d = dist[i];
    if (d >= maxDist) continue;
    const x = i % width;
    const y = (i - x) / width;
    for (let k = 0; k < 8; k++) {
      const nx = x + N8_DX[k];
      const ny = y + N8_DY[k];
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (dist[j] !== 255) continue;
      dist[j] = d + 1;
      queue[tail++] = j;
    }
  }
  return dist;
}

/**
 * Separable box blur (clamped edges). Returns a new array; `src` is untouched.
 */
export function boxBlur(src, width, height, radius, passes = 1) {
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
  const window = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[row + clamp(k, 0, width - 1)];
      for (let x = 0; x < width; x++) {
        b[row + x] = sum / window;
        sum += a[row + Math.min(width - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)];
      }
    }
    // vertical
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += b[clamp(k, 0, height - 1) * width + x];
      for (let y = 0; y < height; y++) {
        a[y * width + x] = sum / window;
        sum += b[Math.min(height - 1, y + radius + 1) * width + x] - b[Math.max(0, y - radius) * width + x];
      }
    }
  }
  return a;
}
