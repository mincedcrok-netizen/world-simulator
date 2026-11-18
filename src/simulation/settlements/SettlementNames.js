const PREFIXES = [
  'Ash', 'Bram', 'Cold', 'Dun', 'Elm', 'Fair', 'Glen', 'High', 'Iron', 'Kings', 'Low', 'Mill', 'North',
  'Oak', 'Pine', 'Red', 'Stone', 'Thorn', 'West', 'Wolf', 'Black', 'Green', 'Swan', 'Heath',
];
const SUFFIXES = [
  'brook', 'by', 'dale', 'field', 'ford', 'haven', 'holm', 'mere', 'stead', 'ton', 'wick', 'wood',
  'water', 'gate', 'moor', 'bury',
];
const NUMERALS = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * Produces unique, deterministic settlement names from a seeded rng
 * (`rng.next()` -> [0,1)). A repeated name gets a numeral ("Oakford II").
 */
export class SettlementNamer {
  constructor(rng) {
    this._rng = rng;
    this._used = new Set();
  }

  next() {
    const rng = this._rng;
    for (let attempt = 0; attempt < 12; attempt++) {
      const name = PREFIXES[Math.floor(rng.next() * PREFIXES.length)] + SUFFIXES[Math.floor(rng.next() * SUFFIXES.length)];
      if (!this._used.has(name)) {
        this._used.add(name);
        return name;
      }
    }
    // Every combination tried was taken: number a base name.
    const base = PREFIXES[Math.floor(rng.next() * PREFIXES.length)] + SUFFIXES[Math.floor(rng.next() * SUFFIXES.length)];
    for (const numeral of NUMERALS) {
      const name = `${base} ${numeral}`;
      if (!this._used.has(name)) {
        this._used.add(name);
        return name;
      }
    }
    let n = NUMERALS.length + 2;
    while (this._used.has(`${base} ${n}`)) n++;
    const name = `${base} ${n}`;
    this._used.add(name);
    return name;
  }
}
