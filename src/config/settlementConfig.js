/**
 * Data-driven tuning for population and settlements.
 *
 * Every rate, yield and threshold the settlement simulation uses lives here,
 * so balance changes never touch simulation code. Use
 * `createSettlementConfig(overrides)` to derive a validated variant (tests and
 * later game modes do this); unknown keys and out-of-range values throw a
 * SettlementConfigError instead of being silently ignored.
 *
 * Units: one "food unit" feeds one person for one year; times are simulated years.
 */

export class SettlementConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SettlementConfigError';
  }
}

export const DEFAULT_SETTLEMENT_CONFIG = Object.freeze({
  placement: Object.freeze({
    /** Roughly one starting settlement per this many land tiles. */
    tilesPerSettlement: 900,
    minSettlements: 3,
    maxSettlements: 160,
    /** Hard minimum distance between settlements, in tiles. */
    minDistance: 6,
    /** Spacing target as a fraction of sqrt(land tiles per settlement). */
    spreadFactor: 0.7,
    /** Half-width of the square area a settlement works (tiles). */
    siteRadius: 4,
    /** Freshwater richness (0-255) required at the site: within about 2 tiles of a river or lake. */
    minFreshwater: 90,
    /** Sites scoring below this (0-1) are never used. */
    minScore: 0.12,
    initialPopulationMin: 22,
    initialPopulationMax: 40,
    /** Starting food storage, in years of consumption. */
    initialFoodYears: 0.5,
    weights: Object.freeze({ farmland: 0.4, water: 0.25, forage: 0.15, resources: 0.1, access: 0.1 }),
  }),
  food: Object.freeze({
    foodPerPerson: 1,
    /** Share of the population that works. */
    workerShare: 0.55,
    baseOutputPerWorker: 2.2,
    outputPerDevelopment: 0.35,
    /** Food per year from one fully fertile farmable tile. */
    farmYield: 3,
    /** Food per year from foraging and hunting one fully wooded tile. */
    forageYield: 0.4,
    /** Food per year from fishing one river or lake tile. */
    waterYield: 0.7,
    /** Land yield bonus per development level. */
    landBonusPerDevelopment: 0.3,
    /** Production multiplier at zero water access (1 at full access). */
    waterFactorMin: 0.6,
    /** Capacity is the land's food divided by consumption, times this. */
    capacityEfficiency: 0.9,
    minCapacity: 8,
    /** Yearly random harvest variation, +/- fraction. */
    harvestVariation: 0.2,
    /** Chance per year of a drought (a failed harvest), and how much of the harvest it destroys. */
    droughtChance: 0.04,
    droughtSeverity: 0.55,
    /** Share of stored food that spoils each year. */
    spoilage: 0.1,
    storageYearsBase: 0.5,
    storageYearsPerDevelopment: 0.15,
  }),
  population: Object.freeze({
    baseDeathRate: 0.025,
    /** Logistic growth rate when far below capacity (per year). */
    maxGrowthRate: 0.03,
    /** Extra death rate at zero food. */
    famineDeathRate: 0.18,
    /** Extra death rate per unit of overshoot beyond capacity. */
    overcrowdDeathRate: 0.08,
    /** Death-rate increase at zero living conditions. */
    livingDeathEffect: 0.4,
    /** How fast living conditions fall / recover toward their target each year. */
    livingDeclineRate: 0.5,
    livingRecoveryRate: 0.2,
    initialLivingConditions: 0.7,
    /** A settlement below this population is abandoned. */
    abandonBelow: 2,
  }),
  development: Object.freeze({
    maxLevel: 5,
    /** Progress toward the next level per year under ideal conditions. */
    progressPerYear: 0.06,
    /** Progress needed for the next level = base + step * current level. */
    levelCostBase: 1,
    levelCostStep: 0.5,
    /** Food supply ratio counted as secure / as hardship. */
    secureFed: 0.95,
    hardshipFed: 0.7,
    /** Stored food (in years of consumption) required to count as secure. */
    secureStockYears: 0.25,
    /** Progress lost per year while in hardship. */
    regressPerYear: 0.1,
    /** Population share of capacity needed to progress at full speed. */
    fullSpeedFillShare: 0.5,
  }),
  types: Object.freeze({
    camp: Object.freeze({ label: 'Camp', maxPopulation: 90 }),
    village: Object.freeze({
      label: 'Village', minDevelopment: 2, minPopulation: 35, minSecureYears: 5, maxPopulation: 500,
    }),
    /** Future-ready: its thresholds exceed what Phase 3 can reach (village capacity and max development). */
    town: Object.freeze({
      label: 'Town', minDevelopment: 6, minPopulation: 500, minSecureYears: 10, maxPopulation: 2500, attainable: false,
    }),
  }),
});

/** Allowed [min, max] for every numeric setting (dotted path). `int` marks integers. */
const RANGES = {
  'placement.tilesPerSettlement': [50, 1e6, true],
  'placement.minSettlements': [0, 1000, true],
  'placement.maxSettlements': [1, 5000, true],
  'placement.minDistance': [1, 200, true],
  'placement.spreadFactor': [0, 2],
  'placement.siteRadius': [1, 12, true],
  'placement.minFreshwater': [0, 255],
  'placement.minScore': [0, 1],
  'placement.initialPopulationMin': [1, 1e5, true],
  'placement.initialPopulationMax': [1, 1e5, true],
  'placement.initialFoodYears': [0, 10],
  'placement.weights.farmland': [0, 1],
  'placement.weights.water': [0, 1],
  'placement.weights.forage': [0, 1],
  'placement.weights.resources': [0, 1],
  'placement.weights.access': [0, 1],
  'food.foodPerPerson': [0.01, 100],
  'food.workerShare': [0.05, 1],
  'food.baseOutputPerWorker': [0.1, 100],
  'food.outputPerDevelopment': [0, 100],
  'food.farmYield': [0, 100],
  'food.forageYield': [0, 100],
  'food.waterYield': [0, 100],
  'food.landBonusPerDevelopment': [0, 10],
  'food.waterFactorMin': [0, 1],
  'food.capacityEfficiency': [0.05, 2],
  'food.minCapacity': [1, 1e5],
  'food.harvestVariation': [0, 0.9],
  'food.droughtChance': [0, 1],
  'food.droughtSeverity': [0, 1],
  'food.spoilage': [0, 1],
  'food.storageYearsBase': [0, 20],
  'food.storageYearsPerDevelopment': [0, 20],
  'population.baseDeathRate': [0, 0.5],
  'population.maxGrowthRate': [0, 0.2],
  'population.famineDeathRate': [0, 1],
  'population.overcrowdDeathRate': [0, 1],
  'population.livingDeathEffect': [0, 5],
  'population.livingDeclineRate': [0, 1],
  'population.livingRecoveryRate': [0, 1],
  'population.initialLivingConditions': [0, 1],
  'population.abandonBelow': [0, 1000],
  'development.maxLevel': [1, 20, true],
  'development.progressPerYear': [0, 1],
  'development.levelCostBase': [0.1, 100],
  'development.levelCostStep': [0, 100],
  'development.secureFed': [0, 1],
  'development.hardshipFed': [0, 1],
  'development.secureStockYears': [0, 10],
  'development.regressPerYear': [0, 1],
  'development.fullSpeedFillShare': [0.01, 1],
  'types.camp.maxPopulation': [1, 1e6, true],
  'types.village.minDevelopment': [0, 20, true],
  'types.village.minPopulation': [1, 1e6, true],
  'types.village.minSecureYears': [0, 1000, true],
  'types.village.maxPopulation': [1, 1e6, true],
  'types.town.minDevelopment': [0, 50, true],
  'types.town.minPopulation': [1, 1e6, true],
  'types.town.minSecureYears': [0, 1000, true],
  'types.town.maxPopulation': [1, 1e6, true],
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Merge `overrides` into `base`, rejecting unknown keys and wrong types. */
function merge(base, overrides, path, problems) {
  const result = {};
  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(base, key)) problems.push(`Unknown setting "${path}${key}".`);
  }
  for (const [key, value] of Object.entries(base)) {
    const here = `${path}${key}`;
    if (!Object.hasOwn(overrides, key) || overrides[key] === undefined) {
      result[key] = isPlainObject(value) ? merge(value, {}, `${here}.`, problems) : value;
    } else if (isPlainObject(value)) {
      if (isPlainObject(overrides[key])) result[key] = merge(value, overrides[key], `${here}.`, problems);
      else {
        problems.push(`"${here}" must be an object.`);
        result[key] = value;
      }
    } else if (typeof value === typeof overrides[key]) {
      result[key] = overrides[key];
    } else {
      problems.push(`"${here}" must be a ${typeof value}.`);
      result[key] = value;
    }
  }
  return result;
}

function deepFreeze(obj) {
  for (const value of Object.values(obj)) if (isPlainObject(value)) deepFreeze(value);
  return Object.freeze(obj);
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * Build a validated, frozen settlement config.
 * @param {object} [overrides] Partial config; anything omitted keeps its default.
 * @throws {SettlementConfigError} listing every problem found.
 */
export function createSettlementConfig(overrides = {}) {
  if (!isPlainObject(overrides)) throw new SettlementConfigError('Settlement config must be an object.');
  const problems = [];
  const config = merge(DEFAULT_SETTLEMENT_CONFIG, overrides, '', problems);

  for (const [path, [min, max, integer]] of Object.entries(RANGES)) {
    const value = getPath(config, path);
    if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`"${path}" must be a finite number.`);
    else if (value < min || value > max) problems.push(`"${path}" must be between ${min} and ${max} (got ${value}).`);
    else if (integer && !Number.isInteger(value)) problems.push(`"${path}" must be a whole number (got ${value}).`);
  }

  // Cross-field rules
  const p = config.placement;
  if (p.initialPopulationMin > p.initialPopulationMax) problems.push('"placement.initialPopulationMin" must not exceed "placement.initialPopulationMax".');
  if (p.minSettlements > p.maxSettlements) problems.push('"placement.minSettlements" must not exceed "placement.maxSettlements".');
  const weightSum = Object.values(p.weights).reduce((a, b) => a + b, 0);
  if (weightSum <= 0) problems.push('"placement.weights" must not all be zero.');
  const d = config.development;
  if (d.hardshipFed > d.secureFed) problems.push('"development.hardshipFed" must not exceed "development.secureFed".');
  const t = config.types;
  if (t.village.maxPopulation < t.village.minPopulation) problems.push('"types.village.maxPopulation" must be at least its minPopulation.');
  if (t.camp.maxPopulation < config.placement.initialPopulationMax) problems.push('"types.camp.maxPopulation" must be at least "placement.initialPopulationMax".');

  if (problems.length > 0) throw new SettlementConfigError(`Invalid settlement config:\n- ${problems.join('\n- ')}`);
  return deepFreeze(config);
}
