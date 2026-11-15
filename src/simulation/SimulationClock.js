/**
 * Simulation time: years advance from *real elapsed time*, never from frame
 * counts. The clock itself is a pure object - it does not read a timer. The
 * owner (Simulation) tells it how many real milliseconds have passed, which
 * makes the clock deterministic and trivial to test.
 *
 * Time model
 *   one simulated year = `secondsPerYear` real seconds at 1x speed
 *   simulated time advances by  realDelta * speed
 */
import { SIMULATION } from '../config/settings.js';

export class SimulationClock {
  /**
   * @param {{ secondsPerYear?: number, startYear?: number }} [options]
   */
  constructor({ secondsPerYear = 10, startYear = SIMULATION.START_YEAR } = {}) {
    SimulationClock._assertSecondsPerYear(secondsPerYear);
    if (!Number.isInteger(startYear)) throw new RangeError('startYear must be an integer.');
    this._yearLengthMs = secondsPerYear * 1000;
    this._startYear = startYear;
    this._year = startYear;
    this._yearProgressMs = 0; // simulated ms elapsed inside the current year
    this._totalSimMs = 0;
    this._paused = false;
    this._speed = SIMULATION.DEFAULT_SPEED;
  }

  /** Current year (the simulation begins at Year 1). */
  get year() { return this._year; }
  /** Progress through the current year, 0 (inclusive) to 1 (exclusive). */
  get yearProgress() { return this._yearProgressMs / this._yearLengthMs; }
  get paused() { return this._paused; }
  get speed() { return this._speed; }
  get secondsPerYear() { return this._yearLengthMs / 1000; }
  /** Total simulated milliseconds since the clock started (speed-scaled). */
  get totalSimulatedMs() { return this._totalSimMs; }

  pause() { this._paused = true; }
  resume() { this._paused = false; }

  /** @param {number} speed One of SIMULATION.SPEEDS. */
  setSpeed(speed) {
    if (!SIMULATION.SPEEDS.includes(speed)) {
      throw new RangeError(`Unsupported speed ${speed}; use one of ${SIMULATION.SPEEDS.join(', ')}.`);
    }
    this._speed = speed;
  }

  /**
   * Change the real-time length of a simulated year. The position inside the
   * current year is preserved proportionally, so the year never jumps.
   */
  setSecondsPerYear(secondsPerYear) {
    SimulationClock._assertSecondsPerYear(secondsPerYear);
    const fraction = this._yearProgressMs / this._yearLengthMs;
    this._yearLengthMs = secondsPerYear * 1000;
    this._yearProgressMs = fraction * this._yearLengthMs;
  }

  /**
   * Advance by `realDeltaMs` of real time. Does nothing while paused.
   * @returns {number} Whole years that elapsed during this call (usually 0 or 1).
   */
  advance(realDeltaMs) {
    if (this._paused) return 0;
    if (!Number.isFinite(realDeltaMs) || realDeltaMs <= 0) return 0;

    const simMs = realDeltaMs * this._speed;
    this._totalSimMs += simMs;
    this._yearProgressMs += simMs;
    if (this._yearProgressMs < this._yearLengthMs) return 0;

    const years = Math.floor(this._yearProgressMs / this._yearLengthMs);
    this._yearProgressMs -= years * this._yearLengthMs;
    this._year += years;
    return years;
  }

  static _assertSecondsPerYear(value) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`secondsPerYear must be a positive number (got ${value}).`);
    }
  }
}
