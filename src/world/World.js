/**
 * A generated world: dimensions plus per-tile data stored in typed arrays
 * (row-major, index = y * width + x). Pure data with no Phaser dependency, so
 * the simulation owns and queries it headlessly. Drawing it is the renderer's
 * job. Create one with `generateWorld(config)` (world/generation/WorldGenerator.js).
 *
 * Per-tile layers (all optional so small hand-built worlds still work):
 *   tiles        terrain id (TERRAIN)         Uint8Array
 *   biomes       biome id (BIOME)             Uint8Array
 *   elevation    0..1, sea level = 0.5        Float32Array
 *   temperature  degrees Celsius              Int8Array
 *   rainfall     0..255                       Uint8Array
 *   moisture     0..255                       Uint8Array
 *   riverDir     0 = no river, 1-8 = flow direction to the next tile (see grid.js)
 *   riverSize    0 = none, 1..3 = small..large
 *   lakeId       0 = none, otherwise index into `lakes` (1-based)
 *   resources    { stone, wood, iron, copper, gold, fertileSoil, freshwater, coal }, each Uint8Array
 */
import { WORLD } from '../config/settings.js';
import { BIOME_INFO } from './biomes.js';
import { DIR_DX, DIR_DY } from './grid.js';
import { RESOURCE_INFO, RESOURCE_KEYS, RESOURCE_PRESENT } from './resources.js';
import { SEA_LEVEL } from './worldConstants.js';
import { TERRAIN_INFO } from './terrain.js';

export class World {
  /**
   * @param {{ width: number, height: number, tiles: Uint8Array } & Record<string, any>} data
   * @param {number} [tileSize] Rendered tile size in world pixels.
   */
  constructor(data, tileSize = WORLD.TILE_SIZE) {
    const { width, height, tiles } = data;
    if (tiles.length !== width * height) {
      throw new Error(`World tile array has ${tiles.length} entries; expected ${width * height}.`);
    }
    this.width = width;
    this.height = height;
    this.tiles = tiles;
    this.tileSize = tileSize;
    this.seaLevel = SEA_LEVEL;

    this.seed = data.seed ?? '';
    this.seedValue = data.seedValue ?? 0;
    this.elevation = data.elevation ?? null;
    this.temperature = data.temperature ?? null;
    this.rainfall = data.rainfall ?? null;
    this.moisture = data.moisture ?? null;
    this.biomes = data.biomes ?? null;
    this.riverDir = data.riverDir ?? null;
    this.riverSize = data.riverSize ?? null;
    this.flowAccumulation = data.flowAccumulation ?? null;
    this.lakeId = data.lakeId ?? null;
    this.lakes = data.lakes ?? [];
    this.resources = data.resources ?? null;
    this.deposits = data.deposits ?? [];
    this.landmasses = data.landmasses ?? [];
    this.generationMs = data.generationMs ?? 0;
    this.generationTimings = data.generationTimings ?? {};
  }

  /** Terrain ids per tile (alias of `tiles`). */
  get terrain() { return this.tiles; }

  get pixelWidth() { return this.width * this.tileSize; }
  get pixelHeight() { return this.height * this.tileSize; }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x, y) {
    return y * this.width + x;
  }

  /** Terrain id at a tile, or -1 outside the map. */
  getTile(x, y) {
    if (!this.inBounds(x, y)) return -1;
    return this.tiles[y * this.width + x];
  }

  getBiome(x, y) { return this._read(this.biomes, x, y, -1); }
  getElevation(x, y) { return this._read(this.elevation, x, y, NaN); }
  getTemperature(x, y) { return this._read(this.temperature, x, y, NaN); }
  getRainfall(x, y) { return this._read(this.rainfall, x, y, NaN); }
  getMoisture(x, y) { return this._read(this.moisture, x, y, NaN); }
  getRiverSize(x, y) { return this._read(this.riverSize, x, y, 0); }
  getLakeId(x, y) { return this._read(this.lakeId, x, y, 0); }

  isWater(x, y) {
    const id = this.getTile(x, y);
    return id >= 0 && TERRAIN_INFO[id].isWater;
  }

  isRiver(x, y) { return this.getRiverSize(x, y) > 0; }
  isLake(x, y) { return this.getLakeId(x, y) > 0; }

  /** Tile that a river at (x, y) flows into, or null if there is no river here. */
  getRiverTarget(x, y) {
    if (!this.riverDir || !this.inBounds(x, y)) return null;
    const dir = this.riverDir[y * this.width + x];
    if (dir === 0) return null;
    return { x: x + DIR_DX[dir], y: y + DIR_DY[dir] };
  }

  /** Richness (0-255) of one resource at a tile. */
  getResource(key, x, y) {
    const layer = this.resources?.[key];
    return layer && this.inBounds(x, y) ? layer[y * this.width + x] : 0;
  }

  /** Resources present at a tile: [{ key, amount }] sorted richest first. */
  getResourcesAt(x, y, minAmount = RESOURCE_PRESENT) {
    const found = [];
    for (const key of RESOURCE_KEYS) {
      const amount = this.getResource(key, x, y);
      if (amount >= minAmount) found.push({ key, name: RESOURCE_INFO[key].name, amount });
    }
    return found.sort((a, b) => b.amount - a.amount);
  }

  /** Everything known about one tile, for tools and the debug panel. */
  describeTile(x, y) {
    if (!this.inBounds(x, y)) return null;
    const terrain = TERRAIN_INFO[this.getTile(x, y)];
    const biome = this.biomes ? BIOME_INFO[this.getBiome(x, y)] : null;
    return {
      x,
      y,
      terrain: terrain.name,
      biome: biome?.name ?? null,
      elevation: this.getElevation(x, y),
      temperature: this.getTemperature(x, y),
      rainfall: this.getRainfall(x, y),
      moisture: this.getMoisture(x, y),
      river: this.getRiverSize(x, y),
      lake: this.getLakeId(x, y),
      resources: this.getResourcesAt(x, y),
    };
  }

  /** Number of tiles per terrain id. */
  countTiles() {
    const counts = new Array(TERRAIN_INFO.length).fill(0);
    for (let i = 0; i < this.tiles.length; i++) counts[this.tiles[i]]++;
    return counts;
  }

  /** Fraction (0-1) of tiles that are land. */
  landRatio() {
    const counts = this.countTiles();
    let land = 0;
    TERRAIN_INFO.forEach((info, id) => { if (!info.isWater) land += counts[id]; });
    return land / this.tiles.length;
  }

  _read(array, x, y, fallback) {
    return array && this.inBounds(x, y) ? array[y * this.width + x] : fallback;
  }
}
