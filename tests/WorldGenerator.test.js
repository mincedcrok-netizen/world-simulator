import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, WorldGenerationError } from '../src/world/generation/WorldGenerator.js';
import { World } from '../src/world/World.js';
import { LANDMASS_OPTIONS, VARIETY_OPTIONS, WATER_OPTIONS, WORLD_SIZES } from '../src/config/worldOptions.js';
import { RESOURCE_KEYS } from '../src/world/resources.js';
import { TERRAIN } from '../src/world/terrain.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { componentSizes, gen, mean, worldChecksum } from './helpers.js';

test('generation is deterministic: same seed and settings give an identical world', () => {
  const config = { name: 'X', seed: 'determinism', size: 'small', landmass: 'balanced', water: 'normal', variety: 'normal' };
  const a = generateWorld(config);
  const b = generateWorld(config);
  assert.equal(worldChecksum(a), worldChecksum(b));
  assert.deepEqual(a.lakes, b.lakes);
  assert.deepEqual(a.deposits, b.deposits);
  // The world name must not influence the terrain.
  const c = generateWorld({ ...config, name: 'A completely different name' });
  assert.equal(worldChecksum(a), worldChecksum(c));
});

test('different seeds produce noticeably different worlds', () => {
  const seeds = ['one', 'two', 'three', 'four'];
  const worlds = seeds.map((seed) => gen({ seed, size: 'medium' }));
  for (let i = 0; i < worlds.length; i++) {
    for (let j = i + 1; j < worlds.length; j++) {
      let different = 0;
      for (let k = 0; k < worlds[i].tiles.length; k++) if (worlds[i].tiles[k] !== worlds[j].tiles[k]) different++;
      const share = different / worlds[i].tiles.length;
      assert.ok(share > 0.25, `${seeds[i]} vs ${seeds[j]}: only ${(share * 100).toFixed(1)}% of tiles differ`);
    }
  }
});

test('seeds: numeric forms are normalised, text seeds are case-sensitive', () => {
  assert.equal(worldChecksum(gen({ seed: '007' })), worldChecksum(gen({ seed: '7' })));
  assert.notEqual(worldChecksum(gen({ seed: 'alpha' })), worldChecksum(gen({ seed: 'ALPHA' })));
  assert.equal(gen({ seed: '12345' }).seed, '12345');
});

test('world dimensions and layer sizes match the chosen size', () => {
  for (const [key, size] of Object.entries(WORLD_SIZES)) {
    const w = gen({ size: key, seed: 'dims' });
    const n = size.tiles * size.tiles;
    assert.equal(w.width, size.tiles);
    assert.equal(w.height, size.tiles);
    for (const layer of ['tiles', 'biomes', 'elevation', 'temperature', 'rainfall', 'moisture', 'riverDir', 'riverSize', 'lakeId', 'flowAccumulation']) {
      assert.equal(w[layer].length, n, `${key}: ${layer}`);
    }
    for (const resource of RESOURCE_KEYS) assert.equal(w.resources[resource].length, n, `${key}: ${resource}`);
    assert.ok(w instanceof World);
  }
});

test('typed arrays use compact types suitable for large maps', () => {
  const w = gen({ size: 'small' });
  assert.ok(w.tiles instanceof Uint8Array);
  assert.ok(w.biomes instanceof Uint8Array);
  assert.ok(w.elevation instanceof Float32Array);
  assert.ok(w.temperature instanceof Int8Array);
  assert.ok(w.resources.iron instanceof Uint8Array);
});

test('land and water: every settings combination has both, with an ocean border', () => {
  for (const landmass of Object.keys(LANDMASS_OPTIONS)) {
    for (const water of Object.keys(WATER_OPTIONS)) {
      for (const variety of Object.keys(VARIETY_OPTIONS)) {
        for (const seed of ['s1', 's2']) {
          const w = gen({ landmass, water, variety, seed });
          const land = w.landRatio();
          assert.ok(land > 0.08 && land < 0.65, `${landmass}/${water}/${variety}/${seed}: land ${land.toFixed(3)}`);
          for (let i = 0; i < w.width; i++) {
            for (const [x, y] of [[i, 0], [i, w.height - 1], [0, i], [w.width - 1, i]]) {
              assert.equal(w.getTile(x, y), TERRAIN.DEEP_WATER, `border tile ${x},${y}`);
            }
          }
        }
      }
    }
  }
});

test('water coverage setting: Low > Normal > High land', () => {
  for (const landmass of Object.keys(LANDMASS_OPTIONS)) {
    const avg = (water) => mean(['a', 'b', 'c'].map((seed) => gen({ landmass, water, seed }).landRatio()));
    const low = avg('low');
    const normal = avg('normal');
    const high = avg('high');
    assert.ok(low > normal + 0.03 && normal > high + 0.03, `${landmass}: ${low.toFixed(2)} ${normal.toFixed(2)} ${high.toFixed(2)}`);
  }
});

test('landmass setting: Islands = many small landmasses, Continents = few large ones', () => {
  const stats = (landmass) => {
    const counts = [];
    const largest = [];
    for (const seed of ['a', 'b', 'c', 'd']) {
      const w = gen({ landmass, seed, size: 'medium' });
      const sizes = componentSizes(w.width, w.height, (i) => w.tiles[i] > TERRAIN.SHALLOW_WATER && w.tiles[i] !== TERRAIN.LAKE);
      const significant = sizes.filter((s) => s >= 20);
      counts.push(significant.length);
      largest.push(Math.max(...sizes) / sizes.reduce((a, b) => a + b, 0));
    }
    return { count: mean(counts), largest: mean(largest) };
  };
  const islands = stats('islands');
  const continents = stats('continents');
  assert.ok(islands.count > continents.count, `landmass counts: islands ${islands.count}, continents ${continents.count}`);
  assert.ok(continents.largest > islands.largest + 0.1, `largest share: continents ${continents.largest.toFixed(2)}, islands ${islands.largest.toFixed(2)}`);
});

test('terrain variety setting: High is rougher and more varied than Low', () => {
  const roughness = (variety) => {
    const values = [];
    const kinds = [];
    for (const seed of ['a', 'b', 'c']) {
      const w = gen({ variety, seed, size: 'medium' });
      let sum = 0;
      let n = 0;
      for (let y = 1; y < w.height - 1; y++) {
        for (let x = 1; x < w.width - 1; x++) {
          const i = y * w.width + x;
          if (w.elevation[i] <= 0.5 || w.elevation[i + 1] <= 0.5) continue;
          sum += Math.abs(w.elevation[i] - w.elevation[i + 1]);
          n++;
        }
      }
      values.push(sum / n);
      kinds.push(w.countTiles().filter((c) => c > 0).length);
    }
    return { rough: mean(values), kinds: mean(kinds) };
  };
  const low = roughness('low');
  const high = roughness('high');
  assert.ok(high.rough > low.rough * 1.15, `roughness low ${low.rough.toFixed(5)} high ${high.rough.toFixed(5)}`);
  assert.ok(high.kinds >= low.kinds, `terrain kinds low ${low.kinds} high ${high.kinds}`);
});

test('invalid configurations are rejected with a clear error', () => {
  const valid = { name: 'N', seed: 's', size: 'small', landmass: 'balanced', water: 'normal', variety: 'normal' };
  for (const bad of [null, undefined, 'x', 5, [], {}, { ...valid, size: 'huge' }, { ...valid, landmass: 'x' }, { ...valid, water: 'x' },
    { ...valid, variety: '' }, { ...valid, name: '' }, { ...valid, seed: '' }, { ...valid, seed: 'x'.repeat(100) }]) {
    assert.throws(() => generateWorld(bad), WorldGenerationError, `should reject ${JSON.stringify(bad)}`);
  }
  assert.throws(() => generateWorld({ ...valid, size: 'huge' }), /Choose a valid world size/);
  const sim = new Simulation();
  assert.throws(() => sim.initialize({ ...valid, water: 'bogus' }), /Invalid world configuration/);
});

test('World exposes the generated data through helpers', () => {
  const w = gen({ size: 'small' });
  assert.equal(w.seaLevel, 0.5);
  assert.equal(w.getTile(-1, 0), -1);
  assert.ok(Number.isNaN(w.getElevation(-1, -1)));
  const info = w.describeTile(w.width >> 1, w.height >> 1);
  for (const key of ['terrain', 'biome', 'elevation', 'temperature', 'rainfall', 'moisture', 'river', 'lake', 'resources']) assert.ok(key in info, key);
  assert.equal(w.describeTile(-5, 5), null);
  assert.ok(w.generationMs >= 0);
});

test('a Large world generates in a reasonable time and stays deterministic', () => {
  const config = { name: 'L', seed: 'perf', size: 'large', landmass: 'continents', water: 'normal', variety: 'high' };
  const start = performance.now();
  const a = generateWorld(config);
  const ms = performance.now() - start;
  console.log(`      (Large world generated in ${ms.toFixed(0)} ms: ${JSON.stringify(a.generationTimings)})`);
  assert.ok(ms < 20000, `large world took ${ms.toFixed(0)} ms`);
  assert.equal(a.width, 512);
  assert.equal(worldChecksum(a), worldChecksum(generateWorld(config)));
});
