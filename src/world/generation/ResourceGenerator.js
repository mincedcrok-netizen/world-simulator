/**
 * Natural resources as structured per-tile data (no mining or harvesting yet).
 *
 * Every resource is a Uint8 richness map (0 = absent .. 255 = richest):
 *  - wood, stone, fertile soil follow terrain, with noise for variation;
 *  - freshwater falls off with distance from rivers and lakes;
 *  - iron, copper, gold and coal form clusters: smooth noise decides *where*
 *    veins are, and a per-terrain suitability decides how likely they are
 *    (ores prefer mountains and hills). Clusters are also summarised as a
 *    list of discrete deposits.
 */
import { createRng } from '../../utils/Random.js';
import { fbm2D } from '../../utils/Noise.js';
import { N8_DX, N8_DY, smoothstep } from '../grid.js';
import { BIOME } from '../biomes.js';
import { ORE_KEYS, RESOURCE, RESOURCE_KEYS, RESOURCE_PRESENT } from '../resources.js';
import { TERRAIN } from '../terrain.js';
import { HILL_LEVEL } from '../worldConstants.js';

// Index = terrain id: DEEP, SHALLOW, SAND, GRASS, HILLS, MOUNTAIN, PLAINS, FOREST, DENSE, DESERT, TUNDRA, SNOW, SWAMP, LAKE
const STONE = [0, 0, 20, 25, 170, 230, 30, 25, 20, 60, 30, 90, 15, 0];
const WOOD = [0, 0, 0, 25, 30, 10, 10, 150, 230, 5, 15, 0, 70, 0];
const FERTILE = [0, 0, 20, 215, 60, 0, 190, 90, 60, 8, 15, 0, 80, 0];

const ORES = {
  [RESOURCE.IRON]: {
    threshold: 0.64, freq: 1 / 8,
    suit: [0, 0, 0, 0.05, 0.85, 1, 0.12, 0.08, 0.06, 0.05, 0.05, 0.6, 0.03, 0],
  },
  [RESOURCE.COPPER]: {
    threshold: 0.65, freq: 1 / 8,
    suit: [0, 0, 0, 0.05, 1, 0.9, 0.1, 0.06, 0.05, 0.25, 0.05, 0.5, 0.03, 0],
  },
  [RESOURCE.GOLD]: {
    threshold: 0.73, freq: 1 / 7,
    suit: [0, 0, 0, 0.02, 0.55, 1, 0.04, 0.03, 0.03, 0.2, 0.03, 0.7, 0.02, 0],
  },
  [RESOURCE.COAL]: {
    threshold: 0.63, freq: 1 / 9,
    suit: [0, 0, 0, 0.35, 1, 0.5, 0.45, 0.5, 0.5, 0.15, 0.1, 0.3, 0.8, 0],
  },
};

const FRESHWATER_BY_DISTANCE = [255, 210, 150, 90, 45];

const FOREST_BIOMES = new Set([BIOME.TAIGA, BIOME.TEMPERATE_FOREST, BIOME.RAINFOREST]);

/**
 * @param {number} size
 * @param {object} fields tiles, biomes, elevation, moisture, ocean, lakeId, riverSize, freshDistance
 * @returns {{ resources: Record<string, Uint8Array>, deposits: Array<object> }}
 */
export function generateResources(size, fields, seed) {
  const { tiles, biomes, elevation, moisture, ocean, lakeId, riverSize, freshDistance } = fields;
  const total = size * size;
  const rng = createRng(seed);
  const seeds = {};
  for (const key of ['variation', ...Object.keys(ORES)]) seeds[key] = rng.int(1, 0x3fffffff);

  const resources = {};
  for (const key of RESOURCE_KEYS) resources[key] = new Uint8Array(total);
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const terrain = tiles[i];

      if (ocean[i]) continue; // salt water holds none of these resources
      if (lakeId[i] !== 0) {
        resources[RESOURCE.FRESHWATER][i] = 255;
        continue;
      }

      const variation = 0.7 + 0.6 * fbm2D(seeds.variation, x / 6, y / 6, 2);
      const biome = biomes[i];

      // Wood: forests, with trees thinning out up hillsides in forest biomes.
      let wood = WOOD[terrain];
      if (FOREST_BIOMES.has(biome)) {
        if (terrain === TERRAIN.HILLS) wood = 110;
        else if (terrain === TERRAIN.MOUNTAIN) wood = 30;
      }
      resources[RESOURCE.WOOD][i] = clamp255(wood * variation);

      resources[RESOURCE.STONE][i] = clamp255(STONE[terrain] * variation);

      // Fertile soil: lowland grass and plains, richer in river valleys, scaled by moisture.
      let fertile = FERTILE[terrain] * (0.5 + 0.6 * (moisture[i] / 255));
      const waterDist = freshDistance[i];
      if (waterDist <= 2) fertile += terrain === TERRAIN.DESERT ? 110 : 60; // river valleys and lake shores
      resources[RESOURCE.FERTILE_SOIL][i] = clamp255(fertile * (terrain === TERRAIN.DESERT ? 1 : variation));

      resources[RESOURCE.FRESHWATER][i] = waterDist <= 4 ? FRESHWATER_BY_DISTANCE[waterDist] : 0;

      // Ores: clustered veins, strongly tied to rock type.
      const rocky = elevation[i] >= HILL_LEVEL;
      for (const key of ORE_KEYS) {
        const ore = ORES[key];
        let suit = ore.suit[terrain];
        if (key === RESOURCE.GOLD && riverSize[i] !== 0 && rocky) suit += 0.4; // placer gold in upland rivers
        if (suit <= 0) continue;
        const field = fbm2D(seeds[key], x * ore.freq, y * ore.freq, 2);
        const richness = smoothstep(ore.threshold, ore.threshold + 0.14, field) * Math.min(1, suit);
        if (richness > 0) resources[key][i] = clamp255(richness * 255);
      }
    }
  }

  return { resources, deposits: summarizeDeposits(size, resources) };
}

/** Connected clusters of each ore as discrete deposits (for later phases). */
function summarizeDeposits(size, resources) {
  const total = size * size;
  const deposits = [];
  const queue = new Int32Array(total);
  for (const type of ORE_KEYS) {
    const map = resources[type];
    const seen = new Uint8Array(total);
    for (let start = 0; start < total; start++) {
      if (seen[start] || map[start] < RESOURCE_PRESENT) continue;
      let head = 0;
      let tail = 1;
      queue[0] = start;
      seen[start] = 1;
      let amount = 0;
      let best = start;
      while (head < tail) {
        const c = queue[head++];
        amount += map[c];
        if (map[c] > map[best]) best = c;
        const cx = c % size;
        const cy = (c - cx) / size;
        for (let k = 0; k < 8; k++) {
          const nx = cx + N8_DX[k];
          const ny = cy + N8_DY[k];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const n = ny * size + nx;
          if (seen[n] || map[n] < RESOURCE_PRESENT) continue;
          seen[n] = 1;
          queue[tail++] = n;
        }
      }
      deposits.push({ type, x: best % size, y: Math.floor(best / size), tiles: tail, amount });
    }
  }
  return deposits;
}
