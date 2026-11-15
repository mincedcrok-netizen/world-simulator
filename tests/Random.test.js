import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashString, normalizeSeed, seedToInt, randomSeedString } from '../src/utils/Random.js';
import { generateWorldName } from '../src/utils/WorldNames.js';

test('same seed gives the same sequence; different seeds differ', () => {
  const a = createRng(123);
  const b = createRng(123);
  const c = createRng(124);
  const seqA = Array.from({ length: 8 }, () => a.next());
  const seqB = Array.from({ length: 8 }, () => b.next());
  const seqC = Array.from({ length: 8 }, () => c.next());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
});

test('int() is inclusive and float() stays in range', () => {
  const rng = createRng(7);
  const ints = new Set();
  for (let i = 0; i < 500; i++) {
    const n = rng.int(3, 5);
    assert.ok(n >= 3 && n <= 5);
    ints.add(n);
    const f = rng.float(2, 4);
    assert.ok(f >= 2 && f < 4);
  }
  assert.deepEqual([...ints].sort(), [3, 4, 5]);
});

test('numeric seeds are normalised; text seeds are kept', () => {
  assert.equal(normalizeSeed(' 007 '), '7');
  assert.equal(normalizeSeed('-0'), '0');
  assert.equal(normalizeSeed('+15'), '15');
  assert.equal(normalizeSeed('Hello World'), 'Hello World');
  assert.equal(seedToInt('007'), seedToInt('7'));
  assert.notEqual(seedToInt('7'), seedToInt('8'));
  assert.equal(seedToInt('abc'), hashString('abc'));
});

test('randomSeedString is a 9-digit number', () => {
  for (let i = 0; i < 20; i++) assert.match(randomSeedString(), /^\d{9}$/);
});

test('world names look sensible', () => {
  for (let i = 0; i < 50; i++) {
    const name = generateWorldName();
    assert.match(name, /^[A-Z][a-z]+$/);
  }
  assert.equal(typeof generateWorldName(() => 0), 'string');
  assert.equal(typeof generateWorldName(() => 0.999999), 'string');
});
