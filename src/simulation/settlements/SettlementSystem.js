/**
 * Owns every settlement of a world and advances them one simulated year at a
 * time. No Phaser, no DOM, no event bus: the Simulation drives it from the
 * clock and publishes the results.
 *
 * Yearly order for each active settlement
 *   1. capacity and harvest        (what can the land feed; how was the weather)
 *   2. food                        (eat, store, spoil, shortage or surplus)
 *   3. population                  (births, deaths, growth)
 *   4. living conditions           (recover slowly, decline quickly)
 *   5. development and type        (progress, village promotion, regression)
 *   6. abandonment check
 *
 * Deterministic: the only "randomness" is the harvest factor, a hash of
 * (world seed, settlement id, year), so results do not depend on how ticks
 * were split, on frame rate, or on other settlements.
 */
import { createRng } from '../../utils/Random.js';
import { hash2D } from '../../utils/Noise.js';
import { createSettlementConfig } from '../../config/settlementConfig.js';
import { stageSeed } from '../../world/generation/GenerationParams.js';
import { resolveSettlementType, stepDevelopment, typeMaxPopulation } from './development.js';
import { computeCapacity, computeProduction, resolveFoodYear, storageLimit } from './food.js';
import { stepPopulation, updateLivingConditions } from './population.js';
import { Settlement } from './Settlement.js';
import { SettlementNamer } from './SettlementNames.js';
import { placeInitialSettlements } from './SettlementPlacer.js';
import { SiteAnalyzer } from './SiteAnalysis.js';

export class SettlementSystem {
  /**
   * @param {{ world: import('../../world/World.js').World, seedValue: number, config?: object }} options
   *   `config` may be a partial config; it is validated (SettlementConfigError on problems).
   */
  constructor({ world, seedValue, config = {} }) {
    if (!world || !world.resources) throw new Error('SettlementSystem needs a generated world.');
    this.world = world;
    this.seedValue = seedValue >>> 0;
    this.config = createSettlementConfig(config);
    /** @type {Settlement[]} Index = id - 1. Abandoned settlements stay in the list. */
    this.list = [];
    this.totalPopulation = 0;
    this.activeCount = 0;
    /** Wall-clock cost of the last advanceYear() call, in milliseconds (for the debug panel). */
    this.lastStepMs = 0;
    this.lastPlacement = null;
    this._harvestSeed = (this.seedValue ^ 0x5e77) >>> 0;
    this._droughtSeed = (this.seedValue ^ 0xd2047) >>> 0;
  }

  getById(id) {
    const s = this.list[id - 1];
    return s && s.id === id ? s : null;
  }

  /**
   * Place the starting settlements on the world. Replaces any existing ones.
   * @param {number} [year] Founding year.
   * @returns {Settlement[]}
   */
  generateInitialSettlements(year = 1) {
    const cfg = this.config;
    const analyzer = new SiteAnalyzer(this.world, cfg.placement.siteRadius);
    const placement = placeInitialSettlements(this.world, { seedValue: this.seedValue, config: cfg, analyzer });
    this.lastPlacement = placement;
    if (placement.sites.length < cfg.placement.minSettlements) {
      console.warn(
        `[Settlements] Only ${placement.sites.length} suitable site(s) found (wanted at least ${cfg.placement.minSettlements}); ` +
          'the world has little fertile land near fresh water.',
      );
    }

    const rng = createRng(stageSeed(this.seedValue, 'settlements'));
    const namer = new SettlementNamer(rng);
    this.list = [];
    for (const site of placement.sites) {
      const profile = analyzer.profileAt(site.x, site.y);
      const id = this.list.length + 1;
      const settlement = new Settlement({
        id,
        name: namer.next(),
        x: site.x,
        y: site.y,
        foundedYear: year,
        site: profile,
        population: 0,
        livingConditions: cfg.population.initialLivingConditions,
        foodStorage: 0,
      });
      const capacity = computeCapacity(profile, 0, typeMaxPopulation('camp', cfg.types), cfg.food);
      const wanted = rng.int(cfg.placement.initialPopulationMin, cfg.placement.initialPopulationMax);
      const pop = Math.max(cfg.population.abandonBelow + 1, Math.min(wanted, Math.floor(capacity * 0.8)));
      settlement.population.total = pop;
      settlement.population.capacity = capacity;
      settlement.foodStorage = pop * cfg.food.foodPerPerson * cfg.placement.initialFoodYears;
      settlement.storageLimit = storageLimit(capacity, 0, cfg.food);
      // Show sensible first-year figures before the first yearly update runs.
      const grp = settlement.population;
      grp.foodProduction = computeProduction(pop, profile, 0, 1, cfg.food);
      grp.foodConsumption = pop * cfg.food.foodPerPerson;
      grp.foodAvailable = settlement.foodStorage + grp.foodProduction;
      settlement.pushHistory(pop);
      this.list.push(settlement);
    }
    this._recount();
    return this.list;
  }

  /**
   * Advance every active settlement by one simulated year.
   * @param {number} year The year that is now being simulated (used for harvests).
   * @returns {Array<{kind: string, settlement: Settlement, from?: string, to?: string, year: number}>}
   *   type changes and abandonments that happened.
   */
  advanceYear(year) {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const events = [];
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      if (s.active) this._stepSettlement(s, year, events);
    }
    this._recount();
    this.lastStepMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    return events;
  }

  _recount() {
    let total = 0;
    let active = 0;
    for (const s of this.list) {
      if (!s.active) continue;
      total += s.population.total;
      active++;
    }
    this.totalPopulation = total;
    this.activeCount = active;
  }

  /**
   * Harvest multiplier for one settlement and year, reproducible from the seed:
   * normally 1 +/- harvestVariation, and in a drought year (droughtChance) a
   * large share of the harvest is lost.
   */
  harvestFactor(settlementId, year) {
    const food = this.config.food;
    if (hash2D(this._droughtSeed, settlementId, year) < food.droughtChance) {
      return 1 - food.droughtSeverity * (0.7 + 0.3 * hash2D(this._harvestSeed, year, settlementId));
    }
    return 1 + (hash2D(this._harvestSeed, settlementId, year) - 0.5) * 2 * food.harvestVariation;
  }

  _stepSettlement(s, year, events) {
    const cfg = this.config;
    const pop = s.population;

    // 1. Capacity and harvest
    const capacity = computeCapacity(s.site, s.developmentLevel, typeMaxPopulation(s.type, cfg.types), cfg.food);
    const production = computeProduction(pop.total, s.site, s.developmentLevel, this.harvestFactor(s.id, year), cfg.food);

    // 2. Food: eat, spoil and store
    const need = pop.total * cfg.food.foodPerPerson;
    const limit = storageLimit(capacity, s.developmentLevel, cfg.food);
    const food = resolveFoodYear({ stock: s.foodStorage, production, need, limit, spoilage: cfg.food.spoilage });
    s.foodStorage = food.newStock;
    s.storageLimit = limit;
    s.foodShortage = Math.max(0, food.shortage);
    s.foodSurplus = food.lost;
    pop.capacity = capacity;
    pop.foodAvailable = food.available;
    pop.foodConsumption = need;
    pop.foodProduction = production;
    pop.fedRatio = food.fed;

    // 3. Population
    const fillBefore = pop.total / capacity;
    stepPopulation(pop, capacity, food.fed, cfg.population);

    // 4. Living conditions
    const stockYears = need > 0 ? s.foodStorage / need : 1;
    updateLivingConditions(
      pop,
      {
        fed: food.fed,
        stockRatio: Math.min(1, stockYears / Math.max(1e-9, cfg.development.secureStockYears * 2)),
        waterAccess: s.site.waterAccess,
        development: s.developmentLevel,
        maxDevelopment: cfg.development.maxLevel,
        fill: fillBefore,
      },
      cfg.population,
    );

    // 5. Development and type
    stepDevelopment(s, { fed: food.fed, stockYears, fill: fillBefore }, cfg.development);
    const from = s.type;
    const change = resolveSettlementType(s, cfg.types);
    if (change) events.push({ kind: change, settlement: s, from, to: s.type, year });

    // 6. Abandonment
    if (pop.total < cfg.population.abandonBelow) {
      s.active = false;
      s.abandonedYear = year;
      pop.total = 0;
      events.push({ kind: 'abandoned', settlement: s, year });
    }
    s.pushHistory(pop.total);
  }
}
