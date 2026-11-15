import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationClock } from '../src/simulation/SimulationClock.js';

test('starts at Year 1 with no progress', () => {
  const clock = new SimulationClock({ secondsPerYear: 10 });
  assert.equal(clock.year, 1);
  assert.equal(clock.yearProgress, 0);
  assert.equal(clock.paused, false);
  assert.equal(clock.speed, 1);
});

test('advances one year per secondsPerYear of real time at 1x', () => {
  const clock = new SimulationClock({ secondsPerYear: 10 });
  assert.equal(clock.advance(9999), 0);
  assert.equal(clock.year, 1);
  assert.equal(clock.advance(1), 1);
  assert.equal(clock.year, 2);
  assert.equal(clock.yearProgress, 0);
});

test('accumulates many small steps exactly (frame rate does not matter)', () => {
  const coarse = new SimulationClock({ secondsPerYear: 10 });
  const fine = new SimulationClock({ secondsPerYear: 10 });
  for (let i = 0; i < 25; i++) coarse.advance(400); // 10 s in 400 ms steps
  for (let i = 0; i < 1000; i++) fine.advance(10); // 10 s in 10 ms steps
  assert.equal(coarse.year, 2);
  assert.equal(fine.year, 2);
  assert.equal(coarse.totalSimulatedMs, fine.totalSimulatedMs);
});

test('speed multiplies simulated time', () => {
  const clock = new SimulationClock({ secondsPerYear: 10 });
  clock.setSpeed(5);
  clock.advance(2000); // 2 s * 5 = 10 simulated seconds
  assert.equal(clock.year, 2);
  clock.setSpeed(10);
  clock.advance(3000); // 30 simulated seconds = 3 years
  assert.equal(clock.year, 5);
});

test('one advance can cross several years and reports how many', () => {
  const clock = new SimulationClock({ secondsPerYear: 1 });
  clock.setSpeed(10);
  assert.equal(clock.advance(2500), 25);
  assert.equal(clock.year, 26);
});

test('pause stops time and resume continues it', () => {
  const clock = new SimulationClock({ secondsPerYear: 10 });
  clock.advance(5000);
  clock.pause();
  assert.equal(clock.advance(60000), 0);
  assert.equal(clock.year, 1);
  assert.equal(clock.yearProgress, 0.5);
  clock.resume();
  clock.advance(5000);
  assert.equal(clock.year, 2);
});

test('rejects unsupported speeds and invalid lengths', () => {
  const clock = new SimulationClock();
  assert.throws(() => clock.setSpeed(3), RangeError);
  assert.throws(() => new SimulationClock({ secondsPerYear: 0 }), RangeError);
  assert.throws(() => new SimulationClock({ secondsPerYear: NaN }), RangeError);
  assert.throws(() => clock.setSecondsPerYear(-5), RangeError);
});

test('ignores zero, negative and non-finite deltas', () => {
  const clock = new SimulationClock({ secondsPerYear: 10 });
  assert.equal(clock.advance(0), 0);
  assert.equal(clock.advance(-100), 0);
  assert.equal(clock.advance(Infinity), 0);
  assert.equal(clock.advance(NaN), 0);
  assert.equal(clock.totalSimulatedMs, 0);
});

test('changing year length keeps the position inside the year', () => {
  const clock = new SimulationClock({ secondsPerYear: 10 });
  clock.advance(5000); // halfway
  clock.setSecondsPerYear(20);
  assert.equal(clock.year, 1);
  assert.equal(clock.yearProgress, 0.5);
  clock.advance(10000);
  assert.equal(clock.year, 2);
});
