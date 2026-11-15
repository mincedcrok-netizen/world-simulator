/**
 * Central configuration: constants, user-setting definitions and the
 * persistent SettingsStore.
 *
 * This module has no Phaser or DOM dependency at import time, so it can be
 * used from Node (tests, headless simulation).
 */
import { EVENTS } from '../systems/Events.js';

export const STORAGE_KEY = 'world-simulator.settings.v1';

export const SIMULATION = Object.freeze({
  /** Selectable speed multipliers. */
  SPEEDS: Object.freeze([1, 2, 5, 10]),
  DEFAULT_SPEED: 1,
  START_YEAR: 1,
  /** How often the simulation driver wakes up (independent of rendering FPS). */
  TICK_INTERVAL_MS: 50,
  /**
   * Largest real-time step a single tick may consume. Protects against a huge
   * catch-up jump after the browser throttles a background tab.
   */
  MAX_STEP_MS: 2000,
});

export const WORLD = Object.freeze({
  /** Rendered size of one map tile in world pixels. */
  TILE_SIZE: 16,
});

export const CAMERA = Object.freeze({
  MAX_ZOOM: 4,
  /** Never zoom out further than one screen pixel per tile. */
  MIN_ZOOM_FLOOR: 1 / WORLD.TILE_SIZE,
  /** Extra space around the map the camera may show, in world pixels. */
  EDGE_PADDING: 160,
  /** Zoom change per wheel pixel (exponential). */
  WHEEL_SENSITIVITY: 0.0015,
  /** Speed multiplier while Shift is held. */
  BOOST: 2.5,
});

/**
 * Definition of every user setting: type, valid range and default.
 * `sanitizeSettings` and `SettingsStore.set` both validate against this table.
 */
export const SETTING_SPECS = Object.freeze({
  secondsPerYear: Object.freeze({
    type: 'number', min: 1, max: 60, step: 1, default: 10,
    label: 'Seconds per simulated year',
  }),
  cameraSpeed: Object.freeze({
    type: 'number', min: 300, max: 2400, step: 100, default: 900,
    label: 'Camera speed',
  }),
  cameraSmoothing: Object.freeze({
    type: 'boolean', default: true,
    label: 'Smooth camera movement',
  }),
  showDebugOnStart: Object.freeze({
    type: 'boolean', default: false,
    label: 'Show debug panel on launch',
  }),
});

export function getDefaultSettings() {
  const defaults = {};
  for (const [key, spec] of Object.entries(SETTING_SPECS)) defaults[key] = spec.default;
  return defaults;
}

/**
 * Validate one setting value against its spec.
 * @returns {{ ok: true, value: number|boolean } | { ok: false, reason: string }}
 */
export function coerceSetting(key, value) {
  const spec = SETTING_SPECS[key];
  if (!spec) return { ok: false, reason: `unknown setting "${key}"` };
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') return { ok: true, value };
    return { ok: false, reason: 'expected true or false' };
  }
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false, reason: 'expected a number' };
  const clamped = Math.min(spec.max, Math.max(spec.min, n));
  const stepped = Math.round((clamped - spec.min) / spec.step) * spec.step + spec.min;
  return { ok: true, value: Math.min(spec.max, stepped) };
}

/**
 * Turn arbitrary (possibly malformed) stored data into a complete, valid
 * settings object. Invalid entries fall back to defaults and are reported on
 * the console.
 */
export function sanitizeSettings(raw) {
  const result = getDefaultSettings();
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn('[Settings] Stored settings were malformed; using defaults.');
    return result;
  }
  for (const key of Object.keys(SETTING_SPECS)) {
    if (!(key in raw)) continue;
    const checked = coerceSetting(key, raw[key]);
    if (checked.ok) result[key] = checked.value;
    else console.warn(`[Settings] Ignoring stored "${key}" (${checked.reason}); using default.`);
  }
  return result;
}

/** localStorage if it is usable, otherwise null (private mode, blocked storage, Node). */
function getBrowserStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = '__ws_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch (error) {
    console.warn('[Settings] localStorage is unavailable; settings will not be saved.', error);
    return null;
  }
}

export class SettingsStore {
  /**
   * @param {{ bus?: import('../systems/EventBus.js').EventBus|null, storage?: Storage|null }} [options]
   */
  constructor({ bus = null, storage = undefined } = {}) {
    this._bus = bus;
    this._storage = storage === undefined ? getBrowserStorage() : storage;
    this._warnedPersist = false;
    this._values = getDefaultSettings();
    this._load();
  }

  get(key) {
    if (!(key in SETTING_SPECS)) throw new Error(`Unknown setting "${key}".`);
    return this._values[key];
  }

  /** Copy of all current settings. */
  all() {
    return { ...this._values };
  }

  /**
   * Change one setting. Returns false (and logs) if the value is invalid.
   * Emits `settings:changed` and persists on success.
   */
  set(key, value) {
    const checked = coerceSetting(key, value);
    if (!checked.ok) {
      console.warn(`[Settings] Rejected "${key}": ${checked.reason}.`);
      return false;
    }
    if (this._values[key] === checked.value) return true;
    this._values[key] = checked.value;
    this._persist();
    this._bus?.emit(EVENTS.SETTINGS_CHANGED, { key, value: checked.value, settings: this.all() });
    return true;
  }

  /** Restore every setting to its default value. */
  reset() {
    const defaults = getDefaultSettings();
    for (const [key, value] of Object.entries(defaults)) this.set(key, value);
  }

  _load() {
    if (!this._storage) return;
    let raw;
    try {
      raw = this._storage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn('[Settings] Could not read saved settings; using defaults.', error);
      return;
    }
    if (raw === null) return;
    try {
      this._values = sanitizeSettings(JSON.parse(raw));
    } catch (error) {
      console.warn('[Settings] Saved settings are not valid JSON; using defaults.', error);
      this._values = getDefaultSettings();
      this._persist();
    }
  }

  _persist() {
    if (!this._storage) return;
    try {
      this._storage.setItem(STORAGE_KEY, JSON.stringify(this._values));
    } catch (error) {
      if (!this._warnedPersist) {
        this._warnedPersist = true;
        console.warn('[Settings] Could not save settings (storage full or blocked).', error);
      }
    }
  }
}
