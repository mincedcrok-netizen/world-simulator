import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/systems/EventBus.js';

test('on/emit passes payload and returns call count', () => {
  const bus = new EventBus();
  const seen = [];
  bus.on('a', (p) => seen.push(p));
  assert.equal(bus.emit('a', 42), 1);
  assert.deepEqual(seen, [42]);
  assert.equal(bus.emit('nobody-listens'), 0);
});

test('unsubscribe function and off() remove listeners', () => {
  const bus = new EventBus();
  let calls = 0;
  const handler = () => calls++;
  const unsubscribe = bus.on('a', handler);
  bus.emit('a');
  unsubscribe();
  bus.emit('a');
  assert.equal(calls, 1);

  bus.on('a', handler);
  assert.equal(bus.off('a', handler), true);
  assert.equal(bus.off('a', handler), false);
  assert.equal(bus.listenerCount('a'), 0);
});

test('once() fires a single time', () => {
  const bus = new EventBus();
  let calls = 0;
  bus.once('a', () => calls++);
  bus.emit('a');
  bus.emit('a');
  assert.equal(calls, 1);
  assert.equal(bus.listenerCount('a'), 0);
});

test('a listener may unsubscribe itself or others during emit', () => {
  const bus = new EventBus();
  const order = [];
  let offSecond;
  bus.on('a', () => { order.push('first'); offSecond(); });
  offSecond = bus.on('a', () => order.push('second'));
  bus.on('a', () => order.push('third'));
  bus.emit('a');
  assert.deepEqual(order, ['first', 'third']);
});

test('a throwing handler is logged, reported and does not block others', () => {
  const reported = [];
  const bus = new EventBus({ onHandlerError: (err, name) => reported.push([err.message, name]) });
  let reached = false;
  bus.on('a', () => { throw new Error('boom'); });
  bus.on('a', () => { reached = true; });
  const originalError = console.error;
  console.error = () => {};
  try { bus.emit('a'); } finally { console.error = originalError; }
  assert.equal(reached, true);
  assert.deepEqual(reported, [['boom', 'a']]);
});

test('context is applied and bad arguments throw', () => {
  const bus = new EventBus();
  const ctx = { n: 0 };
  bus.on('a', function () { this.n++; }, ctx);
  bus.emit('a');
  assert.equal(ctx.n, 1);
  assert.throws(() => bus.on('', () => {}), TypeError);
  assert.throws(() => bus.on('a', 'nope'), TypeError);
});

test('clear() removes listeners', () => {
  const bus = new EventBus();
  bus.on('a', () => {});
  bus.on('b', () => {});
  bus.clear('a');
  assert.equal(bus.listenerCount('a'), 0);
  assert.equal(bus.listenerCount('b'), 1);
  bus.clear();
  assert.equal(bus.listenerCount('b'), 0);
});
