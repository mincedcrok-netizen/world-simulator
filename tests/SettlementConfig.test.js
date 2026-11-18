import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTLEMENT_CONFIG, SettlementConfigError, createSettlementConfig } from '../src/config/settlementConfig.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { SettlementSystem } from '../src/simulation/settlements/SettlementSystem.js';
import { World } from '../src/world/World.js';

test('the default config is valid and frozen', () => {
  const cfg = createSettlementConfig();
  assert.deepEqual(cfg, DEFAULT_SETTLEMENT_CONFIG);
  assert.ok(Object.isFrozen(cfg) && Object.isFrozen(cfg.food) && Object.isFrozen(cfg.types.village));
  assert.throws(() => { 'use strict'; cfg.food.farmYield = 99; }, TypeError);
});

test('overrides are merged into the defaults', () => {
  const cfg = createSettlementConfig({ food: { farmYield: 4 }, placement: { weights: { farmland: 0.7 } } });
  assert.equal(cfg.food.farmYield, 4);
  assert.equal(cfg.food.forageYield, DEFAULT_SETTLEMENT_CONFIG.food.forageYield);
  assert.equal(cfg.placement.weights.farmland, 0.7);
  assert.equal(cfg.placement.weights.water, DEFAULT_SETTLEMENT_CONFIG.placement.weights.water);
});

test('invalid settlement configs are rejected with every problem listed', () => {
  const bad = [
    [{ food: { nonsense: 1 } }, /Unknown setting "food.nonsense"/],
    [{ bogus: {} }, /Unknown setting "bogus"/],
    [{ food: { farmYield: 'lots' } }, /"food.farmYield" must be a number/],
    [{ food: 5 }, /"food" must be an object/],
    [{ food: { farmYield: -1 } }, /"food.farmYield" must be between/],
    [{ food: { foodPerPerson: 0 } }, /"food.foodPerPerson" must be between/],
    [{ population: { maxGrowthRate: 5 } }, /"population.maxGrowthRate" must be between/],
    [{ population: { baseDeathRate: NaN } }, /"population.baseDeathRate" must be a finite number/],
    [{ placement: { minDistance: 2.5 } }, /"placement.minDistance" must be a whole number/],
    [{ placement: { initialPopulationMin: 90, initialPopulationMax: 30 } }, /initialPopulationMin/],
    [{ placement: { minSettlements: 50, maxSettlements: 10 } }, /minSettlements/],
    [{ placement: { weights: { farmland: 0, water: 0, forage: 0, resources: 0, access: 0 } } }, /weights/],
    [{ development: { hardshipFed: 0.99, secureFed: 0.5 } }, /hardshipFed/],
    [{ types: { camp: { maxPopulation: 5 } } }, /camp.maxPopulation/],
  ];
  for (const [overrides, pattern] of bad) {
    assert.throws(() => createSettlementConfig(overrides), (error) => error instanceof SettlementConfigError && pattern.test(error.message), JSON.stringify(overrides));
  }
  for (const nonObject of [null, 5, 'x', []]) assert.throws(() => createSettlementConfig(nonObject), SettlementConfigError);

  // Several problems are reported together.
  try {
    createSettlementConfig({ food: { farmYield: -1, nonsense: 1 }, population: { maxGrowthRate: 5 } });
    assert.fail('should have thrown');
  } catch (error) {
    assert.match(error.message, /farmYield/);
    assert.match(error.message, /nonsense/);
    assert.match(error.message, /maxGrowthRate/);
  }
});

test('a bad config fails when the Simulation or SettlementSystem is created, not mid-game', () => {
  assert.throws(() => new Simulation({ settlementConfig: { food: { farmYield: -5 } } }), SettlementConfigError);
  const world = new World({ width: 4, height: 4, tiles: new Uint8Array(16) });
  assert.throws(() => new SettlementSystem({ world, seedValue: 1 }), /generated world/);
});
