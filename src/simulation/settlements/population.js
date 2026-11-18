/**
 * Population model for one population group (pure functions, no I/O).
 *
 * Yearly step, with  K = capacity,  P = population,  fed = share of the
 * population's food need that was met (0-1):
 *
 *   logistic pressure   g      = maxGrowthRate * (1 - P / K)         (negative above capacity)
 *   baseline mortality  d0     = baseDeathRate * (1 + livingDeathEffect * (1 - living))
 *   births              B      = P * (d0 + max(g, 0)) * fed
 *   deaths              D      = P * (d0 + max(-g, 0) + famineDeathRate * (1 - fed)
 *                                      + overcrowdDeathRate * max(0, P / K - 1))
 *
 * With enough food growth is logistic (S-shaped), never exponential: it
 * slows to nothing at capacity. Hunger cuts births and adds deaths. Living
 * conditions move gradually toward a target (falling faster than recovering),
 * which is what makes recovery after a famine slow instead of instant.
 */

/** @returns a fresh population group. */
export function createPopulationGroup(total, livingConditions) {
  return {
    total,
    births: 0,
    deaths: 0,
    /** Net growth rate over the last year (fraction, e.g. 0.01 = 1%). */
    growthRate: 0,
    foodAvailable: 0,
    foodConsumption: 0,
    foodProduction: 0,
    capacity: 0,
    livingConditions,
    /** Share of the food need that was met last year (0-1). */
    fedRatio: 1,
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Compute one year of births and deaths without changing anything.
 * @returns {{ births: number, deaths: number }}
 */
export function computeBirthsAndDeaths(total, capacity, fed, livingConditions, cfg) {
  if (!(total > 0)) return { births: 0, deaths: 0 };
  const fill = total / Math.max(capacity, 1e-9);
  const growth = cfg.maxGrowthRate * (1 - fill);
  const baseDeath = cfg.baseDeathRate * (1 + cfg.livingDeathEffect * (1 - livingConditions));
  const births = total * (baseDeath + Math.max(growth, 0)) * clamp(fed, 0, 1);
  const deathRate =
    baseDeath +
    Math.max(-growth, 0) +
    cfg.famineDeathRate * (1 - clamp(fed, 0, 1)) +
    cfg.overcrowdDeathRate * Math.max(0, fill - 1);
  return { births, deaths: Math.min(total, total * deathRate) };
}

/**
 * Advance a group by one year (mutates `group`).
 * @param {object} group From createPopulationGroup.
 * @param {number} capacity Population the settlement can sustain.
 * @param {number} fed Share of food need met, 0-1.
 * @param {object} cfg `population` section of the settlement config.
 */
export function stepPopulation(group, capacity, fed, cfg) {
  const before = group.total;
  const { births, deaths } = computeBirthsAndDeaths(before, capacity, fed, group.livingConditions, cfg);
  group.births = births;
  group.deaths = deaths;
  group.total = Math.max(0, before + births - deaths);
  group.growthRate = before > 0 ? (group.total - before) / before : 0;
}

/**
 * Move living conditions toward the target implied by this year's situation.
 * Components: food (supply and storage), water access, shelter (development)
 * and crowding. Falls quickly, recovers slowly.
 * @returns {number} the new living conditions (0-1)
 */
export function updateLivingConditions(group, { fed, stockRatio, waterAccess, development, maxDevelopment, fill }, cfg) {
  const food = 0.7 * clamp(fed, 0, 1) + 0.3 * clamp(stockRatio, 0, 1);
  const shelter = 0.3 + 0.7 * clamp(development / maxDevelopment, 0, 1);
  const crowding = clamp(1 - Math.max(0, fill - 0.8) * 2.5, 0, 1);
  const target = 0.45 * food + 0.2 * clamp(waterAccess, 0, 1) + 0.2 * shelter + 0.15 * crowding;
  const rate = target < group.livingConditions ? cfg.livingDeclineRate : cfg.livingRecoveryRate;
  group.livingConditions = clamp(group.livingConditions + (target - group.livingConditions) * rate, 0, 1);
  return group.livingConditions;
}
