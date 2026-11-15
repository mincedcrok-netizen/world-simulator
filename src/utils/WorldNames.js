const PREFIXES = [
  'Ald', 'Bran', 'Cael', 'Dor', 'Esk', 'Fen', 'Gal', 'Hal', 'Ith', 'Kor', 'Lor', 'Mar',
  'Nor', 'Oth', 'Pel', 'Ravn', 'Sel', 'Tor', 'Ul', 'Ves', 'Wyn', 'Yar', 'Zan', 'Ash',
];
const SUFFIXES = [
  'mere', 'dun', 'heim', 'land', 'oria', 'ara', 'thal', 'ven', 'gard', 'mark', 'ia', 'os',
  'ion', 'wyn', 'dor', 'esh',
];

/**
 * Generate a plausible default world name such as "Veloria" or "Torheim".
 * @param {() => number} [random] Returns a float in [0, 1). Defaults to Math.random.
 */
export function generateWorldName(random = Math.random) {
  const prefix = PREFIXES[Math.floor(random() * PREFIXES.length)];
  const suffix = SUFFIXES[Math.floor(random() * SUFFIXES.length)];
  return prefix + suffix;
}
