/**
 * Settlement development and type (camp -> village -> town).
 *
 * Development level (0..maxLevel) grows while the settlement is food-secure
 * and reasonably full, faster when stone and wood are nearby; it regresses
 * during prolonged hardship. The type follows from level, population and
 * years of security, with hysteresis so a settlement does not flicker
 * between types.
 */

export const SETTLEMENT_TYPE = Object.freeze({ CAMP: 'camp', VILLAGE: 'village', TOWN: 'town' });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Progress needed to leave `level`. */
export function levelCost(level, devCfg) {
  return devCfg.levelCostBase + devCfg.levelCostStep * level;
}

/**
 * Advance development by one year (mutates `settlement`).
 * @param {{ fed: number, stockYears: number, fill: number }} year
 */
export function stepDevelopment(settlement, { fed, stockYears, fill }, devCfg) {
  const secure = fed >= devCfg.secureFed && stockYears >= devCfg.secureStockYears;
  const hardship = fed < devCfg.hardshipFed;

  settlement.secureYears = secure ? settlement.secureYears + 1 : 0;
  settlement.hardshipYears = hardship ? settlement.hardshipYears + 1 : 0;

  if (secure) {
    if (settlement.developmentLevel < devCfg.maxLevel) {
      const speed = clamp(fill / devCfg.fullSpeedFillShare, 0, 1);
      const resources = 0.6 + 0.4 * settlement.site.resourceScore;
      settlement.developmentProgress += devCfg.progressPerYear * speed * resources;
      while (
        settlement.developmentLevel < devCfg.maxLevel &&
        settlement.developmentProgress >= levelCost(settlement.developmentLevel, devCfg)
      ) {
        settlement.developmentProgress -= levelCost(settlement.developmentLevel, devCfg);
        settlement.developmentLevel++;
      }
      if (settlement.developmentLevel >= devCfg.maxLevel) settlement.developmentProgress = 0;
    }
  } else if (hardship) {
    settlement.developmentProgress -= devCfg.regressPerYear;
    if (settlement.developmentProgress < 0) {
      if (settlement.developmentLevel > 0) {
        settlement.developmentLevel--;
        settlement.developmentProgress = levelCost(settlement.developmentLevel, devCfg) * 0.5;
      } else {
        settlement.developmentProgress = 0;
      }
    }
  }
}

/**
 * Re-evaluate the settlement type.
 * @returns {'promoted'|'demoted'|null} what changed, if anything
 */
export function resolveSettlementType(settlement, typesCfg) {
  const { village, town } = typesCfg;
  const pop = settlement.population.total;

  if (settlement.type === SETTLEMENT_TYPE.CAMP) {
    const ready =
      settlement.developmentLevel >= village.minDevelopment &&
      pop >= village.minPopulation &&
      settlement.secureYears >= village.minSecureYears &&
      settlement.site.resourceScore > 0; // needs some wood or stone to build with
    if (ready) {
      settlement.type = SETTLEMENT_TYPE.VILLAGE;
      return 'promoted';
    }
    return null;
  }

  if (settlement.type === SETTLEMENT_TYPE.VILLAGE) {
    if (town.attainable !== false) {
      const ready =
        settlement.developmentLevel >= town.minDevelopment &&
        pop >= town.minPopulation &&
        settlement.secureYears >= town.minSecureYears;
      if (ready) {
        settlement.type = SETTLEMENT_TYPE.TOWN;
        return 'promoted';
      }
    }
    if (settlement.developmentLevel < village.minDevelopment || pop < village.minPopulation * 0.5) {
      settlement.type = SETTLEMENT_TYPE.CAMP;
      return 'demoted';
    }
    return null;
  }

  // Town: falls back to village when it shrinks well below its threshold.
  if (pop < town.minPopulation * 0.6 || settlement.developmentLevel < town.minDevelopment - 1) {
    settlement.type = SETTLEMENT_TYPE.VILLAGE;
    return 'demoted';
  }
  return null;
}

/** Population ceiling of a settlement type. */
export function typeMaxPopulation(type, typesCfg) {
  return typesCfg[type].maxPopulation;
}
