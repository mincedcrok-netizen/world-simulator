/**
 * Biomes: the climate zone of a tile (from temperature, moisture and
 * elevation). Terrain (terrain.js) is derived from biome plus elevation.
 */
export const BIOME = Object.freeze({
  OCEAN: 0,
  LAKE: 1,
  ICE: 2,
  TUNDRA: 3,
  TAIGA: 4,
  GRASSLAND: 5,
  TEMPERATE_FOREST: 6,
  RAINFOREST: 7,
  SAVANNA: 8,
  DESERT: 9,
  SWAMP: 10,
  ALPINE: 11,
});

/** Index = biome id. */
export const BIOME_INFO = Object.freeze([
  Object.freeze({ id: BIOME.OCEAN, name: 'Ocean', color: [30, 80, 110] }),
  Object.freeze({ id: BIOME.LAKE, name: 'Lake', color: [62, 126, 158] }),
  Object.freeze({ id: BIOME.ICE, name: 'Ice cap', color: [236, 240, 244] }),
  Object.freeze({ id: BIOME.TUNDRA, name: 'Tundra', color: [150, 160, 132] }),
  Object.freeze({ id: BIOME.TAIGA, name: 'Taiga', color: [48, 88, 70] }),
  Object.freeze({ id: BIOME.GRASSLAND, name: 'Temperate grassland', color: [118, 152, 82] }),
  Object.freeze({ id: BIOME.TEMPERATE_FOREST, name: 'Temperate forest', color: [62, 104, 54] }),
  Object.freeze({ id: BIOME.RAINFOREST, name: 'Tropical rainforest', color: [26, 84, 46] }),
  Object.freeze({ id: BIOME.SAVANNA, name: 'Savanna', color: [170, 164, 92] }),
  Object.freeze({ id: BIOME.DESERT, name: 'Desert', color: [216, 188, 124] }),
  Object.freeze({ id: BIOME.SWAMP, name: 'Swamp', color: [78, 104, 76] }),
  Object.freeze({ id: BIOME.ALPINE, name: 'Alpine', color: [128, 120, 112] }),
]);
