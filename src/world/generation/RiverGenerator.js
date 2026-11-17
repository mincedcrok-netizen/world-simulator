/**
 * Hydrology: lakes and rivers.
 *
 *  1. carveLakeBasins   - dig a few shallow basins into low, inland ground.
 *  2. fillDepressions   - "priority flood" from the ocean. Every land tile
 *                         gets a drainage parent that leads to the sea, and
 *                         closed basins show up as depressions -> lakes.
 *  3. generateRivers    - accumulate rainfall along the drainage tree; tiles
 *                         with a large catchment become rivers.
 *
 * Because every river tile follows the drainage parent of a flooded
 * elevation surface, rivers flow strictly downhill and always end in the
 * ocean or in a lake. They are never drawn as random lines.
 */
import { createRng } from '../../utils/Random.js';
import { MinHeap } from '../../utils/MinHeap.js';
import { N8_DX, N8_DY, directionCode } from '../grid.js';
import { SEA_LEVEL } from '../worldConstants.js';

/** Elevation added per flooding step so that flooded flats still slope toward the outlet. */
const FLOOD_EPSILON = 1e-6;
/** Depth below the flooded surface that counts as a depression. */
const DEPRESSION_MIN = 0.003;
/** A kept lake must be at least this deep somewhere. */
const LAKE_MIN_DEPTH = 0.012;
/** Lakes only form below this height (above sea level). */
const LAKE_MAX_SURFACE = 0.35;

/**
 * Dig lake basins into low-lying inland tiles. Mutates `elevation`.
 */
export function carveLakeBasins(elevation, size, params, seed) {
  const rng = createRng(seed);
  const baseRadius = Math.max(2, size / 64);
  let placed = 0;
  for (let attempt = 0; attempt < params.lakeBasins * 40 && placed < params.lakeBasins; attempt++) {
    const x = rng.int(8, size - 9);
    const y = rng.int(8, size - 9);
    const e = elevation[y * size + x];
    if (e < SEA_LEVEL + 0.006 || e > SEA_LEVEL + 0.09) continue;
    const radius = rng.float(baseRadius, baseRadius * 2.2);

    // Keep basins inland: a ring around the site must be land.
    const ring = radius * 3 + 3;
    let inland = true;
    for (let k = 0; k < 8 && inland; k++) {
      const angle = (k / 8) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(angle) * ring);
      const sy = Math.round(y + Math.sin(angle) * ring);
      if (sx < 1 || sy < 1 || sx >= size - 1 || sy >= size - 1) {
        inland = false;
      } else if (elevation[sy * size + sx] <= SEA_LEVEL + 0.005) {
        inland = false;
      }
    }
    if (!inland) continue;

    const depth = rng.float(0.05, 0.09);
    const rr = Math.ceil(radius);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const f = 1 - Math.hypot(dx, dy) / radius;
        if (f <= 0) continue;
        elevation[(y + dy) * size + (x + dx)] -= depth * f * f;
      }
    }
    placed++;
  }
}

/**
 * Flood the map from the ocean. Mutates `elevation` so that every land tile
 * drains downhill (basins are filled to their spill height).
 *
 * @returns {{
 *   ocean: Uint8Array, lakeId: Uint16Array,
 *   lakes: Array<{id:number, area:number, surface:number, x:number, y:number}>,
 *   parent: Int32Array, order: Int32Array, orderCount: number
 * }}
 */
export function fillDepressions(elevation, size, params) {
  const total = size * size;

  // --- 1. Ocean = tiles at/below sea level connected to the map border.
  const ocean = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const seedOcean = (i) => {
    if (!ocean[i] && elevation[i] <= SEA_LEVEL) {
      ocean[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < size; x++) {
    seedOcean(x);
    seedOcean((size - 1) * size + x);
  }
  for (let y = 0; y < size; y++) {
    seedOcean(y * size);
    seedOcean(y * size + size - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % size;
    const y = (i - x) / size;
    for (let k = 0; k < 8; k++) {
      const nx = x + N8_DX[k];
      const ny = y + N8_DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      seedOcean(ny * size + nx);
    }
  }

  // --- 2. Priority flood from the coast.
  const filled = new Float64Array(total);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const order = new Int32Array(total);
  let orderCount = 0;
  const heap = new MinHeap(total);

  for (let i = 0; i < total; i++) {
    if (!ocean[i]) continue;
    closed[i] = 1;
    filled[i] = elevation[i];
  }
  for (let i = 0; i < total; i++) {
    if (!ocean[i]) continue;
    const x = i % size;
    const y = (i - x) / size;
    for (let k = 0; k < 8; k++) {
      const nx = x + N8_DX[k];
      const ny = y + N8_DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (!ocean[ny * size + nx]) {
        heap.push(elevation[i], i);
        break;
      }
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const key = heap.lastKey;
    order[orderCount++] = c;
    const cx = c % size;
    const cy = (c - cx) / size;
    for (let k = 0; k < 8; k++) {
      const nx = cx + N8_DX[k];
      const ny = cy + N8_DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (closed[n]) continue;
      closed[n] = 1;
      const level = Math.max(elevation[n], key + FLOOD_EPSILON);
      filled[n] = level;
      parent[n] = c;
      heap.push(level, n);
    }
  }

  // --- 3. Depressions -> candidate lakes (4-connected components).
  const component = new Int32Array(total).fill(-1);
  const found = [];
  for (let i = 0; i < total; i++) {
    if (ocean[i] || component[i] !== -1 || filled[i] - elevation[i] <= DEPRESSION_MIN) continue;
    const id = found.length;
    const comp = { id, cells: [], maxDepth: 0, surface: 0 };
    let qh = 0;
    queue[0] = i;
    let qt = 1;
    component[i] = id;
    while (qh < qt) {
      const c = queue[qh++];
      comp.cells.push(c);
      const depth = filled[c] - elevation[c];
      if (depth > comp.maxDepth) comp.maxDepth = depth;
      if (filled[c] > comp.surface) comp.surface = filled[c];
      const cx = c % size;
      const cy = (c - cx) / size;
      for (let k = 0; k < 8; k += 2) {
        const nx = cx + N8_DX[k];
        const ny = cy + N8_DY[k];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (ocean[n] || component[n] !== -1 || filled[n] - elevation[n] <= DEPRESSION_MIN) continue;
        component[n] = id;
        queue[qt++] = n;
      }
    }
    found.push(comp);
  }

  const lakeId = new Uint16Array(total);
  const lakes = [];
  const candidates = found
    .filter((c) => c.cells.length >= params.lakeMinArea && c.maxDepth >= LAKE_MIN_DEPTH && c.surface <= SEA_LEVEL + LAKE_MAX_SURFACE)
    .sort((a, b) => b.cells.length - a.cells.length || a.id - b.id)
    .slice(0, params.maxLakes);
  for (const comp of candidates) {
    const id = lakes.length + 1;
    let sx = 0;
    let sy = 0;
    for (const c of comp.cells) {
      lakeId[c] = id;
      sx += c % size;
      sy += Math.floor(c / size);
    }
    lakes.push({
      id,
      area: comp.cells.length,
      surface: comp.surface,
      x: sx / comp.cells.length,
      y: sy / comp.cells.length,
    });
  }

  // --- 4. Land now drains downhill everywhere: adopt the flooded surface.
  for (let i = 0; i < total; i++) {
    if (!ocean[i]) elevation[i] = Math.min(1, filled[i]);
  }

  return { ocean, lakeId, lakes, parent, order, orderCount };
}

/**
 * Rivers from rainfall accumulated down the drainage tree.
 *
 * @param {Float32Array} elevation Flooded elevation (after fillDepressions).
 * @param {Uint8Array} rainfall 0-255
 * @returns {{ riverDir: Uint8Array, riverSize: Uint8Array, flowAccumulation: Float32Array, riverCount: number }}
 */
export function generateRivers(elevation, size, hydro, rainfall, params) {
  const total = size * size;
  const { ocean, lakeId, parent, order, orderCount } = hydro;

  // Rain-weighted catchment area for every tile.
  const flow = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    if (!ocean[i]) flow[i] = 0.15 + (rainfall[i] / 255) ** 1.3;
  }
  for (let k = orderCount - 1; k >= 0; k--) {
    const c = order[k];
    const p = parent[c];
    if (p >= 0) flow[p] += flow[c];
  }

  const threshold = params.riverThreshold;
  const isRiver = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (!ocean[i] && lakeId[i] === 0 && flow[i] >= threshold) isRiver[i] = 1;
  }

  // Rivers must begin in the higher half of the land (or leave a lake).
  const sourceMin = landQuantile(elevation, ocean, lakeId, 0.5);
  const upstream = new Uint8Array(total);
  const lakeFed = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const p = parent[i];
    if (p < 0) continue;
    if (isRiver[i] && isRiver[p]) upstream[p]++;
    if (lakeId[i] !== 0 && isRiver[p]) lakeFed[p] = 1;
  }
  const stack = [];
  for (let i = 0; i < total; i++) {
    if (isRiver[i] && upstream[i] === 0 && !lakeFed[i] && elevation[i] < sourceMin) stack.push(i);
  }
  while (stack.length > 0) {
    const i = stack.pop();
    isRiver[i] = 0;
    const p = parent[i];
    if (p >= 0 && isRiver[p]) {
      upstream[p]--;
      if (upstream[p] === 0 && !lakeFed[p] && elevation[p] < sourceMin) stack.push(p);
    }
  }

  const riverDir = new Uint8Array(total);
  const riverSize = new Uint8Array(total);
  let riverCount = 0;
  for (let i = 0; i < total; i++) {
    if (!isRiver[i]) continue;
    const p = parent[i];
    const x = i % size;
    const y = (i - x) / size;
    const px = p % size;
    const py = (p - px) / size;
    riverDir[i] = directionCode(px - x, py - y);
    riverSize[i] = flow[i] >= threshold * 16 ? 3 : flow[i] >= threshold * 4 ? 2 : 1;
    riverCount++;
  }
  return { riverDir, riverSize, flowAccumulation: flow, riverCount };
}

/** Elevation below which `q` of all dry land lies (histogram estimate). */
function landQuantile(elevation, ocean, lakeId, q) {
  const bins = 1024;
  const histogram = new Uint32Array(bins);
  let count = 0;
  for (let i = 0; i < elevation.length; i++) {
    if (ocean[i] || lakeId[i] !== 0) continue;
    const b = Math.min(bins - 1, Math.max(0, Math.floor(((elevation[i] - SEA_LEVEL) / SEA_LEVEL) * bins)));
    histogram[b]++;
    count++;
  }
  const wanted = count * q;
  let cumulative = 0;
  for (let b = 0; b < bins; b++) {
    cumulative += histogram[b];
    if (cumulative >= wanted) return SEA_LEVEL + ((b + 1) / bins) * SEA_LEVEL;
  }
  return 1;
}
