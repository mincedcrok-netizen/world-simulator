/** Terrain types of the temporary Phase 1 map. */
export const TERRAIN = Object.freeze({
  DEEP_WATER: 0,
  SHALLOW_WATER: 1,
  SAND: 2,
  GRASS: 3,
  HIGHLAND: 4,
  MOUNTAIN: 5,
});

/** Index = terrain id. `color` is [r, g, b]. */
export const TERRAIN_INFO = Object.freeze([
  Object.freeze({ id: TERRAIN.DEEP_WATER, name: 'Deep water', isWater: true, color: [27, 59, 82] }),
  Object.freeze({ id: TERRAIN.SHALLOW_WATER, name: 'Shallow water', isWater: true, color: [45, 106, 128] }),
  Object.freeze({ id: TERRAIN.SAND, name: 'Sand', isWater: false, color: [200, 184, 138] }),
  Object.freeze({ id: TERRAIN.GRASS, name: 'Grassland', isWater: false, color: [95, 143, 79] }),
  Object.freeze({ id: TERRAIN.HIGHLAND, name: 'Highland', isWater: false, color: [123, 132, 86] }),
  Object.freeze({ id: TERRAIN.MOUNTAIN, name: 'Mountain', isWater: false, color: [141, 138, 128] }),
]);
