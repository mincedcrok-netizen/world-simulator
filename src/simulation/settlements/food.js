/**
 * Food economy of one settlement (pure functions).
 *
 * Production is limited by whichever is smaller: the labour of its workers
 * or what the surrounding land and water can yield. Both improve with
 * development. Capacity is the population the land can feed. Storage holds
 * a limited reserve that slowly spoils; the shortage/surplus of a year is
 * whatever the stores and harvest could not cover / could not hold.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Yearly food the surrounding land and water can yield at the settlement's development level. */
export function landFoodYield(site, developmentLevel, foodCfg) {
  const bonus = 1 + foodCfg.landBonusPerDevelopment * developmentLevel;
  const waterFactor = foodCfg.waterFactorMin + (1 - foodCfg.waterFactorMin) * clamp(site.waterAccess, 0, 1);
  const raw = site.farmland * foodCfg.farmYield + site.forage * foodCfg.forageYield + site.freshwaterTiles * foodCfg.waterYield;
  return raw * bonus * waterFactor;
}

/** Population the settlement can sustain (bounded by its type's maximum). */
export function computeCapacity(site, developmentLevel, typeMaxPopulation, foodCfg) {
  const fromLand = (landFoodYield(site, developmentLevel, foodCfg) / foodCfg.foodPerPerson) * foodCfg.capacityEfficiency;
  return Math.min(typeMaxPopulation, Math.max(foodCfg.minCapacity, fromLand));
}

/**
 * Food produced in a year.
 * @param {number} harvestFactor Weather/harvest multiplier around 1.
 */
export function computeProduction(population, site, developmentLevel, harvestFactor, foodCfg) {
  const workers = population * foodCfg.workerShare;
  const labour = workers * (foodCfg.baseOutputPerWorker + foodCfg.outputPerDevelopment * developmentLevel);
  return Math.min(labour, landFoodYield(site, developmentLevel, foodCfg)) * harvestFactor;
}

/** Largest food store the settlement can keep. */
export function storageLimit(capacity, developmentLevel, foodCfg) {
  return capacity * foodCfg.foodPerPerson * (foodCfg.storageYearsBase + foodCfg.storageYearsPerDevelopment * developmentLevel);
}

/**
 * Resolve one year of eating and storing.
 * @returns {{ available: number, eaten: number, fed: number, shortage: number, newStock: number, lost: number }}
 *   available = stock + production; fed = share of need met (1 = no shortage);
 *   lost = food spoiled or beyond storage capacity (the year's surplus that could not be kept).
 */
export function resolveFoodYear({ stock, production, need, limit, spoilage }) {
  const available = stock + production;
  const eaten = Math.min(need, available);
  const fed = need > 0 ? eaten / need : 1;
  const remaining = available - eaten;
  const afterSpoilage = remaining * (1 - spoilage);
  const newStock = Math.min(afterSpoilage, limit);
  return { available, eaten, fed, shortage: need - eaten, newStock, lost: remaining - newStock };
}
