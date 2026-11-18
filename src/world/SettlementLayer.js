import Phaser from 'phaser';
import { SETTLEMENT_TYPE } from '../simulation/settlements/development.js';

const FILL = { [SETTLEMENT_TYPE.CAMP]: 0xe3c27a, [SETTLEMENT_TYPE.VILLAGE]: 0xf2e6b8, [SETTLEMENT_TYPE.TOWN]: 0xffffff };
const SIZE = { [SETTLEMENT_TYPE.CAMP]: 5.5, [SETTLEMENT_TYPE.VILLAGE]: 7, [SETTLEMENT_TYPE.TOWN]: 9 }; // screen pixels
const OUTLINE = 0x0d171d;
const SELECT_COLOR = 0xffffff;

/**
 * Draws every settlement marker with ONE Graphics object (plus one Text for
 * the selected settlement's name) - never one object per settlement. Marker
 * size is constant on screen, so settlements stay visible and clickable at
 * every zoom level. It only redraws when something changed (settlements
 * updated, selection, zoom, visibility), not every frame.
 *
 * Shapes: camp = tent (triangle), village = disc, town = square.
 */
export class SettlementLayer {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('../simulation/settlements/Settlement.js').Settlement[]} settlements Live list (read only).
   * @param {number} tileSize World pixels per tile.
   */
  constructor(scene, settlements, tileSize) {
    this._scene = scene;
    this._settlements = settlements;
    this._tileSize = tileSize;
    this._graphics = scene.add.graphics().setDepth(20);
    this._label = scene.add
      .text(0, 0, '', {
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        fontSize: '13px',
        color: '#e7e2d4',
        stroke: '#0a1217',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(21)
      .setVisible(false);
    this._selectedId = null;
    this._visible = true;
    this._zoom = 1;
    /** True when the markers must be redrawn on the next `redrawIfNeeded`. */
    this.dirty = true;
  }

  get visible() { return this._visible; }

  setVisible(visible) {
    this._visible = visible;
    this._graphics.setVisible(visible);
    this._label.setVisible(visible && this._selectedId !== null);
    this.dirty = true;
  }

  setSelected(id) {
    this._selectedId = id;
    this.dirty = true;
  }

  markDirty() { this.dirty = true; }

  /** Redraw if anything changed since the last redraw. Cheap when nothing did. */
  redrawIfNeeded(zoom) {
    if (zoom !== this._zoom) {
      this._zoom = zoom;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    if (!this._visible) return;
    this._draw(zoom);
  }

  /**
   * The settlement nearest to a world position within `pickPixels` screen
   * pixels, or null. Linear scan: there are at most a few hundred.
   */
  hitTest(worldX, worldY, zoom, pickPixels = 16) {
    if (!this._visible) return null;
    const reach = pickPixels / zoom;
    let best = null;
    let bestSq = reach * reach;
    for (const s of this._settlements) {
      if (!s.active) continue;
      const dx = (s.x + 0.5) * this._tileSize - worldX;
      const dy = (s.y + 0.5) * this._tileSize - worldY;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) {
        best = s;
        bestSq = d;
      }
    }
    return best;
  }

  _draw(zoom) {
    const g = this._graphics;
    const px = 1 / zoom; // one screen pixel in world units
    g.clear();
    let selected = null;

    for (const s of this._settlements) {
      const cx = (s.x + 0.5) * this._tileSize;
      const cy = (s.y + 0.5) * this._tileSize;
      if (!s.active) {
        g.fillStyle(0x6c7a76, 0.6);
        g.fillCircle(cx, cy, 3 * px);
        continue;
      }
      if (s.id === this._selectedId) selected = s;
      const r = SIZE[s.type] * px;
      g.fillStyle(OUTLINE, 1);
      g.lineStyle(2 * px, OUTLINE, 1);
      this._shape(g, s.type, cx, cy, r + 1.5 * px, true);
      g.fillStyle(FILL[s.type], 1);
      this._shape(g, s.type, cx, cy, r, true);
    }

    if (selected) {
      const cx = (selected.x + 0.5) * this._tileSize;
      const cy = (selected.y + 0.5) * this._tileSize;
      g.lineStyle(2 * px, SELECT_COLOR, 1);
      g.strokeCircle(cx, cy, (SIZE[selected.type] + 6) * px);
      this._label
        .setText(selected.name)
        .setScale(px)
        .setPosition(cx, cy - (SIZE[selected.type] + 9) * px)
        .setVisible(true);
    } else {
      this._label.setVisible(false);
    }
  }

  _shape(g, type, cx, cy, r) {
    if (type === SETTLEMENT_TYPE.CAMP) {
      g.fillTriangle(cx, cy - r, cx - r, cy + r * 0.8, cx + r, cy + r * 0.8);
    } else if (type === SETTLEMENT_TYPE.TOWN) {
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    } else {
      g.fillCircle(cx, cy, r);
    }
  }

  destroy() {
    this._graphics.destroy();
    this._label.destroy();
  }
}
