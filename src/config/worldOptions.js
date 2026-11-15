/**
 * World-creation options and input validation.
 *
 * Phase 1 only collects and validates these values; the temporary test map
 * reads them, and Phase 2's real generator will take over the same config.
 */
import { generateWorldName } from '../utils/WorldNames.js';
import { normalizeSeed, randomSeedString, seedToInt } from '../utils/Random.js';

export const WORLD_SIZES = Object.freeze({
  small: Object.freeze({ label: 'Small', tiles: 128 }),
  medium: Object.freeze({ label: 'Medium', tiles: 256 }),
  large: Object.freeze({ label: 'Large', tiles: 512 }),
});

export const LANDMASS_OPTIONS = Object.freeze({
  islands: Object.freeze({ label: 'Islands' }),
  balanced: Object.freeze({ label: 'Balanced' }),
  continents: Object.freeze({ label: 'Continents' }),
});

export const WATER_OPTIONS = Object.freeze({
  low: Object.freeze({ label: 'Low' }),
  normal: Object.freeze({ label: 'Normal' }),
  high: Object.freeze({ label: 'High' }),
});

export const VARIETY_OPTIONS = Object.freeze({
  low: Object.freeze({ label: 'Low' }),
  normal: Object.freeze({ label: 'Normal' }),
  high: Object.freeze({ label: 'High' }),
});

export const DEFAULT_WORLD_OPTIONS = Object.freeze({
  size: 'medium',
  landmass: 'balanced',
  water: 'normal',
  variety: 'normal',
});

export const NAME_MAX_LENGTH = 40;
export const SEED_MAX_LENGTH = 32;

// Control characters (tab, newline, DEL ...) are never allowed in names or seeds.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Fresh form values: random name, random seed, default options. */
export function createDefaultWorldConfig() {
  return {
    name: generateWorldName(),
    seed: randomSeedString(),
    ...DEFAULT_WORLD_OPTIONS,
  };
}

/**
 * Validate raw world-creation input.
 *
 * @param {unknown} input
 * @returns {{ ok: true, value: WorldConfig } | { ok: false, errors: Record<string, string> }}
 *
 * @typedef {Object} WorldConfig
 * @property {string} name
 * @property {string} seed       Seed as entered (trimmed).
 * @property {number} seedValue  Unsigned 32-bit integer derived from the seed.
 * @property {string} size       Key of WORLD_SIZES.
 * @property {number} tiles      Map width and height in tiles.
 * @property {string} landmass   Key of LANDMASS_OPTIONS.
 * @property {string} water      Key of WATER_OPTIONS.
 * @property {string} variety    Key of VARIETY_OPTIONS.
 */
export function validateWorldConfig(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: { form: 'World settings are missing or malformed.' } };
  }
  const errors = {};

  // Name
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length === 0) errors.name = 'Enter a name for the world.';
  else if (name.length > NAME_MAX_LENGTH) errors.name = `Use ${NAME_MAX_LENGTH} characters or fewer.`;
  else if (CONTROL_CHARS.test(name)) errors.name = 'Remove line breaks and control characters.';

  // Seed (text or number)
  let seedText = '';
  if (typeof input.seed === 'number') {
    seedText = Number.isFinite(input.seed) ? String(input.seed) : '';
  } else if (typeof input.seed === 'string') {
    seedText = input.seed.trim();
  }
  if (seedText.length === 0) errors.seed = 'Enter a seed, or choose Randomize.';
  else if (seedText.length > SEED_MAX_LENGTH) errors.seed = `Use ${SEED_MAX_LENGTH} characters or fewer.`;
  else if (CONTROL_CHARS.test(seedText)) errors.seed = 'Remove line breaks and control characters.';

  // Enumerated options
  const checkOption = (field, table, label) => {
    if (typeof input[field] !== 'string' || !Object.hasOwn(table, input[field])) {
      errors[field] = `Choose a valid ${label}.`;
    }
  };
  checkOption('size', WORLD_SIZES, 'world size');
  checkOption('landmass', LANDMASS_OPTIONS, 'landmass distribution');
  checkOption('water', WATER_OPTIONS, 'water coverage');
  checkOption('variety', VARIETY_OPTIONS, 'terrain variety');

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name,
      seed: seedText,
      seedValue: seedToInt(normalizeSeed(seedText)),
      size: input.size,
      tiles: WORLD_SIZES[input.size].tiles,
      landmass: input.landmass,
      water: input.water,
      variety: input.variety,
    },
  };
}
