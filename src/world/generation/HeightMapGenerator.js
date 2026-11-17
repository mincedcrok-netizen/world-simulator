/**
 * Elevation generation.
 *
 * Pipeline
 *  1. Place landmasses (continents / archipelagos) as circles.
 *  2. Distort them with domain-warped noise -> organic coastlines.
 *  3. Lay out mountain ranges as wandering ridges (with spurs) on the land.
 *  4. Add hill noise, combine, and fade to ocean at the map border.
 *  5. Pick the sea level so the requested share of the map is water, then
 *     remap to the fixed convention (sea level = 0.5).
 */
import { createRng } from '../../utils/Random.js';
import { fbm2D, valueNoise2D } from '../../utils/Noise.js';
import { clamp, smoothstep } from '../grid.js';
import { SEA_LEVEL } from '../worldConstants.js';

/** Raw-field value written to the outermost tiles so the border is always open ocean. */
const BORDER_RAW = -3;

/**
 * Place landmass circles. Returned in tile units: { x, y, r }.
 *
 * The blobs are sized to cover roughly the share of the map that the water
 * setting asks for, so the sea level cuts through the blobs instead of
 * fattening them into one merged landmass.
 */
function placeLandmasses(size, params, rng) {
  const masses = [];
  const lo = 0.12 * size;
  const hi = 0.88 * size;
  const wantArea = (1 - params.waterTarget) * size * size * 1.25; // blobs overlap and noise trims them
  const area = (m) => Math.PI * m.r * m.r;
  const covered = () => masses.reduce((sum, m) => sum + area(m), 0);

  const tryPlace = (radius, minGapFactor, attempts = 60) => {
    for (let a = 0; a < attempts; a++) {
      const x = rng.float(lo, hi);
      const y = rng.float(lo, hi);
      const ok = masses.every((m) => Math.hypot(m.x - x, m.y - y) >= (m.r + radius) * minGapFactor);
      if (ok || a === attempts - 1) {
        masses.push({ x, y, r: radius });
        return;
      }
    }
  };

  const rescale = () => {
    const factor = Math.min(1.35, Math.sqrt(wantArea / covered()));
    for (const m of masses) m.r *= factor;
  };

  if (params.landmass === 'continents') {
    const count = rng.int(2, 4);
    for (let i = 0; i < count; i++) tryPlace(rng.float(0.2, 0.3) * size, 0.55);
    const islands = rng.int(3, 6);
    for (let i = 0; i < islands; i++) tryPlace(rng.float(0.03, 0.06) * size, 0.9);
    rescale();
  } else if (params.landmass === 'balanced') {
    const count = rng.int(5, 7);
    for (let i = 0; i < count; i++) tryPlace(rng.float(0.1, 0.17) * size, 0.6);
    const islands = rng.int(5, 9);
    for (let i = 0; i < islands; i++) tryPlace(rng.float(0.03, 0.06) * size, 0.9);
    rescale();
  } else {
    // Archipelagos: a few larger islands, then many small ones scattered around
    // several anchors until the requested land area is reached.
    const big = rng.int(1, 3);
    for (let i = 0; i < big; i++) tryPlace(rng.float(0.07, 0.1) * size, 1.2);
    const anchors = [];
    const anchorCount = rng.int(4, 6);
    for (let a = 0; a < anchorCount; a++) {
      anchors.push({ x: rng.float(lo + 0.05 * size, hi - 0.05 * size), y: rng.float(lo + 0.05 * size, hi - 0.05 * size) });
    }
    for (let attempt = 0; attempt < 800 && covered() < wantArea; attempt++) {
      const anchor = anchors[rng.int(0, anchors.length - 1)];
      const angle = rng.float(0, Math.PI * 2);
      const dist = rng.float(0, 0.2) * size;
      const r = rng.float(0.03, 0.065) * size;
      const x = clamp(anchor.x + Math.cos(angle) * dist, lo, hi);
      const y = clamp(anchor.y + Math.sin(angle) * dist, lo, hi);
      if (masses.every((m) => Math.hypot(m.x - x, m.y - y) >= (m.r + r) * 1.25)) masses.push({ x, y, r });
    }
  }
  return masses;
}

/**
 * "Land-ness" n of every tile: about 1 at the centre of a landmass, 0 at its
 * nominal rim, negative in open ocean. Warped and roughened by noise.
 */
function computeShapeField(size, masses, params, seeds) {
  const shape = new Float32Array(size * size);
  const warpFreq1 = 1 / (0.22 * size);
  const warpFreq2 = 1 / (0.07 * size);
  const warpAmp1 = 0.18 * size * params.warp;
  const warpAmp2 = 0.05 * size * params.warp;
  const coastFreq = 1 / Math.max(14, 0.11 * size);
  const fineFreq = 1 / 9;
  const coastAmp = 0.32 * params.detail * 2;
  const fineAmp = 0.1 * params.detail * 2;

  const count = masses.length;
  const mx = Float32Array.from(masses, (m) => m.x);
  const my = Float32Array.from(masses, (m) => m.y);
  const invR = Float32Array.from(masses, (m) => 1 / m.r);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx =
        x +
        (valueNoise2D(seeds.warpAX, x * warpFreq1, y * warpFreq1) - 0.5) * warpAmp1 +
        (valueNoise2D(seeds.warpBX, x * warpFreq2, y * warpFreq2) - 0.5) * warpAmp2;
      const wy =
        y +
        (valueNoise2D(seeds.warpAY, x * warpFreq1, y * warpFreq1) - 0.5) * warpAmp1 +
        (valueNoise2D(seeds.warpBY, x * warpFreq2, y * warpFreq2) - 0.5) * warpAmp2;

      let best = -Infinity;
      for (let m = 0; m < count; m++) {
        const dx = wx - mx[m];
        const dy = wy - my[m];
        const n = 1 - Math.sqrt(dx * dx + dy * dy) * invR[m];
        if (n > best) best = n;
      }

      best += (fbm2D(seeds.coast, x * coastFreq, y * coastFreq, 3) - 0.5) * coastAmp;
      best += (valueNoise2D(seeds.fine, x * fineFreq, y * fineFreq) - 0.5) * fineAmp;
      shape[y * size + x] = best;
    }
  }
  return shape;
}

/** Random inland tile (shape above `minShape`), or null. */
function findInland(shape, size, rng, minShape, attempts) {
  for (let a = 0; a < attempts; a++) {
    const x = rng.int(4, size - 5);
    const y = rng.int(4, size - 5);
    if (shape[y * size + x] > minShape) return { x, y };
  }
  return null;
}

/** Raise a smooth ridge along a polyline: each point stamps a soft bump (max-combined). */
function stampRidge(mount, size, points, radius, height) {
  const rr = Math.ceil(radius);
  for (const p of points) {
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (let dy = -rr; dy <= rr; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= size) continue;
      for (let dx = -rr; dx <= rr; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= size) continue;
        const f = 1 - Math.hypot(p.x - x, p.y - y) / radius;
        if (f <= 0) continue;
        const v = height * f * f * (3 - 2 * f);
        const i = y * size + x;
        if (v > mount[i]) mount[i] = v;
      }
    }
  }
}

/** A wandering path that stays on land: a drifting heading, one tile per step. */
function walkRidge(start, heading, length, shape, size, rng) {
  const points = [];
  let x = start.x;
  let y = start.y;
  let h = heading;
  for (let step = 0; step < length; step++) {
    points.push({ x, y });
    h += (rng.next() - 0.5) * 0.5;
    x += Math.cos(h);
    y += Math.sin(h);
    if (x < 3 || y < 3 || x > size - 4 || y > size - 4) break;
    if (step > 8 && shape[Math.round(y) * size + Math.round(x)] < 0.1) break;
  }
  return points;
}

/**
 * Mountain ranges: long connected ridges with a few shorter spurs, so
 * mountains form chains instead of scattered single tiles.
 */
function computeMountainField(size, shape, params, rng, seeds) {
  const mount = new Float32Array(size * size);
  for (let r = 0; r < params.rangeCount; r++) {
    const start = findInland(shape, size, rng, 0.3, 400);
    if (!start) continue;
    const length = Math.round(rng.float(0.14, 0.34) * size);
    const radius = Math.max(3, rng.float(0.014, 0.026) * size * params.rangeWidth);
    const height = rng.float(0.7, 1);
    const spine = walkRidge(start, rng.float(0, Math.PI * 2), length, shape, size, rng);
    stampRidge(mount, size, spine, radius, height);

    // Spurs branch off the spine at an angle.
    const spurs = rng.int(1, 3);
    for (let s = 0; s < spurs && spine.length > 12; s++) {
      const origin = spine[rng.int(Math.floor(spine.length * 0.2), Math.floor(spine.length * 0.8))];
      const side = rng.chance(0.5) ? 1 : -1;
      const heading = rng.float(0, Math.PI * 2);
      const spur = walkRidge(origin, heading + side * rng.float(0.35, 0.8), Math.round(length * 0.4), shape, size, rng);
      stampRidge(mount, size, spur, radius * 0.7, height * 0.8);
    }
  }

  // Ridged noise breaks the smooth bumps into jagged crests.
  const ridgeFreq = 1 / 11;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (mount[i] < 0.01) continue;
      const ridge = 1 - Math.abs(2 * fbm2D(seeds.ridge, x * ridgeFreq, y * ridgeFreq, 3) - 1);
      mount[i] *= 0.5 + 0.9 * ridge * params.ridge;
    }
  }
  return mount;
}

/** Sea level in raw units such that `target` of all tiles lie at or below it. */
function findSeaLevel(raw, target) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < lo) lo = raw[i];
    if (raw[i] > hi) hi = raw[i];
  }
  const bins = 4096;
  const histogram = new Uint32Array(bins);
  const scale = (bins - 1) / (hi - lo);
  for (let i = 0; i < raw.length; i++) histogram[Math.floor((raw[i] - lo) * scale)]++;
  const wanted = target * raw.length;
  let cumulative = 0;
  for (let b = 0; b < bins; b++) {
    cumulative += histogram[b];
    if (cumulative >= wanted) return { sea: lo + (b + 1) / scale, max: hi }; // upper edge of the bin: it is all water
  }
  return { sea: hi, max: hi };
}

/** Raw value below which fraction `q` of the tiles above `sea` lie. */
function landPercentile(raw, sea, q) {
  const land = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] > sea) land.push(raw[i]);
  if (land.length === 0) return sea + 1;
  const sorted = Float32Array.from(land).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/**
 * @param {import('../../config/worldOptions.js').WorldConfig} config
 * @param {ReturnType<import('./GenerationParams.js').getGenerationParams>} params
 * @param {number} seed Stage seed.
 * @returns {{ elevation: Float32Array, landmasses: Array<{x:number,y:number,r:number}> }}
 */
export function generateHeightMap(config, params, seed) {
  const size = config.tiles;
  const rng = createRng(seed);
  const seeds = {};
  for (const key of ['warpAX', 'warpAY', 'warpBX', 'warpBY', 'coast', 'fine', 'hills', 'uplands', 'micro', 'ridge']) {
    seeds[key] = rng.int(1, 0x3fffffff);
  }

  const masses = placeLandmasses(size, params, rng);
  const shape = computeShapeField(size, masses, params, seeds);
  const mount = computeMountainField(size, shape, params, rng, seeds);

  // Combine into one raw field. Base land is a low plateau (shape is capped);
  // hills come from noise and mountains from the ridge field.
  const raw = new Float32Array(size * size);
  const hillFreq = 1 / 28;
  const hillAmp = 0.06 * params.detail;
  const uplandFreq = 1 / (0.12 * size);
  const uplandAmp = 0.28 * params.detail;
  const microAmp = 0.04 * params.detail ** 2; // small-scale roughness: strongly tied to terrain variety
  const edgeFade = 0.07 * size;
  for (let y = 0; y < size; y++) {
    const edgeY = Math.min(y, size - 1 - y);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const edge = Math.min(edgeY, x, size - 1 - x);
      if (edge < 2) {
        raw[i] = BORDER_RAW;
        continue;
      }
      const n = shape[i];
      const inland = smoothstep(0, 0.4, n);
      const hills = (fbm2D(seeds.hills, x * hillFreq, y * hillFreq, 4) - 0.5) * 2;
      // Broad rolling uplands give hill country that is not tied to a mountain range.
      const uplands = smoothstep(0.55, 0.75, fbm2D(seeds.uplands, x * uplandFreq, y * uplandFreq, 3));
      let value =
        0.58 * clamp(n, -2.5, 0.24) + // no flat floor far out at sea, so the sea-level quantile never lands inside a tie
        inland * (hillAmp * hills + uplandAmp * uplands + microAmp * (valueNoise2D(seeds.micro, x / 9, y / 9) - 0.5) * 2) +
        inland * 0.7 * mount[i];
      const fade = smoothstep(2, edgeFade, edge);
      value = value * fade + (1 - fade) * BORDER_RAW;
      raw[i] = value;
    }
  }

  const { sea } = findSeaLevel(raw, params.waterTarget);

  // Remap to the fixed convention: sea level 0.5, ocean floor 0..0.5, land 0.5..1.
  const elevation = new Float32Array(size * size);
    // Scale by a high percentile of the land (not the single tallest peak) so one spike cannot flatten the rest.
  const landRange = Math.max(1e-6, landPercentile(raw, sea, 0.992) - sea);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (v <= sea) {
      const depth = Math.min(1, (sea - v) / 0.3);
      elevation[i] = SEA_LEVEL - SEA_LEVEL * depth;
    } else {
      // Land always sits strictly above sea level. The convex curve keeps ordinary
      // lowland low and reserves the upper range for hills, mountains and peaks.
      const h = clamp((v - sea) / landRange, 0, 1);
      elevation[i] = SEA_LEVEL + 0.0005 + (SEA_LEVEL - 0.0005) * h ** 1.5;
    }
  }
  return { elevation, landmasses: masses };
}
