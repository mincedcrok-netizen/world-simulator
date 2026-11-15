import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/World.js';
import { TERRAIN } from '../src/world/terrain.js';
import {
  validateWorldConfig, WORLD_SIZES, LANDMASS_OPTIONS, WATER_OPTIONS, VARIETY_OPTIONS,
} from '../src/config/worldOptions.js';

const config = (overrides = {}) => {
  const r = validateWorldConfig({
    name: 'T', seed: 'seed-1', size: 'small', landmass: 'balanced', water: 'normal', variety: 'normal', ...overrides,
  });
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r.value;
};

const checksum = (tiles) => {
  let h = 0;
  for (let i = 0; i < tiles.length; i++) h = (Math.imul(h, 31) + tiles[i]) >>> 0;
  return h;
};

test('same seed + options give an identical map', () => {
  const a = World.fromConfig(config());
  const b = World.fromConfig(config());
  assert.equal(checksum(a.tiles), checksum(b.tiles));
});

test('different seeds give different maps', () => {
  const a = World.fromConfig(config({ seed: 'one' }));
  const b = World.fromConfig(config({ seed: 'two' }));
  assert.notEqual(checksum(a.tiles), checksum(b.tiles));
});

test('every size has the expected dimensions', () => {
  for (const [key, size] of Object.entries(WORLD_SIZES)) {
    const w = World.fromConfig(config({ size: key }));
    assert.equal(w.width, size.tiles);
    assert.equal(w.height, size.tiles);
    assert.equal(w.tiles.length, size.tiles * size.tiles);
  }
});

test('the border ring is always deep water (clear visual boundary)', () => {
  for (const landmass of Object.keys(LANDMASS_OPTIONS)) {
    const w = World.fromConfig(config({ landmass, seed: 'edge' }));
    for (let i = 0; i < w.width; i++) {
      assert.equal(w.getTile(i, 0), TERRAIN.DEEP_WATER);
      assert.equal(w.getTile(i, w.height - 1), TERRAIN.DEEP_WATER);
      assert.equal(w.getTile(0, i), TERRAIN.DEEP_WATER);
      assert.equal(w.getTile(w.width - 1, i), TERRAIN.DEEP_WATER);
    }
  }
});

test('every option combination yields both land and water, for many seeds', () => {
  for (const landmass of Object.keys(LANDMASS_OPTIONS)) {
    for (const water of Object.keys(WATER_OPTIONS)) {
      for (const variety of Object.keys(VARIETY_OPTIONS)) {
        for (let s = 0; s < 6; s++) {
          const w = World.fromConfig(config({ landmass, water, variety, seed: `s${s}` }));
          const land = w.landRatio();
          assert.ok(land > 0.02 && land < 0.9, `${landmass}/${water}/${variety}/s${s}: land ratio ${land.toFixed(3)}`);
        }
      }
    }
  }
});

test('water option changes land coverage in the expected direction', () => {
  let low = 0; let high = 0;
  for (let s = 0; s < 8; s++) {
    low += World.fromConfig(config({ water: 'low', seed: `w${s}` })).landRatio();
    high += World.fromConfig(config({ water: 'high', seed: `w${s}` })).landRatio();
  }
  assert.ok(low > high, `low water (${low}) should have more land than high water (${high})`);
});

test('maps contain several terrain types', () => {
  const w = World.fromConfig(config({ landmass: 'continents', size: 'medium', seed: 'varied' }));
  const used = w.countTiles().filter((n) => n > 0).length;
  assert.ok(used >= 5, `only ${used} terrain types present`);
});

test('getTile is safe outside the map; constructor validates size', () => {
  const w = World.fromConfig(config());
  assert.equal(w.getTile(-1, 0), -1);
  assert.equal(w.getTile(0, w.height), -1);
  assert.throws(() => new World({ width: 4, height: 4, tiles: new Uint8Array(3) }), /expected 16/);
});

test('a Large map generates in a reasonable time', () => {
  const start = performance.now();
  World.fromConfig(config({ size: 'large', landmass: 'islands', seed: 'perf' }));
  const ms = performance.now() - start;
  assert.ok(ms < 3000, `large map took ${ms.toFixed(0)} ms`);
  console.log(`      (Large map generated in ${ms.toFixed(0)} ms)`);
});

test('shallow water only appears as a narrow shelf next to land (regression: far-sea shallows)', () => {
  for (const landmass of Object.keys(LANDMASS_OPTIONS)) {
    const w = World.fromConfig(config({ landmass, seed: 'hello' }));
    const reach = 8;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        if (w.getTile(x, y) !== TERRAIN.SHALLOW_WATER) continue;
        let nearLand = false;
        for (let dy = -reach; dy <= reach && !nearLand; dy++) {
          for (let dx = -reach; dx <= reach; dx++) {
            const id = w.getTile(x + dx, y + dy);
            if (id >= TERRAIN.SAND) { nearLand = true; break; }
          }
        }
        assert.ok(nearLand, `${landmass}: shallow tile (${x},${y}) is far from any land`);
      }
    }
  }
});
