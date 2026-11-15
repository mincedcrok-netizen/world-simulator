/**
 * Deterministic random helpers. Everything that must be reproducible from a
 * world seed (map layout, later: history, names) goes through these functions,
 * never through Math.random().
 */

/** Hash an arbitrary string to an unsigned 32-bit integer (xmur3 variant). */
export function hashString(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Canonical text form of a seed. Integer-looking seeds are normalised so that
 * "007" and "7" are the same world; everything else is used as typed.
 */
export function normalizeSeed(input) {
  const text = String(input).trim();
  if (/^[+-]?\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n)) return String(n === 0 ? 0 : n); // avoids "-0"
  }
  return text;
}

/** Convert a user-supplied numeric or text seed to an unsigned 32-bit integer. */
export function seedToInt(input) {
  return hashString(normalizeSeed(input));
}

/**
 * Create a seeded pseudo-random generator (mulberry32).
 * @param {number} seed Unsigned 32-bit integer.
 */
export function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Float in [0, 1). */
    next,
    /** Float in [min, max). */
    float: (min, max) => min + next() * (max - min),
    /** Integer in [min, max] (inclusive). */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** Random element of a non-empty array. */
    pick: (items) => items[Math.floor(next() * items.length)],
    /** True with the given probability. */
    chance: (p) => next() < p,
  };
}

/** A fresh, non-deterministic numeric seed string (for "Randomize"). */
export function randomSeedString() {
  let value;
  if (globalThis.crypto?.getRandomValues) {
    value = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  } else {
    value = Math.floor(Math.random() * 4294967296);
  }
  return String(100000000 + (value % 900000000)); // always 9 digits
}
