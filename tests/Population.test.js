import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTLEMENT_CONFIG as DEFAULTS } from '../src/config/settlementConfig.js';
import {
  computeBirthsAndDeaths, createPopulationGroup, stepPopulation, updateLivingConditions,
} from '../src/simulation/settlements/population.js';

const cfg = DEFAULTS.population;

/** Run `years` of population steps with fixed food, returning the group and per-year totals. */
function simulate(start, capacity, years, fed = 1, living = 0.9) {
  const group = createPopulationGroup(start, living);
  const totals = [start];
  for (let y = 0; y < years; y++) {
    stepPopulation(group, capacity, fed, cfg);
    totals.push(group.total);
  }
  return { group, totals };
}

test('a new population group tracks everything the design asks for', () => {
  const g = createPopulationGroup(50, 0.7);
  for (const key of ['total', 'births', 'deaths', 'growthRate', 'foodAvailable', 'foodConsumption', 'foodProduction', 'capacity', 'livingConditions']) {
    assert.ok(key in g, `missing ${key}`);
  }
  assert.equal(g.total, 50);
  assert.equal(g.livingConditions, 0.7);
});

test('births and deaths balance exactly at capacity with enough food', () => {
  const { births, deaths } = computeBirthsAndDeaths(100, 100, 1, 1, cfg);
  assert.ok(Math.abs(births - deaths) < 1e-9, `births ${births}, deaths ${deaths}`);
  assert.ok(births > 0);
});

test('well below capacity, births exceed deaths and growth is the logistic rate', () => {
  const { births, deaths } = computeBirthsAndDeaths(10, 1000, 1, 1, cfg);
  assert.ok(births > deaths);
  const expected = 10 * cfg.maxGrowthRate * (1 - 10 / 1000);
  assert.ok(Math.abs(births - deaths - expected) < 1e-9, `net ${births - deaths}, expected ${expected}`);
});

test('birth and death numbers follow their formulas', () => {
  const total = 200;
  const living = 0.5;
  const baseDeath = cfg.baseDeathRate * (1 + cfg.livingDeathEffect * (1 - living));
  const { births, deaths } = computeBirthsAndDeaths(total, 400, 1, living, cfg);
  const growth = cfg.maxGrowthRate * (1 - 0.5);
  assert.ok(Math.abs(births - total * (baseDeath + growth)) < 1e-9);
  assert.ok(Math.abs(deaths - total * baseDeath) < 1e-9);
});

test('population growth is bounded: S-shaped, never above capacity, never exponential', () => {
  const capacity = 1000;
  const { totals } = simulate(10, capacity, 600);
  for (let i = 1; i < totals.length; i++) {
    assert.ok(totals[i] <= capacity * 1.0001, `exceeded capacity at year ${i}: ${totals[i]}`);
    const rate = (totals[i] - totals[i - 1]) / totals[i - 1];
    assert.ok(rate <= cfg.maxGrowthRate + 1e-9, `growth ${rate} above the configured maximum`);
    assert.ok(totals[i] >= totals[i - 1] - 1e-9, 'population shrank with plentiful food');
  }
  assert.ok(totals.at(-1) > capacity * 0.97, 'should approach capacity');
  // Growth slows as it approaches capacity.
  const early = (totals[60] - totals[59]) / totals[59];
  const late = (totals[500] - totals[499]) / totals[499];
  assert.ok(late < early / 5);
});

test('population above capacity declines toward it', () => {
  const { totals } = simulate(300, 100, 200);
  assert.ok(totals[1] < totals[0]);
  assert.ok(totals.at(-1) < 130, `still at ${totals.at(-1)}`);
  for (let i = 1; i < totals.length; i++) assert.ok(totals[i] <= totals[i - 1] + 1e-9);
});

test('hunger cuts births and adds deaths', () => {
  const fed = computeBirthsAndDeaths(100, 200, 1, 0.8, cfg);
  const half = computeBirthsAndDeaths(100, 200, 0.5, 0.8, cfg);
  const none = computeBirthsAndDeaths(100, 200, 0, 0.8, cfg);
  assert.ok(fed.births > half.births && half.births > none.births);
  assert.equal(none.births, 0);
  assert.ok(fed.deaths < half.deaths && half.deaths < none.deaths);
  assert.ok(none.deaths - fed.deaths >= 100 * cfg.famineDeathRate - 1e-9);
});

test('a famine makes the population decline', () => {
  const { totals } = simulate(100, 200, 10, 0.2);
  assert.ok(totals.at(-1) < 100 * 0.7, `only fell to ${totals.at(-1)}`);
});

test('deaths never exceed the population and it never goes negative', () => {
  const g = createPopulationGroup(3, 0);
  for (let i = 0; i < 50; i++) {
    stepPopulation(g, 1, 0, cfg);
    assert.ok(g.total >= 0 && g.deaths <= 3 + 1e-9);
  }
  const empty = createPopulationGroup(0, 1);
  stepPopulation(empty, 10, 1, cfg);
  assert.equal(empty.total, 0);
  assert.equal(empty.growthRate, 0);
});

test('growth rate is reported as the net change of the year', () => {
  const g = createPopulationGroup(100, 0.9);
  stepPopulation(g, 300, 1, cfg);
  assert.ok(Math.abs(g.growthRate - (g.births - g.deaths) / 100) < 1e-9);
});

test('living conditions fall fast and recover slowly', () => {
  const g = createPopulationGroup(100, 0.9);
  const good = { fed: 1, stockRatio: 1, waterAccess: 1, development: 3, maxDevelopment: 5, fill: 0.6 };
  for (let i = 0; i < 40; i++) updateLivingConditions(g, good, cfg);
  const steady = g.livingConditions;
  assert.ok(steady > 0.85);

  updateLivingConditions(g, { ...good, fed: 0, stockRatio: 0 }, cfg);
  const afterOneFamine = g.livingConditions;
  assert.ok(steady - afterOneFamine > 0.1, 'one famine year should hurt noticeably');

  let years = 0;
  while (g.livingConditions < steady * 0.95 && years < 100) {
    updateLivingConditions(g, good, cfg);
    years++;
  }
  assert.ok(years >= 3, `recovered in ${years} years: too fast to be gradual`);
  assert.ok(years < 60, 'should recover eventually');
});

test('recovery after a shortage is gradual: population regrows step by step, never jumping', () => {
  const capacity = 400;
  const g = createPopulationGroup(380, 0.9);
  const good = { fed: 1, stockRatio: 1, waterAccess: 1, development: 2, maxDevelopment: 5, fill: 0.9 };
  // Three famine years
  for (let i = 0; i < 3; i++) {
    stepPopulation(g, capacity, 0.3, cfg);
    updateLivingConditions(g, { ...good, fed: 0.3, stockRatio: 0 }, cfg);
  }
  const low = g.total;
  assert.ok(low < 380 * 0.8);
  const living = g.livingConditions;
  const series = [];
  for (let i = 0; i < 120; i++) {
    stepPopulation(g, capacity, 1, cfg);
    updateLivingConditions(g, good, cfg);
    series.push(g.total);
  }
  assert.ok(series[0] < low * 1.05, 'population jumped back instantly');
  assert.ok(series.at(-1) > low * 1.2, 'population never recovered');
  assert.ok(series.at(-1) <= capacity * 1.001);
  for (let i = 1; i < series.length; i++) assert.ok(series[i] >= series[i - 1] - 1e-9, 'recovery was not monotonic');
  assert.ok(living < 0.9, 'living conditions should have been hurt by the famine');
});
