import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOME } from '../src/world/biomes.js';
import { TERRAIN, TERRAIN_INFO } from '../src/world/terrain.js';
import { HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL } from '../src/world/worldConstants.js';
import { componentSizes, gen, mean } from './helpers.js';

const SEEDS = ['alpha', 'beta', 'gamma', 'delta'];
const worlds = () => SEEDS.map((seed) => gen({ seed, size: 'medium', landmass: 'balanced' }));

test('elevation is valid: finite, within 0..1, sea level 0.5 separates ocean from land', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.elevation.length; i++) {
      const e = w.elevation[i];
      assert.ok(Number.isFinite(e) && e >= 0 && e <= 1, `elevation ${e} at ${i}`);
      const terrain = w.tiles[i];
      if (terrain === TERRAIN.DEEP_WATER || terrain === TERRAIN.SHALLOW_WATER) assert.ok(e <= SEA_LEVEL, `ocean tile above sea level at ${i}`);
      else assert.ok(e > SEA_LEVEL, `land/lake tile at or below sea level at ${i}`);
    }
  }
});

test('elevation drives terrain: hills, mountains and peaks sit at the right heights', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) {
      const e = w.elevation[i];
      switch (w.tiles[i]) {
        case TERRAIN.MOUNTAIN: assert.ok(e >= MOUNTAIN_LEVEL, `mountain at ${e}`); break;
        case TERRAIN.HILLS: assert.ok(e >= HILL_LEVEL && e < MOUNTAIN_LEVEL, `hills at ${e}`); break;
        case TERRAIN.DEEP_WATER: case TERRAIN.SHALLOW_WATER: case TERRAIN.LAKE: break;
        case TERRAIN.SNOW: break; // polar ground or a peak
        default: assert.ok(e < MOUNTAIN_LEVEL, `${TERRAIN_INFO[w.tiles[i]].name} above the mountain line (${e})`);
      }
    }
  }
});

test('every terrain type appears across the generated worlds', () => {
  const seen = new Set();
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
    for (const landmass of ['balanced', 'continents']) {
      const w = gen({ seed, landmass, size: 'medium', variety: 'high' });
      w.countTiles().forEach((n, id) => { if (n > 0) seen.add(id); });
    }
  }
  for (const [name, id] of Object.entries(TERRAIN)) assert.ok(seen.has(id), `terrain ${name} never generated`);
});

test('there are inland lakes and a shallow coastal shelf next to land', () => {
  const w = gen({ seed: 'alpha', size: 'medium', landmass: 'continents' });
  assert.ok(w.lakes.length >= 1);
  let shelf = 0;
  let coastLand = 0;
  for (let y = 1; y < w.height - 1; y++) {
    for (let x = 1; x < w.width - 1; x++) {
      const t = w.getTile(x, y);
      if (t === TERRAIN.DEEP_WATER) {
        // deep ocean must not touch land directly
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const n = w.getTile(x + dx, y + dy);
          assert.ok(n === TERRAIN.DEEP_WATER || n === TERRAIN.SHALLOW_WATER, `deep water touches land at ${x},${y}`);
        }
      }
      if (t === TERRAIN.SHALLOW_WATER) shelf++;
      if (t === TERRAIN.SAND) coastLand++;
    }
  }
  assert.ok(shelf > 0 && coastLand > 0, `shelf ${shelf}, beach ${coastLand}`);
});

test('mountains form connected ranges, not scattered single tiles', () => {
  let totalMountain = 0;
  let isolated = 0;
  const largestShare = [];
  for (const w of worlds()) {
    const isHigh = (i) => w.elevation[i] >= MOUNTAIN_LEVEL && w.tiles[i] > TERRAIN.SHALLOW_WATER && w.tiles[i] !== TERRAIN.LAKE;
    const sizes = componentSizes(w.width, w.height, isHigh);
    const sum = sizes.reduce((a, b) => a + b, 0);
    assert.ok(sum > 50, `too few mountain tiles (${sum})`);
    totalMountain += sum;
    isolated += sizes.filter((s) => s <= 2).reduce((a, b) => a + b, 0);
    largestShare.push(Math.max(...sizes) / sum);
    assert.ok(Math.max(...sizes) >= 30, 'largest range is too small to be a range');
  }
  assert.ok(isolated / totalMountain < 0.1, `${((isolated / totalMountain) * 100).toFixed(1)}% of mountain tiles are isolated`);
  assert.ok(mean(largestShare) > 0.3, `largest range holds only ${(mean(largestShare) * 100).toFixed(0)}% of mountain tiles`);
});

test('climate: warm equator, cold poles, cold mountain tops', () => {
  for (const w of worlds()) {
    const rowMean = (y0, y1) => {
      const values = [];
      for (let y = y0; y < y1; y++) for (let x = 0; x < w.width; x++) values.push(w.temperature[y * w.width + x]);
      return mean(values);
    };
    const n = w.height;
    const equator = rowMean(Math.floor(n * 0.45), Math.floor(n * 0.55));
    const pole = rowMean(0, Math.floor(n * 0.08));
    assert.ok(equator > 20 && pole < -10 && equator - pole > 35, `equator ${equator.toFixed(1)} pole ${pole.toFixed(1)}`);

    const high = [];
    const low = [];
    for (let y = Math.floor(n * 0.3); y < Math.floor(n * 0.7); y++) {
      for (let x = 0; x < w.width; x++) {
        const i = y * w.width + x;
        if (w.elevation[i] <= SEA_LEVEL) continue;
        if (w.elevation[i] >= MOUNTAIN_LEVEL) high.push(w.temperature[i]);
        else if (w.elevation[i] < 0.55) low.push(w.temperature[i]);
      }
    }
    if (high.length > 20 && low.length > 20) assert.ok(mean(low) - mean(high) > 10, `lapse: lowland ${mean(low).toFixed(1)} vs high ${mean(high).toFixed(1)}`);
  }
});

test('climate fields are valid and rainfall varies', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) {
      assert.ok(w.temperature[i] >= -60 && w.temperature[i] <= 50);
    }
    const land = [];
    for (let i = 0; i < w.tiles.length; i++) if (w.elevation[i] > SEA_LEVEL) land.push(w.rainfall[i]);
    const avg = mean(land);
    const spread = Math.sqrt(mean(land.map((v) => (v - avg) ** 2)));
    assert.ok(spread > 20, `rainfall barely varies (sd ${spread.toFixed(1)})`);
  }
});

test('biome distribution: several biomes, sensible climate for each', () => {
  const counts = new Map();
  const moistOf = new Map();
  const tempOf = new Map();
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) {
      const b = w.biomes[i];
      counts.set(b, (counts.get(b) ?? 0) + 1);
      if (!moistOf.has(b)) { moistOf.set(b, []); tempOf.set(b, []); }
      moistOf.get(b).push(w.moisture[i]);
      tempOf.get(b).push(w.temperature[i]);
    }
  }
  for (const key of ['OCEAN', 'LAKE', 'ICE', 'TUNDRA', 'TAIGA', 'GRASSLAND', 'TEMPERATE_FOREST', 'SAVANNA', 'DESERT', 'ALPINE']) {
    assert.ok((counts.get(BIOME[key]) ?? 0) > 0, `biome ${key} never generated`);
  }
  // Hot and dry -> desert; cold -> ice/tundra; humid and warm -> forest/rainforest.
  assert.ok(mean(tempOf.get(BIOME.ICE)) < -8);
  assert.ok(mean(tempOf.get(BIOME.TUNDRA)) < 0);
  assert.ok(mean(tempOf.get(BIOME.DESERT)) > 8);
  assert.ok(mean(moistOf.get(BIOME.DESERT)) < mean(moistOf.get(BIOME.TEMPERATE_FOREST)) - 40);
  assert.ok(mean(moistOf.get(BIOME.DESERT)) < mean(moistOf.get(BIOME.GRASSLAND)));
  assert.ok(mean(tempOf.get(BIOME.SAVANNA)) > mean(tempOf.get(BIOME.TAIGA)) + 10);
});

test('biomes and terrain agree with each other', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) {
      const t = w.tiles[i];
      const b = w.biomes[i];
      if (t === TERRAIN.LAKE) assert.equal(b, BIOME.LAKE);
      if (b === BIOME.LAKE) assert.equal(t, TERRAIN.LAKE);
      if (t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER) assert.equal(b, BIOME.OCEAN);
      if (t === TERRAIN.DESERT) assert.equal(b, BIOME.DESERT);
      if (t === TERRAIN.SWAMP) assert.equal(b, BIOME.SWAMP);
      if (t === TERRAIN.DENSE_FOREST) assert.ok([BIOME.TAIGA, BIOME.TEMPERATE_FOREST, BIOME.RAINFOREST].includes(b));
      if (t === TERRAIN.MOUNTAIN) assert.equal(b, BIOME.ALPINE);
    }
  }
});

test('biomes are spatially coherent: neighbouring tiles usually share a biome', () => {
  for (const w of worlds()) {
    let same = 0;
    let pairs = 0;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width - 1; x++) {
        const i = y * w.width + x;
        if (w.elevation[i] <= SEA_LEVEL) continue;
        pairs++;
        if (w.biomes[i] === w.biomes[i + 1]) same++;
      }
    }
    assert.ok(same / pairs > 0.85, `only ${((same / pairs) * 100).toFixed(1)}% of neighbouring land tiles share a biome`);
  }
});

test('polar regions are icy and the tropics are not', () => {
  for (const w of worlds()) {
    let polarLand = 0;
    let polarCold = 0;
    let tropicalIce = 0;
    for (let y = 0; y < w.height; y++) {
      const lat = Math.abs((2 * (y + 0.5)) / w.height - 1);
      for (let x = 0; x < w.width; x++) {
        const i = y * w.width + x;
        if (w.elevation[i] <= SEA_LEVEL) continue;
        if (lat > 0.85) {
          polarLand++;
          if ([BIOME.ICE, BIOME.TUNDRA].includes(w.biomes[i]) || w.tiles[i] === TERRAIN.SNOW) polarCold++;
        }
        if (lat < 0.3 && w.biomes[i] === BIOME.ICE) tropicalIce++;
      }
    }
    if (polarLand > 30) assert.ok(polarCold / polarLand > 0.6, `polar land: ${polarCold}/${polarLand} cold`);
    assert.equal(tropicalIce, 0);
  }
});
