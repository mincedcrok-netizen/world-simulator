/**
 * Terrain data for one world: a grid of tile ids. This is pure data with no
 * Phaser dependency, so the simulation can own and query it headlessly.
 * Drawing it is WorldRenderer's job.
 */
import { WORLD } from '../config/settings.js';
import { generateTestMap } from './TestMapGenerator.js';
import { TERRAIN_INFO } from './terrain.js';

export class World {
  /**
   * @param {{ width: number, height: number, tiles: Uint8Array }} map
   * @param {number} [tileSize] Rendered tile size in world pixels.
   */
  constructor({ width, height, tiles }, tileSize = WORLD.TILE_SIZE) {
    if (tiles.length !== width * height) {
      throw new Error(`World tile array has ${tiles.length} entries; expected ${width * height}.`);
    }
    this.width = width;
    this.height = height;
    this.tiles = tiles;
    this.tileSize = tileSize;
  }

  /** Build the temporary Phase 1 test world from a validated config. */
  static fromConfig(config) {
    return new World(generateTestMap(config));
  }

  get pixelWidth() { return this.width * this.tileSize; }
  get pixelHeight() { return this.height * this.tileSize; }

  /** Terrain id at a tile, or -1 outside the map. */
  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    return this.tiles[y * this.width + x];
  }

  isWater(x, y) {
    const id = this.getTile(x, y);
    return id >= 0 && TERRAIN_INFO[id].isWater;
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
}
