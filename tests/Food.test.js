import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTLEMENT_CONFIG as DEFAULTS } from '../src/config/settlementConfig.js';
import { computeCapacity, computeProduction, landFoodYield, resolveFoodYear, storageLimit } from '../src/simulation/settlements/food.js';

const food = DEFAULTS.food;
const site = (overrides = {}) => ({
  farmland: 30, forage: 8, freshwaterTiles: 6, waterAccess: 1, resourceScore: 0.5, wood: 5, stone: 5, access: 1, ...overrides,
});

test('land food yield grows with farmland, forage, water and development', () => {
  const base = landFoodYield(site(), 0, food);
  assert.ok(landFoodYield(site({ farmland: 40 }), 0, food) > base);
  assert.ok(landFoodYield(site({ forage: 16 }), 0, food) > base);
  assert.ok(landFoodYield(site({ freshwaterTiles: 12 }), 0, food) > base);
  assert.ok(landFoodYield(site(), 3, food) > base);
  assert.ok(landFoodYield(site({ waterAccess: 0.2 }), 0, food) < base, 'poor water access lowers the yield');
  assert.equal(landFoodYield(site({ farmland: 0, forage: 0, freshwaterTiles: 0 }), 0, food), 0);
});

test('population capacity follows the land, with a floor and a per-type ceiling', () => {
  const rich = computeCapacity(site(), 0, 10000, food);
  const poor = computeCapacity(site({ farmland: 5, forage: 1, freshwaterTiles: 1 }), 0, 10000, food);
  assert.ok(rich > poor);
  assert.equal(computeCapacity(site({ farmland: 0, forage: 0, freshwaterTiles: 0 }), 0, 10000, food), food.minCapacity);
  assert.equal(computeCapacity(site({ farmland: 500 }), 0, 90, food), 90, 'bounded by the type maximum');
  assert.ok(computeCapacity(site(), 4, 10000, food) > rich, 'development raises capacity');
});

test('production is labour-limited for small populations and land-limited for large ones', () => {
  const s = site();
  const small = computeProduction(10, s, 0, 1, food);
  assert.ok(Math.abs(small - 10 * food.workerShare * food.baseOutputPerWorker) < 1e-9);
  const double = computeProduction(20, s, 0, 1, food);
  assert.ok(Math.abs(double - 2 * small) < 1e-9, 'proportional to population while labour-limited');
  const huge = computeProduction(100000, s, 0, 1, food);
  assert.ok(Math.abs(huge - landFoodYield(s, 0, food)) < 1e-9, 'capped by the land');
  assert.ok(computeProduction(10, s, 3, 1, food) > small, 'development improves output per worker');
  assert.ok(Math.abs(computeProduction(10, s, 0, 0.5, food) - small / 2) < 1e-9, 'harvest factor scales production');
});

test('storage limit scales with capacity and development', () => {
  assert.ok(storageLimit(200, 0, food) > storageLimit(100, 0, food));
  assert.ok(storageLimit(100, 4, food) > storageLimit(100, 0, food));
  assert.ok(Math.abs(storageLimit(100, 0, food) - 100 * food.storageYearsBase) < 1e-9);
});

test('a surplus is stored, spoils a little, and never exceeds the storage limit', () => {
  const r = resolveFoodYear({ stock: 10, production: 150, need: 100, limit: 500, spoilage: 0.1 });
  assert.equal(r.fed, 1);
  assert.equal(r.shortage, 0);
  assert.ok(Math.abs(r.newStock - 60 * 0.9) < 1e-9);
  assert.ok(r.lost > 0, 'spoilage counts as loss');

  const capped = resolveFoodYear({ stock: 100, production: 500, need: 100, limit: 120, spoilage: 0.1 });
  assert.equal(capped.newStock, 120, 'storage limit enforced');
  assert.ok(Math.abs(capped.lost - (500 + 100 - 100 - 120)) < 1e-9, 'surplus beyond the limit is lost');
});

test('stored food covers a bad harvest before anyone goes hungry', () => {
  const r = resolveFoodYear({ stock: 60, production: 70, need: 100, limit: 200, spoilage: 0.1 });
  assert.equal(r.fed, 1);
  assert.equal(r.shortage, 0);
  assert.ok(r.newStock < 60, 'the store shrank');
});

test('a shortage is reported when stores and harvest are not enough', () => {
  const r = resolveFoodYear({ stock: 10, production: 50, need: 100, limit: 200, spoilage: 0.1 });
  assert.ok(Math.abs(r.fed - 0.6) < 1e-9);
  assert.ok(Math.abs(r.shortage - 40) < 1e-9);
  assert.equal(r.newStock, 0);
  assert.equal(r.eaten, 60);
});

test('zero need is a trivial year; spoilage can be turned off', () => {
  const none = resolveFoodYear({ stock: 5, production: 5, need: 0, limit: 100, spoilage: 0 });
  assert.equal(none.fed, 1);
  assert.equal(none.newStock, 10);
});
