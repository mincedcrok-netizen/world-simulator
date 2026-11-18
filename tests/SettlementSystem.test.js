import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettlementConfig } from '../src/config/settlementConfig.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { HISTORY_LENGTH } from '../src/simulation/settlements/Settlement.js';
import { SettlementSystem } from '../src/simulation/settlements/SettlementSystem.js';
import { EventBus } from '../src/systems/EventBus.js';
import { EVENTS } from '../src/systems/Events.js';
import { createSyntheticWorld, gen } from './helpers.js';

console.info = () => {}; // the Simulation logs on initialize

/** Settlements on a controlled flat world. */
function synthetic(config = {}, worldOptions = {}) {
  const world = createSyntheticWorld(worldOptions);
  const system = new SettlementSystem({ world, seedValue: 11, config });
  system.generateInitialSettlements();
  return system;
}

function run(system, years, from = 2) {
  const events = [];
  for (let y = from; y < from + years; y++) events.push(...system.advanceYear(y));
  return events;
}

/** Simulation with a fake clock and timer (instant, deterministic). */
function harness({ seed = 'sim', size = 'small', secondsPerYear = 1, settlementConfig = {} } = {}) {
  let now = 1000;
  let timer = null;
  const bus = new EventBus();
  const events = [];
  for (const name of Object.values(EVENTS)) bus.on(name, (payload) => events.push([name, payload]));
  const sim = new Simulation({
    bus, secondsPerYear, settlementConfig,
    timeSource: () => now,
    scheduler: { setInterval: (fn) => { timer = fn; return 1; }, clearInterval: () => { timer = null; } },
  });
  sim.initialize({ name: 'T', seed, size, landmass: 'balanced', water: 'normal', variety: 'normal' });
  sim.start();
  return {
    sim, bus, events,
    /** Advance real time in ticks of `step` ms. */
    advance(ms, step = 50) {
      for (let left = ms; left > 0; left -= step) { now += Math.min(step, left); sim.tick(now); }
    },
    skip(ms) { now += ms; },
    tickAfter(ms) { now += ms; sim.tick(now); },
    count: (name) => events.filter(([n]) => n === name).length,
    get timer() { return timer; },
  };
}

const state = (sim) => sim.settlements.list.map((s) => [s.id, s.type, s.developmentLevel, s.population.total, s.foodStorage, s.active]);

test('food consumption scales with population', () => {
  const system = synthetic();
  const [a, b] = system.list;
  a.population.total = 20;
  b.population.total = 80;
  system.advanceYear(2);
  const foodPerPerson = system.config.food.foodPerPerson;
  assert.ok(Math.abs(a.population.foodConsumption - 20 * foodPerPerson) < 1e-9);
  assert.ok(Math.abs(b.population.foodConsumption - 80 * foodPerPerson) < 1e-9);
  assert.ok(Math.abs(b.population.foodConsumption / a.population.foodConsumption - 4) < 1e-9);
});

test('settlements grow naturally and stay within capacity', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  const start = system.totalPopulation;
  const peaks = new Map();
  for (let y = 2; y < 120; y++) {
    system.advanceYear(y);
    for (const s of system.list) peaks.set(s.id, Math.max(peaks.get(s.id) ?? 0, s.population.total));
  }
  assert.ok(system.totalPopulation > start * 1.5, 'population should have grown');
  for (const s of system.list) {
    assert.ok(peaks.get(s.id) <= s.population.capacity * 1.02 + 1, `${s.name} overshot its capacity`);
    assert.ok(s.population.total > 0);
  }
});

test('good conditions raise development and promote a camp to a village', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  const events = run(system, 200);
  const promotions = events.filter((e) => e.kind === 'promoted');
  assert.ok(promotions.length >= 1, 'no camp became a village');
  for (const e of promotions) {
    assert.equal(e.from, 'camp');
    assert.equal(e.to, 'village');
    assert.equal(e.settlement.type, 'village');
  }
  const village = promotions[0].settlement;
  assert.ok(village.developmentLevel >= system.config.types.village.minDevelopment);
  assert.ok(village.population.total >= system.config.types.village.minPopulation);
  assert.ok(village.population.capacity > system.config.types.camp.maxPopulation * 0.99, 'a village can hold more people than a camp');
});

test('development improves food production', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  const s = system.list[0];
  s.population.total = 50;
  system.advanceYear(2);
  const productionLow = s.population.foodProduction;
  s.developmentLevel = 4;
  system.advanceYear(3);
  assert.ok(s.population.foodProduction > productionLow * 1.2, `${productionLow} -> ${s.population.foodProduction}`);
});

test('without wood or stone nearby a settlement cannot become a village', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } }, { wood: 0, stone: 0 });
  const events = run(system, 250);
  assert.equal(events.filter((e) => e.kind === 'promoted').length, 0);
  for (const s of system.list) assert.equal(s.type, 'camp');
  assert.ok(system.list.some((s) => s.developmentLevel >= 2), 'development itself should still progress');
});

test('towns are future-ready but not attainable in this phase', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  run(system, 600);
  for (const s of system.list) assert.notEqual(s.type, 'town');
  assert.equal(system.config.types.town.attainable, false);
});

test('a shortage drains storage, then hurts the population, living conditions and development', () => {
  // Every year is a severe drought on poor land.
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 1, droughtSeverity: 0.8 } }, { fertile: 60 });
  const s = system.list[0];
  s.population.total = 80;
  s.developmentLevel = 3;
  s.developmentProgress = 0.2;
  s.foodStorage = s.storageLimit;
  const livingBefore = s.population.livingConditions;
  let firstShortage = null;
  const series = [];
  for (let y = 2; y < 40 && s.active; y++) {
    system.advanceYear(y);
    series.push(s.population.total);
    if (firstShortage === null && s.population.fedRatio < 1) {
      firstShortage = y;
      assert.equal(s.foodStorage, 0, 'a shortage means the stores were used up first');
      assert.ok(s.foodShortage > 0);
    }
  }
  assert.ok(firstShortage !== null, 'there should have been a shortage');
  assert.ok(series.at(-1) < 80 * 0.5, `population only fell to ${series.at(-1)}`);
  assert.ok(s.population.livingConditions < livingBefore);
  assert.ok(s.developmentLevel < 3, 'development should regress during prolonged hardship');
  assert.ok(s.foodShortage > 0 || !s.active);
});

test('conditions deteriorating makes a developed village decline back to a camp', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  run(system, 220);
  const village = system.list.find((s) => s.type === 'village');
  assert.ok(village, 'need a village to start from');
  // The land fails (e.g. soil exhausted): nothing grows around it any more.
  Object.assign(village.site, { farmland: 0, forage: 0, freshwaterTiles: 0 });
  const events = run(system, 150, 222);
  const demotion = events.find((e) => e.kind === 'demoted' && e.settlement === village);
  assert.ok(demotion || !village.active, 'the village should have been demoted (or abandoned)');
  assert.ok(village.developmentLevel < 5);
});

test('a settlement whose people die out is abandoned and then ignored', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  const s = system.list[0];
  Object.assign(s.site, { farmland: 0, forage: 0, freshwaterTiles: 0 });
  s.population.total = 6;
  s.foodStorage = 0;
  const events = run(system, 60);
  assert.ok(events.some((e) => e.kind === 'abandoned' && e.settlement === s), 'abandonment event');
  assert.equal(s.active, false);
  assert.equal(s.population.total, 0);
  assert.ok(s.abandonedYear >= 2);
  const before = JSON.stringify(s.toJSON());
  run(system, 5, 100);
  assert.equal(JSON.stringify(s.toJSON()), before, 'an abandoned settlement must not change');
  assert.equal(system.activeCount, system.list.length - 1);
});

test('after a shortage the population recovers gradually', () => {
  const system = synthetic({ food: { harvestVariation: 0, droughtChance: 0 } });
  const s = system.list[0];
  run(system, 80);
  const healthy = s.population.total;
  // A famine hits: the stores are gone and the people are weakened.
  s.foodStorage = 0;
  s.population.total = healthy * 0.5;
  s.population.livingConditions = 0.25;
  const series = [];
  for (let y = 82; y < 150; y++) {
    system.advanceYear(y);
    series.push([s.population.total, s.population.livingConditions]);
  }
  assert.ok(series[0][0] < healthy * 0.65, 'no instant recovery');
  assert.ok(series[0][1] < 0.6, 'living conditions recover slowly');
  assert.ok(series.at(-1)[0] > healthy * 0.9, 'but the settlement does recover in time');
  for (let i = 1; i < series.length; i++) assert.ok(series[i][0] >= series[i - 1][0] - 0.05, 'recovery should be steady');
  assert.ok(series.at(-1)[1] > 0.75);
});

test('harvests are reproducible, varied and sometimes fail', () => {
  const system = synthetic();
  assert.equal(system.harvestFactor(3, 50), system.harvestFactor(3, 50));
  const factors = [];
  for (let year = 1; year <= 2000; year++) factors.push(system.harvestFactor(1, year));
  assert.ok(new Set(factors.map((f) => f.toFixed(4))).size > 1500, 'harvests should vary year to year');
  const v = system.config.food;
  const droughts = factors.filter((f) => f < 1 - v.harvestVariation - 1e-9).length;
  assert.ok(droughts > 2000 * v.droughtChance * 0.5 && droughts < 2000 * v.droughtChance * 1.6, `${droughts} droughts in 2000 years`);
  for (const f of factors) assert.ok(f > 0 && f < 1 + v.harvestVariation + 1e-9);
  assert.notEqual(system.harvestFactor(1, 50), system.harvestFactor(2, 50), 'settlements have independent weather');
});

test('multiple settlements develop simultaneously and independently', () => {
  const baselineWorld = gen({ seed: 'alpha', size: 'medium' });
  const make = () => {
    const sys = new SettlementSystem({ world: baselineWorld, seedValue: baselineWorld.seedValue });
    sys.generateInitialSettlements();
    return sys;
  };
  const a = make();
  const b = make();
  // Cripple one settlement in b only.
  Object.assign(b.list[3].site, { farmland: 0, forage: 0, freshwaterTiles: 0 });
  run(a, 100);
  run(b, 100);
  assert.ok(a.list.length >= 10);
  const changed = a.list.filter((s) => Math.abs(s.population.total - s.history[0]) > 1 || s.developmentLevel > 0).length;
  assert.ok(changed >= a.list.length * 0.9, 'nearly all settlements should have developed');
  assert.ok(new Set(a.list.map((s) => Math.round(s.population.total))).size > a.list.length / 2, 'settlements should differ from each other');
  for (let i = 0; i < a.list.length; i++) {
    if (i === 3) continue;
    assert.equal(a.list[i].population.total, b.list[i].population.total, `settlement ${i} was affected by another settlement`);
  }
  assert.notEqual(a.list[3].population.total, b.list[3].population.total);
});

test('settlement history keeps the most recent years', () => {
  const system = synthetic();
  const s = system.list[0];
  run(system, HISTORY_LENGTH + 25);
  const h = s.getHistory();
  assert.equal(h.length, HISTORY_LENGTH);
  assert.ok(Math.abs(h.at(-1) - s.population.total) < 1e-3 * Math.max(1, s.population.total), 'history ends at the current population');
  assert.equal(s.historyCount, HISTORY_LENGTH + 26);
  const json = JSON.parse(JSON.stringify(s.toJSON()));
  assert.equal(json.history.length, HISTORY_LENGTH);
  assert.equal(json.name, s.name);
});

test('simulation: settlements advance with simulated years, once per year', () => {
  const h = harness();
  const s = h.sim.settlements.list[0];
  assert.equal(s.historyCount, 1);
  h.advance(5000);
  assert.equal(h.sim.clock.year, 6);
  assert.equal(s.historyCount, 6, 'one settlement update per elapsed year');
  assert.equal(h.sim.worldState.population, Math.round(h.sim.settlements.totalPopulation));
  assert.equal(h.sim.worldState.settlementCount, h.sim.settlements.activeCount);
});

test('simulation emits settlement events', () => {
  const h = harness({ settlementConfig: { development: { progressPerYear: 0.6 } } });
  assert.equal(h.count(EVENTS.SETTLEMENTS_CREATED), 1);
  const created = h.events.find(([n]) => n === EVENTS.SETTLEMENTS_CREATED)[1];
  assert.equal(created.settlements, h.sim.settlements.list);
  assert.ok(created.count >= 3);
  h.advance(60000);
  assert.equal(h.count(EVENTS.SETTLEMENTS_UPDATED), 60, 'one update event per year-change tick');
  const last = h.events.filter(([n]) => n === EVENTS.SETTLEMENTS_UPDATED).at(-1)[1];
  assert.equal(last.year, h.sim.clock.year);
  assert.equal(last.totalPopulation, h.sim.settlements.totalPopulation);
  assert.ok(h.count(EVENTS.SETTLEMENT_PROMOTED) >= 1, 'fast development should promote a camp');
  const promoted = h.events.find(([n]) => n === EVENTS.SETTLEMENT_PROMOTED)[1];
  assert.equal(promoted.to, 'village');
});

test('simulation: pausing stops settlements, resuming continues them', () => {
  const h = harness();
  h.advance(3000);
  h.bus.emit(EVENTS.CMD_SIM_PAUSE);
  const frozen = JSON.stringify(state(h.sim));
  const year = h.sim.clock.year;
  h.skip(3_600_000);
  h.advance(10000);
  assert.equal(h.sim.clock.year, year);
  assert.equal(JSON.stringify(state(h.sim)), frozen, 'settlements changed while paused');
  h.bus.emit(EVENTS.CMD_SIM_RESUME);
  h.advance(4000);
  assert.equal(h.sim.clock.year, year + 4);
  assert.notEqual(JSON.stringify(state(h.sim)), frozen);
});

test('simulation: speed multiplies how fast settlements develop', () => {
  const slow = harness();
  const fast = harness();
  fast.bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: 10 });
  slow.advance(5000);
  fast.advance(5000);
  assert.equal(slow.sim.clock.year, 6);
  assert.equal(fast.sim.clock.year, 51);
  assert.equal(slow.sim.settlements.list[0].historyCount, 6);
  assert.equal(fast.sim.settlements.list[0].historyCount, 51);
  assert.ok(fast.sim.settlements.totalPopulation > slow.sim.settlements.totalPopulation);
});

test('simulation: several years in one tick are each simulated individually', () => {
  const h = harness();
  h.bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: 10 });
  const s = h.sim.settlements.list[0];
  h.tickAfter(1500); // 15 simulated years in a single tick
  assert.equal(h.sim.clock.year, 16);
  assert.equal(s.historyCount, 16);
  assert.equal(h.count(EVENTS.SETTLEMENTS_UPDATED), 1);
});

test('simulation: results do not depend on tick size, frame rate or speed changes', () => {
  const a = harness({ seed: 'repeat' });
  const b = harness({ seed: 'repeat' });
  const c = harness({ seed: 'repeat' });
  a.advance(120000, 50);   // 20 Hz
  b.advance(120000, 400);  // coarse ticks
  c.bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: 10 });
  c.advance(12000, 100);   // same 120 simulated years at 10x
  assert.equal(a.sim.clock.year, 121);
  assert.equal(b.sim.clock.year, 121);
  assert.equal(c.sim.clock.year, 121);
  assert.deepEqual(state(a.sim), state(b.sim));
  assert.deepEqual(state(a.sim), state(c.sim));
});

test('simulation: two runs with the same seed are identical, different seeds differ', () => {
  const run1 = harness({ seed: 'same' });
  const run2 = harness({ seed: 'same' });
  const other = harness({ seed: 'other' });
  for (const h of [run1, run2, other]) h.advance(80000);
  assert.deepEqual(state(run1.sim), state(run2.sim));
  assert.notDeepEqual(state(run1.sim), state(other.sim));
});

test('simulation: invalid settlement configuration is reported at construction', () => {
  assert.throws(() => harness({ settlementConfig: { food: { workerShare: 5 } } }), /workerShare/);
  assert.throws(() => harness({ settlementConfig: { typo: 1 } }), /Unknown setting "typo"/);
});

test('large world: placement and 500 simulated years stay fast', () => {
  const h = harness({ seed: 'perf-large', size: 'large' });
  const system = h.sim.settlements;
  assert.ok(system.list.length >= 50);
  const start = performance.now();
  let years = 0;
  for (let y = 2; y <= 501; y++) { system.advanceYear(y); years++; }
  const ms = performance.now() - start;
  console.log(`      (${system.list.length} settlements, ${years} years in ${ms.toFixed(0)} ms = ${(ms / years).toFixed(3)} ms per year)`);
  assert.ok(ms < 2000, `500 years took ${ms.toFixed(0)} ms`);
  assert.ok(system.totalPopulation > 0);
});
