import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation/Simulation.js';
import { EventBus } from '../src/systems/EventBus.js';
import { EVENTS } from '../src/systems/Events.js';
import { createDefaultWorldConfig } from '../src/config/worldOptions.js';

/** Simulation with a fake clock and timer so tests are instant and deterministic. */
function createHarness(overrides = {}) {
  let now = 1000;
  let intervalFn = null;
  const bus = new EventBus();
  const events = [];
  for (const name of Object.values(EVENTS)) bus.on(name, (payload) => events.push([name, payload]));
  const sim = new Simulation({
    bus,
    secondsPerYear: 10,
    timeSource: () => now,
    scheduler: {
      setInterval: (fn) => { intervalFn = fn; return 1; },
      clearInterval: () => { intervalFn = null; },
    },
    ...overrides,
  });
  const config = { ...createDefaultWorldConfig(), size: 'small', seed: 'test-seed' };
  sim.initialize(config);
  return {
    sim, bus, events,
    /** Move time forward the way the real 50 ms timer would: in many small ticks. */
    advance(ms) {
      let remaining = ms;
      while (remaining > 0) {
        const step = Math.min(remaining, 500);
        now += step;
        sim.tick(now);
        remaining -= step;
      }
    },
    /** Move time forward WITHOUT ticking (e.g. a stalled/throttled timer). */
    skip(ms) { now += ms; },
    /** One single tick after a long gap. */
    tickAfter(ms) { now += ms; sim.tick(now); },
    get hasTimer() { return intervalFn !== null; },
    names: () => events.map(([n]) => n),
  };
}

const quiet = () => { console.info = () => {}; };
quiet();

test('start requires initialize; initialize rejects bad config', () => {
  const sim = new Simulation();
  assert.throws(() => sim.start(), /initialize/);
  assert.throws(() => sim.initialize({ name: '' }), /Invalid world configuration/);
});

test('runs headlessly: year advances from time, not frames', () => {
  const h = createHarness();
  h.sim.start();
  assert.equal(h.hasTimer, true);
  h.advance(9950);
  assert.equal(h.sim.clock.year, 1);
  h.advance(50);
  assert.equal(h.sim.clock.year, 2);
  assert.equal(h.sim.worldState.year, 2);
  const yearEvents = h.events.filter(([n]) => n === EVENTS.SIM_YEAR_CHANGED);
  assert.equal(yearEvents.length, 1);
  assert.deepEqual(yearEvents[0][1], { year: 2, previousYear: 1, yearsElapsed: 1 });
});

test('pause/resume via commands; paused time is not credited', () => {
  const h = createHarness();
  h.sim.start();
  h.advance(4000);
  h.bus.emit(EVENTS.CMD_SIM_PAUSE);
  assert.equal(h.sim.clock.paused, true);
  h.advance(60000);
  assert.equal(h.sim.clock.year, 1);
  h.bus.emit(EVENTS.CMD_SIM_RESUME);
  h.advance(6000); // 4 s + 6 s = 10 s of running time
  assert.equal(h.sim.clock.year, 2);
  assert.ok(h.names().includes(EVENTS.SIM_PAUSED));
  assert.ok(h.names().includes(EVENTS.SIM_RESUMED));
});

test('toggle command flips state', () => {
  const h = createHarness();
  h.sim.start();
  h.bus.emit(EVENTS.CMD_SIM_TOGGLE_PAUSE);
  assert.equal(h.sim.clock.paused, true);
  h.bus.emit(EVENTS.CMD_SIM_TOGGLE_PAUSE);
  assert.equal(h.sim.clock.paused, false);
});

test('speed command: valid speeds apply, invalid are ignored', () => {
  const h = createHarness();
  const warn = console.warn;
  console.warn = () => {};
  h.sim.start();
  h.bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: 5 });
  assert.equal(h.sim.clock.speed, 5);
  h.bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: 7 });
  h.bus.emit(EVENTS.CMD_SIM_SET_SPEED, undefined);
  console.warn = warn;
  assert.equal(h.sim.clock.speed, 5);
  h.advance(2000); // 2 s * 5x = one year
  assert.equal(h.sim.clock.year, 2);
});

test('time before a speed change is credited at the old speed', () => {
  const h = createHarness();
  h.sim.start();
  h.skip(1500); // 1.5 s passes with no tick...
  h.bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: 10 }); // ...then speed changes
  assert.equal(h.sim.clock.totalSimulatedMs, 1500); // counted at 1x, not 10x
  h.advance(100);
  assert.equal(h.sim.clock.totalSimulatedMs, 1500 + 1000); // 100 ms at 10x
});

test('time spent paused is never credited, even without a tick at resume', () => {
  const h = createHarness();
  h.sim.start();
  h.advance(1000);
  h.bus.emit(EVENTS.CMD_SIM_PAUSE);
  h.skip(30000);
  h.bus.emit(EVENTS.CMD_SIM_RESUME);
  h.advance(500);
  assert.equal(h.sim.clock.totalSimulatedMs, 1500);
});

test('a long stall is capped by maxStepMs', () => {
  const h = createHarness({ maxStepMs: 2000 });
  h.sim.start();
  h.tickAfter(600000); // ten minutes of "throttled tab" in one tick
  assert.equal(h.sim.clock.totalSimulatedMs, 2000);
});

test('changing secondsPerYear through settings event does not jump the year', () => {
  const h = createHarness();
  h.sim.start();
  h.advance(5000);
  h.bus.emit(EVENTS.SETTINGS_CHANGED, { key: 'secondsPerYear', value: 20 });
  assert.equal(h.sim.clock.year, 1);
  assert.equal(h.sim.clock.yearProgress, 0.5); // position inside the year is preserved
});

test('stop() clears the timer and detaches every listener', () => {
  const h = createHarness();
  h.sim.start();
  h.sim.stop();
  assert.equal(h.hasTimer, false);
  for (const name of [
    EVENTS.CMD_SIM_PAUSE, EVENTS.CMD_SIM_RESUME, EVENTS.CMD_SIM_TOGGLE_PAUSE,
    EVENTS.CMD_SIM_SET_SPEED, EVENTS.SETTINGS_CHANGED,
  ]) {
    // The harness itself listens to every event once, so only the simulation's own would add more.
    assert.equal(h.bus.listenerCount(name), 1, `${name} still has simulation listeners`);
  }
  assert.ok(h.names().includes(EVENTS.SIM_STOPPED));
});

test('initialize produces a world with land and water and placeholder stats', () => {
  const h = createHarness();
  assert.ok(h.sim.world.landRatio() > 0.03 && h.sim.world.landRatio() < 0.9);
  assert.equal(h.sim.worldState.civilizationCount, 0);
  // Phase 3: population is no longer a placeholder; it is the live total of all settlements.
  assert.equal(h.sim.worldState.population, Math.round(h.sim.settlements.totalPopulation));
  assert.equal(h.sim.worldState.year, 1);
});
