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

import { World } from '../src/world/World.js';
import { TERRAIN } from '../src/world/terrain.js';
import { RESOURCE_KEYS } from '../src/world/resources.js';

/**
 * A tiny hand-built world for exact, controlled tests: open plains with an
 * ocean border and optional river columns. Only the layers settlements read
 * (terrain and resources) are filled in.
 *
 * @param {{ size?: number, fertile?: number, wood?: number, stone?: number, riverColumns?: number[], terrain?: number }} [options]
 */
export function createSyntheticWorld({ size = 40, fertile = 220, wood = 90, stone = 90, riverColumns = [10, 29], terrain = TERRAIN.PLAINS } = {}) {
  const tiles = new Uint8Array(size * size);
  const resources = {};
  for (const key of RESOURCE_KEYS) resources[key] = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const border = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      tiles[i] = border ? TERRAIN.DEEP_WATER : terrain;
      if (border) continue;
      resources.fertileSoil[i] = fertile;
      resources.wood[i] = wood;
      resources.stone[i] = stone;
      let nearest = 99;
      for (const c of riverColumns) nearest = Math.min(nearest, Math.abs(x - c));
      resources.freshwater[i] = nearest === 0 ? 255 : nearest <= 2 ? [0, 210, 150][nearest] : 0;
    }
  }
  return new World({ width: size, height: size, tiles, resources, seedValue: 7 });
}
