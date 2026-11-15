import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultWorldConfig, validateWorldConfig, NAME_MAX_LENGTH, SEED_MAX_LENGTH, WORLD_SIZES,
} from '../src/config/worldOptions.js';

const valid = () => ({ name: 'Veloria', seed: '12345', size: 'medium', landmass: 'balanced', water: 'normal', variety: 'normal' });

test('default config is itself valid', () => {
  const result = validateWorldConfig(createDefaultWorldConfig());
  assert.equal(result.ok, true);
});

test('valid input is normalised', () => {
  const result = validateWorldConfig({ ...valid(), name: '  Veloria  ', seed: ' 0042 ' });
  assert.equal(result.ok, true);
  assert.equal(result.value.name, 'Veloria');
  assert.equal(result.value.seed, '0042');
  assert.equal(result.value.tiles, WORLD_SIZES.medium.tiles);
  assert.ok(Number.isInteger(result.value.seedValue));
});

test('numeric and text seeds are both accepted', () => {
  assert.equal(validateWorldConfig({ ...valid(), seed: 987654 }).ok, true);
  assert.equal(validateWorldConfig({ ...valid(), seed: 'Old Kingdom' }).ok, true);
  const a = validateWorldConfig({ ...valid(), seed: '42' }).value.seedValue;
  const b = validateWorldConfig({ ...valid(), seed: 42 }).value.seedValue;
  assert.equal(a, b);
});

test('rejects bad names', () => {
  for (const name of ['', '   ', 'x'.repeat(NAME_MAX_LENGTH + 1), 'bad\nname', null, undefined, 5]) {
    const r = validateWorldConfig({ ...valid(), name });
    assert.equal(r.ok, false, `name ${JSON.stringify(name)} should be rejected`);
    assert.ok(r.errors.name);
  }
});

test('rejects bad seeds', () => {
  for (const seed of ['', '  ', 'x'.repeat(SEED_MAX_LENGTH + 1), NaN, Infinity, null, {}, 'a\tb']) {
    const r = validateWorldConfig({ ...valid(), seed });
    assert.equal(r.ok, false, `seed ${String(seed)} should be rejected`);
    assert.ok(r.errors.seed);
  }
});

test('rejects unknown option keys, including prototype names', () => {
  for (const field of ['size', 'landmass', 'water', 'variety']) {
    for (const bad of ['huge', '', undefined, 3, 'toString', '__proto__', 'constructor']) {
      const r = validateWorldConfig({ ...valid(), [field]: bad });
      assert.equal(r.ok, false, `${field}=${String(bad)} should be rejected`);
      assert.ok(r.errors[field]);
    }
  }
});

test('reports every problem at once and rejects non-objects', () => {
  const r = validateWorldConfig({ name: '', seed: '', size: 'x', landmass: 'x', water: 'x', variety: 'x' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['landmass', 'name', 'seed', 'size', 'variety', 'water']);
  for (const bad of [null, undefined, 'text', 12, []]) {
    assert.equal(validateWorldConfig(bad).ok, false);
  }
});
