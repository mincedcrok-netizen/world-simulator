/**
 * Procedural world generation: the single entry point.
 *
 *   generateWorld(config) -> World
 *
 * Deterministic: the same seed and settings always give the identical world,
 * because every stage draws only from seeds derived from the world seed. It
 * has no Phaser or DOM dependency and runs headlessly.
 *
 * Stages (each in its own module):
 *   HeightMapGenerator   elevation, continents, islands, mountain ranges
 *   RiverGenerator       lake basins, depression filling, drainage
 *   ClimateGenerator     temperature, rainfall
 *   RiverGenerator       rivers from rainfall along the drainage
 *   ClimateGenerator     moisture
 *   BiomeGenerator       biomes and terrain
 *   ResourceGenerator    resources and deposits
 */
import { validateWorldConfig } from '../../config/worldOptions.js';
import { World } from '../World.js';
import { generateBiomes } from './BiomeGenerator.js';
import { computeMoisture, generateClimate } from './ClimateGenerator.js';
import { getGenerationParams, stageSeed } from './GenerationParams.js';
import { generateHeightMap } from './HeightMapGenerator.js';
import { generateResources } from './ResourceGenerator.js';
import { carveLakeBasins, fillDepressions, generateRivers } from './RiverGenerator.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Thrown when a world cannot be generated from the given configuration. */
export class WorldGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorldGenerationError';
  }
}

/**
 * @param {unknown} input World-creation settings (validated here again).
 * @returns {World}
 * @throws {WorldGenerationError} for an invalid configuration.
 */
export function generateWorld(input) {
  const validation = validateWorldConfig(input);
  if (!validation.ok) {
    throw new WorldGenerationError(`Invalid world configuration: ${Object.values(validation.errors).join(' ')}`);
  }
  const config = validation.value;
  const params = getGenerationParams(config);
  const size = config.tiles;
  const seed = (stage) => stageSeed(config.seedValue, stage);
  const timings = {};
  const time = (label, fn) => {
    const start = now();
    const result = fn();
    timings[label] = Math.round(now() - start);
    return result;
  };

  const startedAt = now();

  const { elevation, landmasses } = time('height', () => generateHeightMap(config, params, seed('height')));
  time('lakes', () => carveLakeBasins(elevation, size, params, seed('lakes')));
  const hydro = time('drainage', () => fillDepressions(elevation, size, params));
  const { temperature, rainfall } = time('climate', () => generateClimate(elevation, size, hydro, params, seed('climate')));
  const rivers = time('rivers', () => generateRivers(elevation, size, hydro, rainfall, params));
  const { moisture, freshDistance, coastDistance } = time('moisture', () =>
    computeMoisture(size, { rainfall, temperature, ocean: hydro.ocean, lakeId: hydro.lakeId, riverSize: rivers.riverSize }),
  );
  const { biomes, tiles } = time('biomes', () =>
    generateBiomes(
      size,
      { elevation, temperature, moisture, ocean: hydro.ocean, lakeId: hydro.lakeId, freshDistance, coastDistance },
      params,
      seed('biomes'),
    ),
  );
  const { resources, deposits } = time('resources', () =>
    generateResources(
      size,
      { tiles, biomes, elevation, moisture, ocean: hydro.ocean, lakeId: hydro.lakeId, riverSize: rivers.riverSize, freshDistance },
      seed('resources'),
    ),
  );

  timings.total = Math.round(now() - startedAt);

  return new World({
    width: size,
    height: size,
    tiles,
    seed: config.seed,
    seedValue: config.seedValue,
    elevation,
    temperature,
    rainfall,
    moisture,
    biomes,
    riverDir: rivers.riverDir,
    riverSize: rivers.riverSize,
    flowAccumulation: rivers.flowAccumulation,
    lakeId: hydro.lakeId,
    lakes: hydro.lakes,
    resources,
    deposits,
    landmasses,
    generationMs: timings.total,
    generationTimings: timings,
  });
}
