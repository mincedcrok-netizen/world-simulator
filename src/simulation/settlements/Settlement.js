import { createPopulationGroup } from './population.js';
import { SETTLEMENT_TYPE } from './development.js';

/** Number of past yearly population values kept for the inspection chart. */
export const HISTORY_LENGTH = 40;

/**
 * One settlement: plain data mutated in place by the SettlementSystem (so a
 * yearly update allocates nothing). UI code reads it and must not write to it.
 *
 * `site` is the profile of the surrounding land, computed once when the
 * settlement is founded and never recalculated.
 */
export class Settlement {
  /**
   * @param {{ id: number, name: string, x: number, y: number, foundedYear: number,
   *           site: object, population: number, livingConditions: number, foodStorage: number }} init
   */
  constructor({ id, name, x, y, foundedYear, site, population, livingConditions, foodStorage }) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.type = SETTLEMENT_TYPE.CAMP;
    this.foundedYear = foundedYear;
    this.site = site;

    /** The population group of this settlement (births, deaths, growth, food, capacity, living conditions). */
    this.population = createPopulationGroup(population, livingConditions);

    this.foodStorage = foodStorage;
    this.storageLimit = 0;
    /** Food that spoiled or did not fit into storage last year. */
    this.foodSurplus = 0;
    /** Food need that could not be met last year. */
    this.foodShortage = 0;

    this.developmentLevel = 0;
    /** Progress toward the next level (same unit as levelCost). */
    this.developmentProgress = 0;
    this.secureYears = 0;
    this.hardshipYears = 0;

    this.active = true;
    this.abandonedYear = null;

    this.history = new Float32Array(HISTORY_LENGTH);
    this.historyCount = 0;
  }

  // Convenience accessors for the numbers the UI shows.
  get populationTotal() { return this.population.total; }
  get foodProduction() { return this.population.foodProduction; }
  get foodConsumption() { return this.population.foodConsumption; }
  get capacity() { return this.population.capacity; }
  get growthRate() { return this.population.growthRate; }

  /** Population values from oldest to newest (up to HISTORY_LENGTH). */
  getHistory() {
    const count = Math.min(this.historyCount, HISTORY_LENGTH);
    const out = new Array(count);
    const start = this.historyCount - count;
    for (let i = 0; i < count; i++) out[i] = this.history[(start + i) % HISTORY_LENGTH];
    return out;
  }

  pushHistory(value) {
    this.history[this.historyCount % HISTORY_LENGTH] = value;
    this.historyCount++;
  }

  toJSON() {
    const { history, historyCount, ...rest } = this;
    return { ...rest, history: this.getHistory() };
  }
}
