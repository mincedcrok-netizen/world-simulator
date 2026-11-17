/**
 * LEGACY Phase 1 map generator. NOT used by the game since Phase 2; it is kept
 * (with its tests) as a small, dependency-free reference. The game generates
 * worlds with world/generation/WorldGenerator.js.
 *
 * TEMPORARY Phase 1 map generator.
 *
 * Its only job is to give the renderer and camera something realistic-looking
 * to display: distinct land and water, several terrain colours and a clear
 * border. It is deterministic for a given seed and honours the world-creation
 * options coarsely so the options pipeline can be verified end to end.
 *
 * Phase 2 replaces this file with the real procedural generator.
 *
 * Method: scatter a few circular "blobs", warp the coordinates with noise to
 * make coasts organic, then classify each tile by how far inside (or outside)
 * the coast it lies.
 */
import { createRng } from '../utils/Random.js';
import { fbm2D, valueNoise2D } from '../utils/Noise.js';
import { TERRAIN } from './terrain.js';

/** Blob count and radius (as a fraction of the map width) per landmass option. */
const LANDMASS = {
  islands: { count: [12, 18], radius: [0.05, 0.1] },
  balanced: { count: [4, 6], radius: [0.12, 0.2] },
  continents: { count: [2, 3], radius: [0.22, 0.3] },
};

/** Coast threshold: higher means less land. */
const SEA_LEVEL = { low: 0.16, normal: 0.26, high: 0.38 };

/** How strongly noise distorts coastlines and elevation. */
const NOISE_AMPLITUDE = { low: 0.1, normal: 0.22, high: 0.38 };

/**
 * @param {import('../config/worldOptions.js').WorldConfig} config
 * @returns {{ width: number, height: number, tiles: Uint8Array }}
 */
export function generateTestMap(config) {
  const size = config.tiles;
  const rng = createRng(config.seedValue ^ 0x9e3779b9);
  const landmass = LANDMASS[config.landmass];
  const seaLevel = SEA_LEVEL[config.water];
  const amplitude = NOISE_AMPLITUDE[config.variety];

  // Blob placement
  const blobCount = rng.int(landmass.count[0], landmass.count[1]);
  const blobs = [];
  for (let i = 0; i < blobCount; i++) {
    blobs.push({
      x: rng.float(0.2, 0.8) * size,
      y: rng.float(0.2, 0.8) * size,
      r: rng.float(landmass.radius[0], landmass.radius[1]) * size,
    });
  }

  const noiseSeedA = rng.int(0, 0x7fffffff);
  const noiseSeedB = rng.int(0, 0x7fffffff);
  const noiseSeedC = rng.int(0, 0x7fffffff);
  const warpStrength = 0.1 * size;
  const warpScale = 1 / (0.2 * size);
  const detailScale = 1 / (0.1 * size);
  const edgeFade = 0.07 * size; // tiles over which land fades out toward the border
  const shelfTiles = Math.max(2, 0.012 * size); // width of the shallow-water ring

  const tiles = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    const edgeY = Math.min(y, size - 1 - y);
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const edge = Math.min(edgeY, x, size - 1 - x);

      // The outermost ring is always deep water so the border reads clearly.
      if (edge < 2) {
        tiles[index] = TERRAIN.DEEP_WATER;
        continue;
      }

      // Domain warp for organic coastlines
      const wx = x + (valueNoise2D(noiseSeedA, x * warpScale, y * warpScale) - 0.5) * warpStrength;
      const wy = y + (valueNoise2D(noiseSeedB, x * warpScale, y * warpScale) - 0.5) * warpStrength;

      // Normalised "inland-ness" of the best-fitting blob: 1 at its centre, 0 at its rim.
      let best = -Infinity;
      let bestRadius = 1;
      for (let b = 0; b < blobs.length; b++) {
        const blob = blobs[b];
        const dx = wx - blob.x;
        const dy = wy - blob.y;
        const n = 1 - Math.sqrt(dx * dx + dy * dy) / blob.r;
        if (n > best) {
          best = n;
          bestRadius = blob.r;
        }
      }

      best += (fbm2D(noiseSeedC, x * detailScale, y * detailScale, 3) - 0.5) * amplitude;

      // Push land back toward sea near the map border.
      if (edge < edgeFade) {
        const t = edge / edgeFade;
        best -= (1 - t * t * (3 - 2 * t)) * 0.9;
      }

      const outside = (seaLevel - best) * bestRadius; // tiles beyond the coast (negative = inland)
      let terrain;
      if (outside > shelfTiles) terrain = TERRAIN.DEEP_WATER;
      else if (outside > 0) terrain = TERRAIN.SHALLOW_WATER;
      else {
        const inland = best - seaLevel;
        if (inland < 0.03) terrain = TERRAIN.SAND;
        else if (inland < 0.3) terrain = TERRAIN.GRASS;
        else if (inland < 0.46) terrain = TERRAIN.HILLS;
        else terrain = TERRAIN.MOUNTAIN;
      }
      tiles[index] = terrain;
    }
  }

  return { width: size, height: size, tiles };
}
