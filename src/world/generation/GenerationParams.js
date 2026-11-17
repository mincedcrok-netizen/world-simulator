/**
 * Turns the player's world-creation choices into the numbers the generators
 * use. Keeping every tuning knob here makes the settings easy to audit.
 */
import { hashString } from '../../utils/Random.js';

/** Fraction of all tiles that should be ocean, before the landmass adjustment. */
const WATER_BASE = { low: 0.52, normal: 0.64, high: 0.76 };
/** Islands leave more open water, continents less. */
const WATER_ADJUST = { islands: 0.08, balanced: 0, continents: -0.06 };
/** Terrain variety scales noise strength, ridge height and climate patchiness. */
const VARIETY = { low: 0.55, normal: 1, high: 1.6 };

/**
 * @param {import('../../config/worldOptions.js').WorldConfig} config
 */
export function getGenerationParams(config) {
  const size = config.tiles;
  const variety = VARIETY[config.variety];
  const waterTarget = WATER_BASE[config.water] + WATER_ADJUST[config.landmass];
  const scale = size / 256;

  return {
    size,
    landmass: config.landmass,
    /** Target fraction of ocean tiles (0-1). */
    waterTarget,
    variety,
    /** Domain-warp strength for coastlines. */
    warp: 0.7 + 0.3 * variety,
    /** Amplitude of coast and hill noise. */
    detail: variety,
    /** How strongly ridged noise roughens mountain ranges. */
    ridge: 0.6 + 0.4 * variety,
    /** Number of mountain ranges (each with spurs). */
    rangeCount: Math.max(2, Math.min(14, Math.round(scale * (3 + 3 * variety)))),
    /** Width multiplier for mountain ranges. */
    rangeWidth: 0.8 + 0.2 * variety,
    /** Number of lake basins carved into low land before flooding. */
    lakeBasins: Math.max(2, Math.round((size / 40) * (0.7 + 0.5 * variety))),
    /** Smallest lake kept, in tiles. */
    lakeMinArea: Math.max(2, Math.round(size / 100)),
    maxLakes: Math.round(4 + size / 20),
    /** Upstream catchment (rain-weighted tiles) needed for a river tile. */
    riverThreshold: Math.max(14, 0.0007 * size * size * 0.55),
    /** Strength of noise added to temperature and rainfall. */
    climateNoise: 0.5 + 0.5 * variety,
  };
}

/** Independent deterministic seed for one generation stage. */
export function stageSeed(seedValue, stage) {
  return hashString(`${stage}:${seedValue}`);
}
