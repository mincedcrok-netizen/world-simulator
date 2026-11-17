/**
 * Terrain types: what a tile physically is. One value per tile in
 * `world.tiles`. Ids 0-5 are unchanged from Phase 1 (HIGHLAND was renamed
 * HILLS); Phase 2 appends the rest. Water types are 0, 1 and 13.
 */
export const TERRAIN = Object.freeze({
  DEEP_WATER: 0,
  SHALLOW_WATER: 1,
  SAND: 2,
  GRASS: 3,
  HILLS: 4,
  MOUNTAIN: 5,
  PLAINS: 6,
  FOREST: 7,
  DENSE_FOREST: 8,
  DESERT: 9,
  TUNDRA: 10,
  SNOW: 11,
  SWAMP: 12,
  LAKE: 13,
});

/** Index = terrain id. `color` is a representative [r, g, b] (the painter refines it per tile). */
export const TERRAIN_INFO = Object.freeze([
  Object.freeze({ id: TERRAIN.DEEP_WATER, name: 'Deep ocean', isWater: true, color: [16, 46, 78] }),
  Object.freeze({ id: TERRAIN.SHALLOW_WATER, name: 'Shallow ocean', isWater: true, color: [52, 125, 150] }),
  Object.freeze({ id: TERRAIN.SAND, name: 'Beach', isWater: false, color: [212, 196, 150] }),
  Object.freeze({ id: TERRAIN.GRASS, name: 'Grassland', isWater: false, color: [104, 150, 78] }),
  Object.freeze({ id: TERRAIN.HILLS, name: 'Hills', isWater: false, color: [128, 130, 92] }),
  Object.freeze({ id: TERRAIN.MOUNTAIN, name: 'Mountains', isWater: false, color: [128, 120, 112] }),
  Object.freeze({ id: TERRAIN.PLAINS, name: 'Plains', isWater: false, color: [160, 166, 94] }),
  Object.freeze({ id: TERRAIN.FOREST, name: 'Forest', isWater: false, color: [60, 104, 54] }),
  Object.freeze({ id: TERRAIN.DENSE_FOREST, name: 'Dense forest', isWater: false, color: [34, 78, 46] }),
  Object.freeze({ id: TERRAIN.DESERT, name: 'Desert', isWater: false, color: [216, 188, 124] }),
  Object.freeze({ id: TERRAIN.TUNDRA, name: 'Tundra', isWater: false, color: [150, 160, 132] }),
  Object.freeze({ id: TERRAIN.SNOW, name: 'Snow', isWater: false, color: [238, 242, 246] }),
  Object.freeze({ id: TERRAIN.SWAMP, name: 'Swamp', isWater: false, color: [78, 104, 76] }),
  Object.freeze({ id: TERRAIN.LAKE, name: 'Lake', isWater: true, color: [62, 126, 158] }),
]);
