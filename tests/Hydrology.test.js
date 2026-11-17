import test from 'node:test';
import assert from 'node:assert/strict';
import { DIR_DX, DIR_DY } from '../src/world/grid.js';
import { TERRAIN } from '../src/world/terrain.js';
import { SEA_LEVEL } from '../src/world/worldConstants.js';
import { gen } from './helpers.js';

const CONFIGS = [
  { seed: 'alpha', size: 'medium', landmass: 'balanced' },
  { seed: 'beta', size: 'medium', landmass: 'continents' },
  { seed: 'gamma', size: 'medium', landmass: 'islands', water: 'low' },
  { seed: 'delta', size: 'large', landmass: 'continents', variety: 'high' },
];
const worlds = () => CONFIGS.map((c) => gen(c));
const isWaterTile = (w, i) => [TERRAIN.DEEP_WATER, TERRAIN.SHALLOW_WATER, TERRAIN.LAKE].includes(w.tiles[i]);

test('worlds have rivers', () => {
  for (const w of worlds()) {
    let rivers = 0;
    for (const s of w.riverSize) if (s > 0) rivers++;
    assert.ok(rivers >= 30, `only ${rivers} river tiles`);
  }
});

test('every river tile has a valid flow direction into a neighbouring tile', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.riverSize.length; i++) {
      const size = w.riverSize[i];
      const dir = w.riverDir[i];
      if (size === 0) { assert.equal(dir, 0, 'direction without a river'); continue; }
      assert.ok(size >= 1 && size <= 3);
      assert.ok(dir >= 1 && dir <= 8, `bad direction ${dir}`);
      const x = i % w.width;
      const y = (i - x) / w.width;
      const tx = x + DIR_DX[dir];
      const ty = y + DIR_DY[dir];
      assert.ok(w.inBounds(tx, ty), 'river flows off the map');
      assert.ok(!isWaterTile(w, i), 'river drawn on a water tile');
    }
  }
});

test('rivers never flow uphill', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.riverSize.length; i++) {
      if (w.riverSize[i] === 0) continue;
      const x = i % w.width;
      const y = (i - x) / w.width;
      const target = w.getRiverTarget(x, y);
      const j = target.y * w.width + target.x;
      assert.ok(w.elevation[j] <= w.elevation[i], `river at ${x},${y} flows uphill (${w.elevation[i]} -> ${w.elevation[j]})`);
    }
  }
});

test('every river reaches an ocean or a lake without looping', () => {
  for (const w of worlds()) {
    const limit = w.width * w.height;
    let checked = 0;
    for (let start = 0; start < w.riverSize.length; start += 3) {
      if (w.riverSize[start] === 0) continue;
      let i = start;
      let steps = 0;
      while (w.riverSize[i] > 0) {
        const x = i % w.width;
        const y = (i - x) / w.width;
        const t = w.getRiverTarget(x, y);
        i = t.y * w.width + t.x;
        assert.ok(++steps < limit, 'river loops forever');
      }
      assert.ok(isWaterTile(w, i), `river ends on land at tile ${i}`);
      checked++;
    }
    assert.ok(checked > 10);
  }
});

test('rivers grow larger downstream and widen toward the sea', () => {
  for (const w of worlds()) {
    let mouthsLarge = 0;
    let mouths = 0;
    for (let i = 0; i < w.riverSize.length; i++) {
      if (w.riverSize[i] === 0) continue;
      const x = i % w.width;
      const y = (i - x) / w.width;
      const t = w.getRiverTarget(x, y);
      const j = t.y * w.width + t.x;
      if (w.riverSize[j] > 0) assert.ok(w.riverSize[j] >= w.riverSize[i], 'river shrinks downstream');
      if (isWaterTile(w, j)) { mouths++; if (w.riverSize[i] >= 2) mouthsLarge++; }
    }
    assert.ok(mouths > 0);
    assert.ok(mouthsLarge / mouths > 0.3, `only ${mouthsLarge}/${mouths} river mouths are medium or large`);
  }
});

test('rivers originate in high ground (or flow out of a lake)', () => {
  for (const w of worlds()) {
    const land = [];
    for (let i = 0; i < w.elevation.length; i++) if (w.tiles[i] !== TERRAIN.LAKE && w.elevation[i] > SEA_LEVEL) land.push(w.elevation[i]);
    land.sort((a, b) => a - b);
    const median = land[land.length >> 1];

    const hasUpstream = new Uint8Array(w.riverSize.length);
    const fedByLake = new Uint8Array(w.riverSize.length);
    for (let i = 0; i < w.riverSize.length; i++) {
      const x = i % w.width;
      const y = (i - x) / w.width;
      const t = w.getRiverTarget(x, y);
      if (t && w.riverSize[t.y * w.width + t.x] > 0) hasUpstream[t.y * w.width + t.x] = 1;
    }
    // a river tile next to a lake tile may be that lake's outflow
    for (let i = 0; i < w.riverSize.length; i++) {
      if (w.riverSize[i] === 0) continue;
      const x = i % w.width;
      const y = (i - x) / w.width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.isLake(x + dx, y + dy)) fedByLake[i] = 1;
    }
    let sources = 0;
    let high = 0;
    for (let i = 0; i < w.riverSize.length; i++) {
      if (w.riverSize[i] === 0 || hasUpstream[i]) continue;
      sources++;
      if (w.elevation[i] >= median || fedByLake[i]) high++;
    }
    assert.ok(sources > 5);
    assert.equal(high, sources, `${sources - high} of ${sources} river sources start in low ground`);
  }
});

test('lakes: flat water bodies on land, separate from the ocean', () => {
  let lakeCount = 0;
  for (const w of worlds()) {
    const counted = new Map();
    for (let i = 0; i < w.lakeId.length; i++) {
      const id = w.lakeId[i];
      if (id === 0) { assert.notEqual(w.tiles[i], TERRAIN.LAKE); continue; }
      assert.equal(w.tiles[i], TERRAIN.LAKE);
      assert.ok(w.elevation[i] > SEA_LEVEL, 'lake at or below sea level');
      counted.set(id, (counted.get(id) ?? 0) + 1);
    }
    assert.equal(counted.size, w.lakes.length);
    for (const lake of w.lakes) {
      assert.equal(counted.get(lake.id), lake.area);
      assert.ok(lake.area >= 2);
      assert.ok(lake.surface <= SEA_LEVEL + 0.35, 'lake high in the mountains');
    }
    lakeCount += w.lakes.length;
  }
  assert.ok(lakeCount >= 4, `only ${lakeCount} lakes across the test worlds`);
});

test('lake tiles do not touch the open ocean', () => {
  for (const w of worlds()) {
    for (let y = 1; y < w.height - 1; y++) {
      for (let x = 1; x < w.width - 1; x++) {
        if (!w.isLake(x, y)) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const t = w.getTile(x + dx, y + dy);
          assert.ok(t !== TERRAIN.DEEP_WATER && t !== TERRAIN.SHALLOW_WATER, `lake at ${x},${y} touches the sea`);
        }
      }
    }
  }
});

test('flow accumulation is non-negative and grows along rivers', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.riverSize.length; i++) {
      assert.ok(w.flowAccumulation[i] >= 0);
      if (w.riverSize[i] === 0) continue;
      const x = i % w.width;
      const y = (i - x) / w.width;
      const t = w.getRiverTarget(x, y);
      const j = t.y * w.width + t.x;
      if (w.riverSize[j] > 0) assert.ok(w.flowAccumulation[j] >= w.flowAccumulation[i]);
    }
  }
});
