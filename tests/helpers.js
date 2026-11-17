import { generateWorld } from '../src/world/generation/WorldGenerator.js';

const cache = new Map();

/** Generate (and memoise) a world; tests share worlds to stay fast. */
export function gen(overrides = {}) {
  const config = {
    name: 'Test', seed: 'alpha', size: 'small', landmass: 'balanced', water: 'normal', variety: 'normal', ...overrides,
  };
  const key = JSON.stringify(config);
  if (!cache.has(key)) cache.set(key, generateWorld(config));
  return cache.get(key);
}

/** Cheap order-sensitive checksum of any typed array. */
export function checksum(array) {
  let h = 2166136261;
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < view.length; i++) h = Math.imul(h ^ view[i], 16777619) >>> 0;
  return h;
}

/** Checksum of everything a world stores per tile. */
export function worldChecksum(world) {
  let h = 0;
  const layers = [world.tiles, world.biomes, world.elevation, world.temperature, world.rainfall, world.moisture, world.riverDir, world.riverSize, world.lakeId];
  for (const layer of layers) h = (Math.imul(h, 31) + checksum(layer)) >>> 0;
  for (const key of Object.keys(world.resources).sort()) h = (Math.imul(h, 31) + checksum(world.resources[key])) >>> 0;
  return h;
}

/** Connected components of a boolean mask (8-neighbour). Returns an array of component sizes. */
export function componentSizes(width, height, predicate) {
  const seen = new Uint8Array(width * height);
  const sizes = [];
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !predicate(start)) continue;
    let count = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const c = stack.pop();
      count++;
      const cx = c % width;
      const cy = (c - cx) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (seen[n] || !predicate(n)) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    sizes.push(count);
  }
  return sizes;
}

export const mean = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
