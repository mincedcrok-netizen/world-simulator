import test from 'node:test';
import assert from 'node:assert/strict';
import { paintWorld } from '../src/world/TerrainPainter.js';
import { World } from '../src/world/World.js';
import { checksum, gen } from './helpers.js';

test('paintWorld returns a fully opaque image of the right size', () => {
  const w = gen({ size: 'small', seed: 'paint' });
  for (const scale of [1, 3, 6]) {
    const img = paintWorld(w, { scale });
    assert.equal(img.width, w.width * scale);
    assert.equal(img.height, w.height * scale);
    assert.equal(img.pixels.length, img.width * img.height * 4);
    for (let i = 3; i < img.pixels.length; i += 4 * 37) assert.equal(img.pixels[i], 255);
  }
});

test('painting is deterministic', () => {
  const w = gen({ size: 'small', seed: 'paint' });
  assert.equal(checksum(paintWorld(w, { scale: 2 }).pixels), checksum(paintWorld(w, { scale: 2 }).pixels));
});

test('terrain types are visually distinguishable', () => {
  const w = gen({ size: 'medium', seed: 'alpha', landmass: 'continents', variety: 'high' });
  const img = paintWorld(w, { scale: 1 });
  const colorOf = (i) => [img.pixels[i * 4], img.pixels[i * 4 + 1], img.pixels[i * 4 + 2]];
  const sums = new Map();
  for (let i = 0; i < w.tiles.length; i++) {
    const t = w.tiles[i];
    if (w.riverSize[i] > 0) continue;
    const c = colorOf(i);
    const s = sums.get(t) ?? [0, 0, 0, 0];
    s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; s[3]++;
    sums.set(t, s);
  }
  const means = [...sums.entries()].filter(([, s]) => s[3] > 20).map(([t, s]) => [t, [s[0] / s[3], s[1] / s[3], s[2] / s[3]]]);
  assert.ok(means.length >= 10);
  for (let a = 0; a < means.length; a++) {
    for (let b = a + 1; b < means.length; b++) {
      const d = Math.hypot(...means[a][1].map((v, k) => v - means[b][1][k]));
      assert.ok(d > 12, `terrain ${means[a][0]} and ${means[b][0]} look nearly identical (distance ${d.toFixed(1)})`);
    }
  }
});

test('rivers are visible: river tile centres differ from the same world painted without rivers', () => {
  const w = gen({ size: 'medium', seed: 'alpha', landmass: 'continents' });
  const dry = new World({ ...w, riverSize: new Uint8Array(w.riverSize.length), riverDir: new Uint8Array(w.riverDir.length) });
  const scale = 4;
  const wet = paintWorld(w, { scale });
  const bare = paintWorld(dry, { scale });
  let tested = 0;
  let visible = 0;
  for (let i = 0; i < w.riverSize.length; i++) {
    if (w.riverSize[i] === 0) continue;
    const x = i % w.width;
    const y = (i - x) / w.width;
    const o = (((y * scale) + 2) * wet.width + x * scale + 2) * 4;
    const diff = Math.abs(wet.pixels[o] - bare.pixels[o]) + Math.abs(wet.pixels[o + 1] - bare.pixels[o + 1]) + Math.abs(wet.pixels[o + 2] - bare.pixels[o + 2]);
    tested++;
    if (diff > 25) visible++;
  }
  assert.ok(tested > 50);
  assert.ok(visible / tested > 0.7, `only ${visible}/${tested} river tiles are visibly painted`);
});

test('paintWorld explains what is missing for a world without generated layers', () => {
  const bare = new World({ width: 4, height: 4, tiles: new Uint8Array(16) });
  assert.throws(() => paintWorld(bare), /world\.elevation is missing/);
});
