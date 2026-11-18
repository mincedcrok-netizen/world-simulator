/**
 * Plain, serialisable data describing a world. Rendering code reads it; only
 * the Simulation writes it. Later phases add civilizations, populations, etc.
 * here, so it is kept free of behaviour and of Phaser/DOM references.
 */
export class WorldState {
  /** @param {import('../config/worldOptions.js').WorldConfig} config */
  constructor(config) {
    this.name = config.name;
    this.seed = config.seed;
    this.seedValue = config.seedValue;
    this.size = config.size;
    this.tiles = config.tiles;
    this.landmass = config.landmass;
    this.water = config.water;
    this.variety = config.variety;

    this.year = 1;
    // Civilizations do not exist yet (later phase). Population and settlements are live (Phase 3).
    this.civilizationCount = 0;
    this.population = 0;
    this.settlementCount = 0;
  }

  toJSON() {
    return { ...this };
  }
}
