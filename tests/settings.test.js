import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SettingsStore, sanitizeSettings, coerceSetting, getDefaultSettings, STORAGE_KEY,
} from '../src/config/settings.js';
import { EventBus } from '../src/systems/EventBus.js';
import { EVENTS } from '../src/systems/Events.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const silence = (fn) => {
  const warn = console.warn;
  console.warn = () => {};
  try { return fn(); } finally { console.warn = warn; }
};

test('defaults are used when nothing is stored', () => {
  const store = new SettingsStore({ storage: fakeStorage() });
  assert.deepEqual(store.all(), getDefaultSettings());
  assert.equal(store.get('secondsPerYear'), 10);
});

test('numbers are clamped and snapped to their step; bad types rejected', () => {
  assert.deepEqual(coerceSetting('secondsPerYear', 999), { ok: true, value: 60 });
  assert.deepEqual(coerceSetting('secondsPerYear', -4), { ok: true, value: 1 });
  assert.deepEqual(coerceSetting('secondsPerYear', '12'), { ok: true, value: 12 });
  assert.deepEqual(coerceSetting('cameraSpeed', 951), { ok: true, value: 1000 });
  assert.equal(coerceSetting('secondsPerYear', 'abc').ok, false);
  assert.equal(coerceSetting('secondsPerYear', NaN).ok, false);
  assert.equal(coerceSetting('cameraSmoothing', 'yes').ok, false);
  assert.equal(coerceSetting('nope', 1).ok, false);
});

test('malformed stored data falls back to defaults, keeping valid fields', () => {
  silence(() => {
    assert.deepEqual(sanitizeSettings(null), getDefaultSettings());
    assert.deepEqual(sanitizeSettings([1, 2]), getDefaultSettings());
    const mixed = sanitizeSettings({ secondsPerYear: 'bad', cameraSpeed: 1500, extra: true, cameraSmoothing: 5 });
    assert.equal(mixed.secondsPerYear, 10);
    assert.equal(mixed.cameraSpeed, 1500);
    assert.equal(mixed.cameraSmoothing, true);
    assert.equal('extra' in mixed, false);
  });
});

test('corrupt JSON in storage is replaced by defaults', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });
  const store = silence(() => new SettingsStore({ storage }));
  assert.deepEqual(store.all(), getDefaultSettings());
  assert.equal(storage.data[STORAGE_KEY], JSON.stringify(getDefaultSettings()));
});

test('set() persists, emits and validates', () => {
  const storage = fakeStorage();
  const bus = new EventBus();
  const changes = [];
  bus.on(EVENTS.SETTINGS_CHANGED, (c) => changes.push(c));
  const store = new SettingsStore({ bus, storage });

  assert.equal(store.set('secondsPerYear', 20), true);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].key, 'secondsPerYear');
  assert.equal(changes[0].value, 20);
  assert.equal(JSON.parse(storage.data[STORAGE_KEY]).secondsPerYear, 20);

  assert.equal(store.set('secondsPerYear', 20), true); // unchanged: no event
  assert.equal(changes.length, 1);
  assert.equal(silence(() => store.set('secondsPerYear', 'abc')), false);
  assert.equal(store.get('secondsPerYear'), 20);

  const reloaded = new SettingsStore({ storage });
  assert.equal(reloaded.get('secondsPerYear'), 20);
});

test('reset() restores defaults; unknown keys throw on get()', () => {
  const store = new SettingsStore({ storage: fakeStorage() });
  store.set('cameraSmoothing', false);
  store.reset();
  assert.deepEqual(store.all(), getDefaultSettings());
  assert.throws(() => store.get('nope'), /Unknown setting/);
});

test('works without any storage (private mode / blocked)', () => {
  const store = new SettingsStore({ storage: null });
  assert.equal(store.set('cameraSpeed', 1200), true);
  assert.equal(store.get('cameraSpeed'), 1200);
});

test('a storage that throws never crashes the store', () => {
  const broken = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => {},
  };
  silence(() => {
    const store = new SettingsStore({ storage: broken });
    assert.equal(store.set('cameraSpeed', 1200), true);
    assert.equal(store.get('cameraSpeed'), 1200);
  });
});
