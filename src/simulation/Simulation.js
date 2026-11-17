/**
 * The simulation engine. It owns the clock, the world state and the terrain,
 * and talks to everything else exclusively through the EventBus. It has no
 * Phaser or DOM dependency and can run headlessly (see tests/).
 *
 * Time source: its own timer + `performance.now()` deltas. It is NOT driven by
 * the render loop, so a slow frame rate never slows the simulation down.
 *
 * Events emitted: see EVENTS.SIM_*. Commands accepted: see EVENTS.CMD_SIM_*.
 */
import { SIMULATION } from '../config/settings.js';
import { validateWorldConfig } from '../config/worldOptions.js';
import { EventBus } from '../systems/EventBus.js';
import { EVENTS } from '../systems/Events.js';
import { generateWorld } from '../world/generation/WorldGenerator.js';
import { SimulationClock } from './SimulationClock.js';
import { WorldState } from './WorldState.js';

const defaultTimeSource = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const defaultScheduler = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
};

export class Simulation {
  /**
   * @param {Object} [options]
   * @param {EventBus|null} [options.bus]
   * @param {number} [options.secondsPerYear]
   * @param {() => number} [options.timeSource]   Returns milliseconds; injectable for tests.
   * @param {{setInterval: Function, clearInterval: Function}} [options.scheduler]
   * @param {number} [options.tickIntervalMs]
   * @param {number} [options.maxStepMs]
   */
  constructor({
    bus = null,
    secondsPerYear = 10,
    timeSource = defaultTimeSource,
    scheduler = defaultScheduler,
    tickIntervalMs = SIMULATION.TICK_INTERVAL_MS,
    maxStepMs = SIMULATION.MAX_STEP_MS,
  } = {}) {
    this.bus = bus ?? new EventBus();
    this.clock = new SimulationClock({ secondsPerYear });
    /** @type {WorldState|null} */
    this.worldState = null;
    /** @type {import('../world/World.js').World|null} */
    this.world = null;

    this._time = timeSource;
    this._scheduler = scheduler;
    this._tickIntervalMs = tickIntervalMs;
    this._maxStepMs = maxStepMs;
    this._timer = null;
    this._lastTime = 0;
    this._unsubscribers = [];
    // Reused for every tick event to avoid allocating at 20 Hz. Treat as read-only.
    this._tickPayload = { year: 1, yearProgress: 0, paused: false, speed: 1 };
  }

  get running() { return this._timer !== null; }

  /**
   * Create the world from a world-creation config.
   * @throws {Error} if the config is invalid.
   */
  initialize(worldConfig) {
    const validation = validateWorldConfig(worldConfig);
    if (!validation.ok) {
      throw new Error(`Invalid world configuration: ${Object.values(validation.errors).join(' ')}`);
    }
    const config = validation.value;
    this.worldState = new WorldState(config);
    this.world = generateWorld(config); // procedural generation (Phase 2)
    this.clock = new SimulationClock({ secondsPerYear: this.clock.secondsPerYear });
    this.worldState.year = this.clock.year;
    console.info(
      `[Simulation] Initialized "${config.name}" (seed ${config.seed}, ${config.tiles}x${config.tiles} tiles, generated in ${this.world.generationMs} ms).`,
    );
    this.bus.emit(EVENTS.SIM_INITIALIZED, { worldState: this.worldState, snapshot: this.snapshot() });
  }

  /** Begin advancing time. Calling it while already running does nothing. */
  start() {
    if (!this.worldState) throw new Error('Simulation.initialize() must be called before start().');
    if (this._timer !== null) return;
    this._lastTime = this._time();
    this._bindListeners();
    this._timer = this._scheduler.setInterval(() => this.tick(), this._tickIntervalMs);
    console.info('[Simulation] Started.');
    this.bus.emit(EVENTS.SIM_STARTED, { snapshot: this.snapshot() });
  }

  /** Stop the driver and detach from the bus. */
  stop() {
    if (this._timer === null) return;
    this._scheduler.clearInterval(this._timer);
    this._timer = null;
    for (const unsubscribe of this._unsubscribers) unsubscribe();
    this._unsubscribers = [];
    console.info('[Simulation] Stopped.');
    this.bus.emit(EVENTS.SIM_STOPPED);
  }

  /**
   * Consume the real time elapsed since the previous tick. Called by the
   * internal timer; tests call it directly with a fake time.
   * @returns {number} Whole years that elapsed.
   */
  tick(now = this._time()) {
    const delta = now - this._lastTime;
    this._lastTime = now;
    if (!(delta > 0) || this.clock.paused) return 0;

    const previousYear = this.clock.year;
    const years = this.clock.advance(Math.min(delta, this._maxStepMs));

    if (years > 0) {
      this.worldState.year = this.clock.year;
      this.bus.emit(EVENTS.SIM_YEAR_CHANGED, { year: this.clock.year, previousYear, yearsElapsed: years });
    }
    const payload = this._tickPayload;
    payload.year = this.clock.year;
    payload.yearProgress = this.clock.yearProgress;
    payload.paused = false;
    payload.speed = this.clock.speed;
    this.bus.emit(EVENTS.SIM_TICK, payload);
    return years;
  }

  pause() {
    if (this.clock.paused) return false;
    this._flush(); // credit time that passed since the last tick
    this.clock.pause();
    this.bus.emit(EVENTS.SIM_PAUSED, { snapshot: this.snapshot() });
    return true;
  }

  resume() {
    if (!this.clock.paused) return false;
    this._lastTime = this._time(); // time spent paused must not count
    this.clock.resume();
    this.bus.emit(EVENTS.SIM_RESUMED, { snapshot: this.snapshot() });
    return true;
  }

  togglePause() {
    return this.clock.paused ? this.resume() : this.pause();
  }

  /** @returns {boolean} False if the speed is unsupported or unchanged. */
  setSpeed(speed) {
    if (!SIMULATION.SPEEDS.includes(speed)) {
      console.warn(`[Simulation] Ignoring unsupported speed: ${speed}`);
      return false;
    }
    if (speed === this.clock.speed) return false;
    this._flush(); // time before this moment still counts at the old speed
    this.clock.setSpeed(speed);
    this.bus.emit(EVENTS.SIM_SPEED_CHANGED, { speed, snapshot: this.snapshot() });
    return true;
  }

  setSecondsPerYear(seconds) {
    this._flush();
    this.clock.setSecondsPerYear(seconds);
  }

  snapshot() {
    return {
      year: this.clock.year,
      yearProgress: this.clock.yearProgress,
      paused: this.clock.paused,
      speed: this.clock.speed,
      secondsPerYear: this.clock.secondsPerYear,
    };
  }

  _flush() {
    if (this._timer !== null) this.tick();
  }

  _bindListeners() {
    const bus = this.bus;
    this._unsubscribers.push(
      bus.on(EVENTS.CMD_SIM_PAUSE, () => this.pause()),
      bus.on(EVENTS.CMD_SIM_RESUME, () => this.resume()),
      bus.on(EVENTS.CMD_SIM_TOGGLE_PAUSE, () => this.togglePause()),
      bus.on(EVENTS.CMD_SIM_SET_SPEED, (payload) => this.setSpeed(payload?.speed)),
      bus.on(EVENTS.SETTINGS_CHANGED, ({ key, value }) => {
        if (key === 'secondsPerYear') this.setSecondsPerYear(value);
      }),
    );
  }
}
