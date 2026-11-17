/**
 * Natural resources. Phase 2 only generates where they are; nothing can be
 * mined, harvested or consumed yet.
 *
 * Each resource is stored per tile as a Uint8 "richness" from 0 (absent) to
 * 255 (richest), in `world.resources[key]`.
 */
export const RESOURCE = Object.freeze({
  STONE: 'stone',
  WOOD: 'wood',
  IRON: 'iron',
  COPPER: 'copper',
  GOLD: 'gold',
  FERTILE_SOIL: 'fertileSoil',
  FRESHWATER: 'freshwater',
  COAL: 'coal',
});

export const RESOURCE_KEYS = Object.freeze(Object.values(RESOURCE));

export const RESOURCE_INFO = Object.freeze({
  [RESOURCE.STONE]: Object.freeze({ name: 'Stone', kind: 'material' }),
  [RESOURCE.WOOD]: Object.freeze({ name: 'Wood', kind: 'material' }),
  [RESOURCE.IRON]: Object.freeze({ name: 'Iron ore', kind: 'ore' }),
  [RESOURCE.COPPER]: Object.freeze({ name: 'Copper ore', kind: 'ore' }),
  [RESOURCE.GOLD]: Object.freeze({ name: 'Gold', kind: 'ore' }),
  [RESOURCE.FERTILE_SOIL]: Object.freeze({ name: 'Fertile soil', kind: 'land' }),
  [RESOURCE.FRESHWATER]: Object.freeze({ name: 'Freshwater', kind: 'water' }),
  [RESOURCE.COAL]: Object.freeze({ name: 'Coal', kind: 'ore' }),
});

/** Resources that occur as discrete clustered deposits (listed in `world.deposits`). */
export const ORE_KEYS = Object.freeze([RESOURCE.IRON, RESOURCE.COPPER, RESOURCE.GOLD, RESOURCE.COAL]);

/** Richness at or above this counts as "present". */
export const RESOURCE_PRESENT = 40;
