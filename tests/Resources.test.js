import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOME } from '../src/world/biomes.js';
import { ORE_KEYS, RESOURCE, RESOURCE_INFO, RESOURCE_KEYS, RESOURCE_PRESENT } from '../src/world/resources.js';
import { TERRAIN } from '../src/world/terrain.js';
import { gen, mean } from './helpers.js';

const worlds = () => ['alpha', 'beta', 'gamma'].map((seed) => gen({ seed, size: 'medium', landmass: 'continents' }));

/** Mean richness of `key` over tiles whose terrain is in `terrains`, across all test worlds. */
function meanOn(key, terrains) {
  const values = [];
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) if (terrains.includes(w.tiles[i])) values.push(w.resources[key][i]);
  }
  return mean(values);
}

/** Share of tiles of the given terrains that hold at least RESOURCE_PRESENT of `key`. */
function presenceOn(key, terrains) {
  let hits = 0;
  let total = 0;
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) {
      if (!terrains.includes(w.tiles[i])) continue;
      total++;
      if (w.resources[key][i] >= RESOURCE_PRESENT) hits++;
    }
  }
  return hits / Math.max(1, total);
}

test('all eight resources exist as structured per-tile data', () => {
  assert.deepEqual([...RESOURCE_KEYS].sort(), ['coal', 'copper', 'fertileSoil', 'freshwater', 'gold', 'iron', 'stone', 'wood']);
  for (const key of RESOURCE_KEYS) assert.ok(RESOURCE_INFO[key].name);
  for (const w of worlds()) {
    for (const key of RESOURCE_KEYS) {
      assert.ok(w.resources[key] instanceof Uint8Array);
      let present = 0;
      for (const v of w.resources[key]) if (v >= RESOURCE_PRESENT) present++;
      assert.ok(present > 0, `${key} never occurs`);
    }
  }
});

test('the sea holds no land resources', () => {
  for (const w of worlds()) {
    for (let i = 0; i < w.tiles.length; i++) {
      if (w.tiles[i] !== TERRAIN.DEEP_WATER && w.tiles[i] !== TERRAIN.SHALLOW_WATER) continue;
      for (const key of RESOURCE_KEYS) assert.equal(w.resources[key][i], 0, `${key} in the ocean`);
    }
  }
});

test('wood is common in forests and rare elsewhere', () => {
  const forest = meanOn(RESOURCE.WOOD, [TERRAIN.FOREST, TERRAIN.DENSE_FOREST]);
  const dense = meanOn(RESOURCE.WOOD, [TERRAIN.DENSE_FOREST]);
  const open = meanOn(RESOURCE.WOOD, [TERRAIN.PLAINS, TERRAIN.DESERT, TERRAIN.SAND, TERRAIN.SNOW]);
  assert.ok(forest > 120, `forest wood ${forest.toFixed(0)}`);
  assert.ok(dense > forest, 'dense forest should be richer in wood');
  assert.ok(open < 20, `open-ground wood ${open.toFixed(0)}`);
});

test('stone is common in hills and mountains', () => {
  const mountain = meanOn(RESOURCE.STONE, [TERRAIN.MOUNTAIN]);
  const hills = meanOn(RESOURCE.STONE, [TERRAIN.HILLS]);
  const plains = meanOn(RESOURCE.STONE, [TERRAIN.PLAINS, TERRAIN.GRASS]);
  assert.ok(mountain > hills && hills > plains * 3, `stone: mountain ${mountain.toFixed(0)}, hills ${hills.toFixed(0)}, plains ${plains.toFixed(0)}`);
});

test('iron and copper favour mountains and hills over plains', () => {
  for (const key of [RESOURCE.IRON, RESOURCE.COPPER]) {
    const rock = presenceOn(key, [TERRAIN.MOUNTAIN, TERRAIN.HILLS]);
    const lowland = presenceOn(key, [TERRAIN.PLAINS, TERRAIN.GRASS, TERRAIN.FOREST]);
    assert.ok(rock > 0.02, `${key} in rock: ${rock}`);
    assert.ok(rock > lowland * 3, `${key}: rock ${(rock * 100).toFixed(1)}% vs lowland ${(lowland * 100).toFixed(1)}%`);
  }
});

test('gold is rare; coal prefers hills', () => {
  for (const w of worlds()) {
    let land = 0;
    let gold = 0;
    for (let i = 0; i < w.tiles.length; i++) {
      if (w.tiles[i] <= TERRAIN.SHALLOW_WATER || w.tiles[i] === TERRAIN.LAKE) continue;
      land++;
      if (w.resources.gold[i] >= RESOURCE_PRESENT) gold++;
    }
    assert.ok(gold / land < 0.05, `gold on ${((gold / land) * 100).toFixed(1)}% of land`);
  }
  assert.ok(presenceOn(RESOURCE.GOLD, [TERRAIN.MOUNTAIN, TERRAIN.HILLS]) > presenceOn(RESOURCE.GOLD, [TERRAIN.PLAINS, TERRAIN.GRASS]));
  assert.ok(meanOn(RESOURCE.COAL, [TERRAIN.HILLS]) > meanOn(RESOURCE.COAL, [TERRAIN.DESERT]));
});

test('fertile soil: best on plains and grassland and in river valleys, poor in desert and mountains', () => {
  const plains = meanOn(RESOURCE.FERTILE_SOIL, [TERRAIN.PLAINS, TERRAIN.GRASS]);
  const forest = meanOn(RESOURCE.FERTILE_SOIL, [TERRAIN.FOREST, TERRAIN.DENSE_FOREST]);
  const desert = meanOn(RESOURCE.FERTILE_SOIL, [TERRAIN.DESERT]);
  const mountain = meanOn(RESOURCE.FERTILE_SOIL, [TERRAIN.MOUNTAIN, TERRAIN.SNOW]);
  assert.ok(plains > forest && forest > desert, `plains ${plains.toFixed(0)}, forest ${forest.toFixed(0)}, desert ${desert.toFixed(0)}`);
  assert.ok(mountain < 10);

  // River valleys: grass/plains next to a river beat the same terrain far from water.
  const near = [];
  const far = [];
  for (const w of worlds()) {
    for (let y = 2; y < w.height - 2; y++) {
      for (let x = 2; x < w.width - 2; x++) {
        const i = y * w.width + x;
        if (w.tiles[i] !== TERRAIN.PLAINS && w.tiles[i] !== TERRAIN.GRASS) continue;
        let nearRiver = false;
        for (let dy = -2; dy <= 2 && !nearRiver; dy++) for (let dx = -2; dx <= 2; dx++) if (w.isRiver(x + dx, y + dy)) { nearRiver = true; break; }
        (nearRiver ? near : far).push(w.resources.fertileSoil[i]);
      }
    }
  }
  assert.ok(near.length > 50 && far.length > 50);
  assert.ok(mean(near) > mean(far) + 20, `valleys ${mean(near).toFixed(0)} vs elsewhere ${mean(far).toFixed(0)}`);
});

test('freshwater occurs near rivers and lakes only', () => {
  for (const w of worlds()) {
    const fresh = new Uint8Array(w.tiles.length);
    for (let i = 0; i < fresh.length; i++) fresh[i] = w.riverSize[i] > 0 || w.lakeId[i] > 0 ? 1 : 0;
    for (let y = 0; y < w.height; y++) {
      for (let x = 0; x < w.width; x++) {
        const i = y * w.width + x;
        let nearest = 99;
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w.width || ny >= w.height) continue;
            if (fresh[ny * w.width + nx]) nearest = Math.min(nearest, Math.max(Math.abs(dx), Math.abs(dy)));
          }
        }
        const amount = w.resources.freshwater[i];
        if (fresh[i]) assert.equal(amount, 255, 'river and lake tiles hold fresh water');
        else if (amount >= 200) assert.ok(nearest <= 1, `strong freshwater ${amount} at distance ${nearest}`);
        else if (nearest > 4) assert.equal(amount, 0, `freshwater ${amount} far from any river or lake`);
      }
    }
  }
});

test('ore deposits are consistent with the richness maps', () => {
  for (const w of worlds()) {
    assert.ok(w.deposits.length > 20);
    const tilesByType = {};
    for (const d of w.deposits) {
      assert.ok(ORE_KEYS.includes(d.type));
      assert.ok(w.inBounds(d.x, d.y));
      assert.ok(w.resources[d.type][d.y * w.width + d.x] >= RESOURCE_PRESENT);
      assert.ok(d.tiles >= 1 && d.amount >= d.tiles * RESOURCE_PRESENT);
      tilesByType[d.type] = (tilesByType[d.type] ?? 0) + d.tiles;
    }
    for (const type of ORE_KEYS) {
      let present = 0;
      for (const v of w.resources[type]) if (v >= RESOURCE_PRESENT) present++;
      assert.equal(tilesByType[type] ?? 0, present, `${type}: deposits do not cover every present tile exactly once`);
    }
  }
});

test('World.getResourcesAt reports what is on a tile, richest first', () => {
  const w = worlds()[0];
  let checked = 0;
  for (let i = 0; i < w.tiles.length && checked < 200; i += 7) {
    const x = i % w.width;
    const y = (i - x) / w.width;
    const found = w.getResourcesAt(x, y);
    for (let k = 1; k < found.length; k++) assert.ok(found[k - 1].amount >= found[k].amount);
    for (const r of found) assert.equal(r.amount, w.getResource(r.key, x, y));
    checked++;
  }
  const forestTile = w.tiles.findIndex((t) => t === TERRAIN.DENSE_FOREST);
  const x = forestTile % w.width;
  assert.ok(w.getResourcesAt(x, (forestTile - x) / w.width).some((r) => r.key === RESOURCE.WOOD));
  assert.equal(w.getResource('nonsense', 0, 0), 0);
  assert.ok(BIOME.RAINFOREST > 0);
});
