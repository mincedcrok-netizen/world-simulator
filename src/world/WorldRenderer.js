import Phaser from 'phaser';
import { hash2D } from '../utils/Noise.js';
import { TERRAIN_INFO } from './terrain.js';

const TEXTURE_KEY = 'world-map';
const BORDER_COLOR = 0xc2a265;
const SHADE_SEED = 0x51ed27;

/**
 * Draws a World with Phaser.
 *
 * Performance approach: the whole map is baked ONCE into a single canvas
 * texture (one pixel per tile) and shown as one image scaled up with nearest
 * neighbour filtering. That is one draw call and a few hundred KB of GPU
 * memory even for the Large map, and Phaser culls whatever the camera cannot
 * see. Later phases can swap this for chunked rendering without touching the
 * simulation.
 */
export class WorldRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./World.js').World} world
   */
  constructor(scene, world) {
    this._scene = scene;
    this._world = world;
    this._image = null;
    this._border = null;
    this._borderZoom = -1;
  }

  build() {
    const scene = this._scene;
    const { width, height, tiles, tileSize } = this._world;

    if (scene.textures.exists(TEXTURE_KEY)) scene.textures.remove(TEXTURE_KEY);
    const texture = scene.textures.createCanvas(TEXTURE_KEY, width, height);
    if (!texture) throw new Error('Could not allocate the world texture.');

    const context = texture.getContext();
    const image = context.createImageData(width, height);
    const pixels = image.data;
    const palette = TERRAIN_INFO.map((t) => t.color);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const color = palette[tiles[index]];
        // Tiny per-tile brightness variation so individual tiles are visible when zoomed in.
        const shade = 1 + (hash2D(SHADE_SEED, x, y) - 0.5) * 0.1;
        const o = index * 4;
        pixels[o] = color[0] * shade;
        pixels[o + 1] = color[1] * shade;
        pixels[o + 2] = color[2] * shade;
        pixels[o + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    this._image = scene.add.image(0, 0, TEXTURE_KEY).setOrigin(0, 0).setScale(tileSize);
    this._border = scene.add.graphics().setDepth(10);
    this.updateBorder(1);
  }

  /**
   * Redraw the boundary frame so it keeps a readable on-screen thickness at
   * any zoom. Skipped unless the zoom changed by more than 2 percent.
   */
  updateBorder(zoom) {
    if (!this._border) return;
    if (this._borderZoom > 0 && Math.abs(zoom - this._borderZoom) / this._borderZoom < 0.02) return;
    this._borderZoom = zoom;
    const lineWidth = Phaser.Math.Clamp(2.5 / zoom, 4, 48);
    const { pixelWidth, pixelHeight } = this._world;
    this._border.clear();
    this._border.lineStyle(lineWidth, BORDER_COLOR, 0.95);
    this._border.strokeRect(-lineWidth / 2, -lineWidth / 2, pixelWidth + lineWidth, pixelHeight + lineWidth);
  }

  destroy() {
    this._image?.destroy();
    this._border?.destroy();
    this._image = null;
    this._border = null;
    if (this._scene.textures?.exists(TEXTURE_KEY)) this._scene.textures.remove(TEXTURE_KEY);
  }
}
