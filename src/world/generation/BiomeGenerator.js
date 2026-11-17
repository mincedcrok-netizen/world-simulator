/**
 * Biomes and terrain.
 *
 * Biome  = climate zone (temperature x moisture, Whittaker-style).
 * Terrain = what the tile physically is: biome adjusted by elevation
 *           (hills, mountains, snow-capped peaks) and by the coast (beaches).
 *
 * Climate fields are smooth, so biomes form large coherent regions rather
 * than scattered tiles; a little noise on the thresholds roughens only the
 * borders between them.
 */
import { createRng } from '../../utils/Random.js';
import { fbm2D } from '../../utils/Noise.js';
import { distanceField } from '../grid.js';
import { BIOME } from '../biomes.js';
import { TERRAIN } from '../terrain.js';
import { HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL, SHALLOW_LEVEL } from '../worldConstants.js';

function classifyBiome(t, m, lowland, nearWater) {
  if (t < -12) return BIOME.ICE;
  if (t < -6) return BIOME.TUNDRA;
  if (t < 4) return m < 0.28 ? BIOME.TUNDRA : BIOME.TAIGA;
  if (t < 18) {
    if (m < 0.14) return BIOME.DESERT;
    if (m < 0.38) return BIOME.GRASSLAND;
    if (m > 0.8 && lowland && nearWater) return BIOME.SWAMP;
    return BIOME.TEMPERATE_FOREST;
  }
  if (m < 0.18) return BIOME.DESERT;
  if (m < 0.45) return BIOME.SAVANNA;
  if (m > 0.78 && lowland && nearWater) return BIOME.SWAMP;
  if (m < 0.68) return BIOME.TEMPERATE_FOREST;
  return BIOME.RAINFOREST;
}

function terrainForBiome(biome, m) {
  switch (biome) {
    case BIOME.ICE: return TERRAIN.SNOW;
    case BIOME.TUNDRA: return TERRAIN.TUNDRA;
    case BIOME.TAIGA: return m > 0.6 ? TERRAIN.DENSE_FOREST : TERRAIN.FOREST;
    case BIOME.GRASSLAND: return m < 0.28 ? TERRAIN.PLAINS : TERRAIN.GRASS;
    case BIOME.TEMPERATE_FOREST: return m > 0.62 ? TERRAIN.DENSE_FOREST : TERRAIN.FOREST;
    case BIOME.RAINFOREST: return TERRAIN.DENSE_FOREST;
    case BIOME.SAVANNA: return m < 0.35 ? TERRAIN.PLAINS : TERRAIN.GRASS;
    case BIOME.DESERT: return TERRAIN.DESERT;
    case BIOME.SWAMP: return TERRAIN.SWAMP;
    default: return TERRAIN.PLAINS;
  }
}

/**
 * @param {number} size
 * @param {object} fields elevation, temperature, moisture, ocean, lakeId, freshDistance, coastDistance
 * @returns {{ biomes: Uint8Array, tiles: Uint8Array }}
 */
export function generateBiomes(size, fields, params, seed) {
  const { elevation, temperature, moisture, ocean, lakeId, freshDistance, coastDistance } = fields;
  const total = size * size;
  const rng = createRng(seed);
  const seedT = rng.int(1, 0x3fffffff);
  const seedM = rng.int(1, 0x3fffffff);
  const patchFreq = 1 / Math.max(10, 0.05 * size);
  const tempJitter = 4 * params.variety;
  const moistJitter = 0.22 * params.variety;

  // Distance from land into the sea gives a shallow coastal shelf of at least two tiles.
  const land = new Uint8Array(total);
  for (let i = 0; i < total; i++) land[i] = ocean[i] ? 0 : 1;
  const shelfDistance = distanceField(size, size, land, 2);

  const biomes = new Uint8Array(total);
  const tiles = new Uint8Array(total);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (ocean[i]) {
        biomes[i] = BIOME.OCEAN;
        tiles[i] = elevation[i] > SHALLOW_LEVEL || shelfDistance[i] <= 2 ? TERRAIN.SHALLOW_WATER : TERRAIN.DEEP_WATER;
        continue;
      }
      if (lakeId[i] !== 0) {
        biomes[i] = BIOME.LAKE;
        tiles[i] = TERRAIN.LAKE;
        continue;
      }

      const e = elevation[i];
      const t = temperature[i] + (fbm2D(seedT, x * patchFreq, y * patchFreq, 2) - 0.5) * tempJitter;
      const m = Math.min(1, Math.max(0, moisture[i] / 255 + (fbm2D(seedM, x * patchFreq, y * patchFreq, 2) - 0.5) * moistJitter));

      if (e >= MOUNTAIN_LEVEL) {
        biomes[i] = BIOME.ALPINE;
        tiles[i] = t < -11 ? TERRAIN.SNOW : TERRAIN.MOUNTAIN; // snow-capped peaks
        continue;
      }

      const lowland = e < SEA_LEVEL + 0.06;
      const nearWater = freshDistance[i] <= 3 || coastDistance[i] <= 3;
      const biome = classifyBiome(t, m, lowland, nearWater);
      biomes[i] = biome;

      if (e >= HILL_LEVEL) {
        tiles[i] = t < -12 ? TERRAIN.SNOW : TERRAIN.HILLS;
      } else if (coastDistance[i] <= 1 && e < SEA_LEVEL + 0.035 && biome !== BIOME.ICE && biome !== BIOME.TUNDRA && biome !== BIOME.SWAMP) {
        tiles[i] = TERRAIN.SAND; // beach: low ground right at the sea
      } else {
        tiles[i] = terrainForBiome(biome, m);
      }
    }
  }
  return { biomes, tiles };
}
