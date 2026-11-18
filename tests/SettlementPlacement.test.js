import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettlementConfig } from '../src/config/settlementConfig.js';
import { SettlementSystem } from '../src/simulation/settlements/SettlementSystem.js';
import { SiteAnalyzer, computeSiteProfile, terrainAccess } from '../src/simulation/settlements/SiteAnalysis.js';
import { placeInitialSettlements } from '../src/simulation/settlements/SettlementPlacer.js';
import { TERRAIN } from '../src/world/terrain.js';
import { createSyntheticWorld, gen, mean } from './helpers.js';

const cfg = createSettlementConfig();
const UNSUITABLE = [TERRAIN.DEEP_WATER, TERRAIN.SHALLOW_WATER, TERRAIN.LAKE, TERRAIN.MOUNTAIN, TERRAIN.SNOW, TERRAIN.SWAMP];

function place(world, config = cfg) {
  const system = new SettlementSystem({ world, seedValue: world.seedValue, config });
  system.generateInitialSettlements();
  return system;
}

const worlds = () => [
  gen({ seed: 'alpha', size: 'small' }),
  gen({ seed: 'beta', size: 'medium', landmass: 'continents' }),
  gen({ seed: 'gamma', size: 'medium', landmass: 'islands' }),
];

test('settlements are never placed in oceans, lakes, mountains, snow or swamp', () => {
  for (const world of worlds()) {
    const { list } = place(world);
    assert.ok(list.length >= 3);
    for (const s of list) {
      const terrain = world.getTile(s.x, s.y);
      assert.ok(!UNSUITABLE.includes(terrain), `settlement ${s.name} on terrain ${terrain}`);
      assert.ok(terrainAccess(terrain) > 0);
    }
  }
});

test('every site has fresh water nearby and a worthwhile score', () => {
  for (const world of worlds()) {
    const system = place(world);
    for (const s of system.list) {
      assert.ok(world.getResource('freshwater', s.x, s.y) >= cfg.placement.minFreshwater, `${s.name} has no fresh water`);
      assert.ok(s.site.waterAccess > 0);
    }
    const analyzer = new SiteAnalyzer(world, cfg.placement.siteRadius);
    for (const s of system.list) assert.ok(analyzer.scoreAt(s.x, s.y, cfg.placement) >= cfg.placement.minScore);
  }
});

test('settlements keep a minimum distance from each other', () => {
  for (const world of worlds()) {
    const system = place(world);
    const min = system.lastPlacement.minDistance;
    assert.ok(min >= cfg.placement.minDistance);
    for (let i = 0; i < system.list.length; i++) {
      for (let j = i + 1; j < system.list.length; j++) {
        const a = system.list[i];
        const b = system.list[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= min, `${a.name} and ${b.name} are too close`);
      }
    }
  }
});

test('placement is deterministic for a world seed and configuration', () => {
  const world = gen({ seed: 'beta', size: 'medium' });
  const a = place(world);
  const b = place(world);
  const describe = (sys) => sys.list.map((s) => [s.id, s.name, s.x, s.y, s.population.total, s.site.farmland]);
  assert.deepEqual(describe(a), describe(b));
  // A freshly generated identical world gives identical settlements too.
  const again = place(gen({ seed: 'beta', size: 'medium', name: 'Different name' }));
  assert.deepEqual(describe(a).map((r) => r.slice(0, 4)), describe(again).map((r) => r.slice(0, 4)));
});

test('different worlds get different settlements', () => {
  const a = place(gen({ seed: 'alpha', size: 'medium' })).list.map((s) => `${s.x},${s.y}`).join(';');
  const b = place(gen({ seed: 'omega', size: 'medium' })).list.map((s) => `${s.x},${s.y}`).join(';');
  assert.notEqual(a, b);
});

test('several settlements are placed, in proportion to the amount of land', () => {
  const small = place(gen({ seed: 'alpha', size: 'small' }));
  const medium = place(gen({ seed: 'alpha', size: 'medium' }));
  const large = place(gen({ seed: 'alpha', size: 'large' }));
  assert.ok(small.list.length >= 3);
  assert.ok(medium.list.length > small.list.length);
  assert.ok(large.list.length > medium.list.length);
  assert.ok(large.list.length <= cfg.placement.maxSettlements);
  for (const system of [small, medium, large]) {
    const wanted = Math.round(system.lastPlacement.landTiles / cfg.placement.tilesPerSettlement);
    assert.ok(system.list.length >= Math.min(wanted, system.lastPlacement.targetCount) * 0.7, `${system.list.length} placed, ${wanted} wanted`);
  }
});

test('placement obeys the configuration (density and spacing)', () => {
  const world = gen({ seed: 'beta', size: 'medium' });
  const sparse = place(world, createSettlementConfig({ placement: { tilesPerSettlement: 3000 } }));
  const dense = place(world, createSettlementConfig({ placement: { tilesPerSettlement: 450 } }));
  assert.ok(dense.list.length > sparse.list.length);
  const wide = place(world, createSettlementConfig({ placement: { minDistance: 30, tilesPerSettlement: 450 } }));
  assert.ok(wide.lastPlacement.minDistance >= 30 || wide.list.length < dense.list.length);
  for (let i = 0; i < wide.list.length; i++) for (let j = i + 1; j < wide.list.length; j++) {
    const d = Math.hypot(wide.list[i].x - wide.list[j].x, wide.list[i].y - wide.list[j].y);
    assert.ok(d >= wide.lastPlacement.minDistance);
  }
});

test('sites are better than average land: more fertile soil, more fresh water', () => {
  const world = gen({ seed: 'beta', size: 'medium', landmass: 'continents' });
  const system = place(world);
  const analyzer = new SiteAnalyzer(world, cfg.placement.siteRadius);
  const random = [];
  for (let y = 4; y < world.height - 4; y += 3) {
    for (let x = 4; x < world.width - 4; x += 3) {
      if (!world.isWater(x, y)) random.push(analyzer.profileAt(x, y));
    }
  }
  assert.ok(mean(system.list.map((s) => s.site.farmland)) > mean(random.map((p) => p.farmland)) * 1.15, 'sites should have clearly more farmland than typical land');
  assert.ok(mean(system.list.map((s) => s.site.waterAccess)) > mean(random.map((p) => p.waterAccess)) * 2, 'sites should have far better water access');
  // The first settlement has the best score.
  const scores = system.lastPlacement.sites.map((s) => s.score);
  assert.equal(scores[0], Math.max(...scores));
});

test('the fast (summed-area) analysis agrees with the straightforward one', () => {
  const world = gen({ seed: 'alpha', size: 'medium' });
  const analyzer = new SiteAnalyzer(world, 4);
  for (let k = 0; k < 120; k++) {
    const x = (k * 37) % world.width;
    const y = (k * 91) % world.height;
    const fast = analyzer.profileAt(x, y);
    const slow = computeSiteProfile(world, x, y, 4);
    for (const key of Object.keys(slow)) assert.ok(Math.abs(fast[key] - slow[key]) < 1e-9, `${key} differs at ${x},${y}`);
  }
});

test('unusable tiles score -1', () => {
  const world = gen({ seed: 'alpha', size: 'medium' });
  const analyzer = new SiteAnalyzer(world, 4);
  let checked = 0;
  for (let i = 0; i < world.tiles.length && checked < 400; i += 11) {
    if (!UNSUITABLE.includes(world.tiles[i])) continue;
    assert.equal(analyzer.scoreAt(i % world.width, Math.floor(i / world.width), cfg.placement), -1);
    checked++;
  }
  assert.ok(checked > 50);
});

test('names, ids and founding data are unique and consistent', () => {
  const world = gen({ seed: 'gamma', size: 'large' });
  const system = place(world);
  const names = new Set(system.list.map((s) => s.name));
  assert.equal(names.size, system.list.length, 'duplicate settlement names');
  system.list.forEach((s, i) => {
    assert.equal(s.id, i + 1);
    assert.equal(system.getById(s.id), s);
    assert.equal(s.foundedYear, 1);
    assert.equal(s.type, 'camp');
    assert.ok(s.population.total >= cfg.placement.initialPopulationMin * 0.2);
    assert.ok(s.population.total <= cfg.placement.initialPopulationMax);
    assert.ok(s.population.total <= s.population.capacity);
    assert.ok(s.foodStorage > 0);
  });
  assert.equal(system.getById(0), null);
  assert.equal(system.getById(9999), null);
});

test('a world without fresh water yields no settlements and says so', () => {
  const world = createSyntheticWorld({ riverColumns: [] });
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const system = place(world);
    assert.equal(system.list.length, 0);
    assert.equal(system.totalPopulation, 0);
    assert.ok(warnings.some((w) => /suitable site/.test(w)), 'the shortage must be reported, not silent');
  } finally {
    console.warn = original;
  }
});

test('the placer works on a hand-built world and respects hard limits', () => {
  const world = createSyntheticWorld();
  const result = placeInitialSettlements(world, { seedValue: 5, config: cfg });
  assert.ok(result.sites.length >= 2);
  for (const site of result.sites) assert.ok(world.resources.freshwater[site.y * world.width + site.x] >= cfg.placement.minFreshwater);
});

test('placement on a Large world is fast enough', () => {
  const world = gen({ seed: 'delta', size: 'large', landmass: 'continents' });
  const start = performance.now();
  const system = place(world);
  const ms = performance.now() - start;
  console.log(`      (placed ${system.list.length} settlements on a 512x512 world in ${ms.toFixed(0)} ms)`);
  assert.ok(system.list.length >= 50);
  assert.ok(ms < 3000, `placement took ${ms.toFixed(0)} ms`);
});
