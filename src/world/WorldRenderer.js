import Phaser from 'phaser';
import { paintWorld } from './TerrainPainter.js';

const DETAIL_KEY = 'world-detail';
const OVERVIEW_KEY = 'world-overview';
const BORDER_COLOR = 0xc2a265;

/** Texels per tile of the detailed texture: keeps its side at roughly 770-1540 px. */
function detailScaleFor(tiles) {
  if (tiles <= 128) return 6;
  if (tiles <= 256) return 4;
  return 3;
}

/**
 * Draws a generated World with Phaser.
 *
 * Performance approach: the terrain is painted ONCE (TerrainPainter) into two
 * canvas textures and shown as just two images - never one object per tile.
 *  - detail   : several texels per tile, used when zoomed in
 *  - overview : one texel per tile, used when zoomed far out, so thin rivers
 *               and coastlines do not shimmer from heavy minification
 * Only one is visible at a time (with hysteresis), so the GPU draws a single
 * quad per frame, and Phaser culls whatever the camera cannot see.
 */
export class WorldRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./World.js').World} world
   */
  constructor(scene, world) {
    this._scene = scene;
    this._world = world;
    this._detail = null;
    this._overview = null;
    this._border = null;
    this._detailScale = detailScaleFor(world.width);
    this._borderZoom = -1;
    this._showingDetail = true;
  }

  build() {
    const { tileSize } = this._world;
    const detailPaint = paintWorld(this._world, { scale: this._detailScale });
    const overviewPaint = paintWorld(this._world, { scale: 1 });

    this._detail = this._createImage(DETAIL_KEY, detailPaint, tileSize / this._detailScale);
    this._overview = this._createImage(OVERVIEW_KEY, overviewPaint, tileSize);
    this._overview.setVisible(false);
    this._border = this._scene.add.graphics().setDepth(10);
    this.updateZoom(1);
  }

  /**
   * Refresh zoom-dependent drawing: which texture is shown, and the boundary
   * frame thickness. Cheap; call it only on frames where the zoom changed.
   */
  updateZoom(zoom) {
    if (!this._detail) return;

    // Screen pixels per detail texel decides the level of detail.
    const texelPixels = (this._world.tileSize * zoom) / this._detailScale;
    const useDetail = this._showingDetail ? texelPixels > 0.8 : texelPixels > 1.05;
    if (useDetail !== this._showingDetail) {
      this._showingDetail = useDetail;
      this._detail.setVisible(useDetail);
      this._overview.setVisible(!useDetail);
    }
    this._updateBorder(zoom);
  }

  _createImage(key, paint, scale) {
    const scene = this._scene;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const texture = scene.textures.createCanvas(key, paint.width, paint.height);
    if (!texture) throw new Error('Could not allocate the world texture.');
    texture.getContext().putImageData(new ImageData(paint.pixels, paint.width, paint.height), 0, 0);
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return scene.add.image(0, 0, key).setOrigin(0, 0).setScale(scale);
  }

  /** Boundary frame with a roughly constant on-screen thickness; redrawn only when zoom changes >2%. */
  _updateBorder(zoom) {
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
    this._detail?.destroy();
    this._overview?.destroy();
    this._border?.destroy();
    this._detail = this._overview = this._border = null;
    for (const key of [DETAIL_KEY, OVERVIEW_KEY]) {
      if (this._scene.textures?.exists(key)) this._scene.textures.remove(key);
    }
  }
}
