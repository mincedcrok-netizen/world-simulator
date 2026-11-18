import { CAMERA } from '../config/settings.js';
import { isTypingContext } from '../ui/dom.js';

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Camera input and movement for the world view.
 *
 * - WASD / arrow keys pan (hold Shift to move faster)
 * - Mouse wheel zooms toward the cursor
 * - Middle mouse button drags the map
 * - The camera is clamped to the map plus a small margin
 *
 * Efficiency: the Phaser camera is only touched in frames where something
 * actually changed. An idle camera costs a handful of comparisons per frame.
 *
 * Coordinates: Phaser zooms around the screen centre, so the camera state is
 * simply (centre x, centre y, zoom) in world pixels.
 */
export class CameraController {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ mapWidth: number, mapHeight: number, panSpeed: number, smoothing: boolean }} options
   */
  constructor(scene, { mapWidth, mapHeight, panSpeed, smoothing }) {
    this._scene = scene;
    this._camera = scene.cameras.main;
    this._canvas = scene.game.canvas;
    this._bounds = {
      left: -CAMERA.EDGE_PADDING,
      top: -CAMERA.EDGE_PADDING,
      right: mapWidth + CAMERA.EDGE_PADDING,
      bottom: mapHeight + CAMERA.EDGE_PADDING,
    };
    this.panSpeed = panSpeed;
    this.smoothing = smoothing;

    this._cx = mapWidth / 2;
    this._cy = mapHeight / 2;
    this._zoom = 1;
    this._targetZoom = 1;
    this._minZoom = CAMERA.MIN_ZOOM_FLOOR;
    this._viewW = 0;
    this._viewH = 0;
    this._firstSync = true;

    this._keys = new Set();
    this._boost = false;
    this._vx = 0;
    this._vy = 0;
    this._anchor = null; // keeps the world point under the cursor fixed while zooming
    this._dragging = false;
    this._dragLastX = 0;
    this._dragLastY = 0;
    this._dragDX = 0;
    this._dragDY = 0;

    /** True during frames in which the zoom changed (the renderer uses it to refresh the border). */
    this.zoomChanged = false;
    this._state = { x: 0, y: 0, zoom: 1 }; // reused for getState()
    this._point = { x: 0, y: 0 }; // reused for screenToWorld()
    this._attached = false;
    this._forceApply = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  get zoom() { return this._zoom; }

  /** Start listening for input. */
  attach() {
    if (this._attached) return;
    this._attached = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onBlur);
    // Wheel is read from the DOM so line/page delta modes (Firefox) can be normalised.
    this._canvas.addEventListener('wheel', this._onWheel, { passive: false });
    const input = this._scene.input;
    input.on('pointerdown', this._onPointerDown);
    input.on('pointermove', this._onPointerMove);
    input.on('pointerup', this._onPointerUp);
    input.on('pointerupoutside', this._onPointerUp);
    this._syncViewport();
    this._apply();
  }

  /** Stop listening and release everything. Safe to call more than once. */
  destroy() {
    if (!this._attached) return;
    this._attached = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onBlur);
    this._canvas.removeEventListener('wheel', this._onWheel);
    const input = this._scene.input;
    if (input) {
      input.off('pointerdown', this._onPointerDown);
      input.off('pointermove', this._onPointerMove);
      input.off('pointerup', this._onPointerUp);
      input.off('pointerupoutside', this._onPointerUp);
    }
    this._endDrag();
  }

  /** Current camera centre and zoom (the returned object is reused; do not keep it). */
  getState() {
    this._state.x = this._cx;
    this._state.y = this._cy;
    this._state.zoom = this._zoom;
    return this._state;
  }

  /**
   * Move the camera to centre on a world position, zooming in to at least
   * `minZoom` (smoothly when smoothing is on).
   */
  focusOn(worldX, worldY, minZoom = 1.2) {
    this._cx = worldX;
    this._cy = worldY;
    this._vx = 0;
    this._vy = 0;
    // Anchor the target to the screen centre while the zoom animates, so the clamp
    // applied at low zoom (where the whole map fits) cannot pull the centre away from it.
    this._anchor = { sx: this._viewW / 2, sy: this._viewH / 2, wx: worldX, wy: worldY };
    this._targetZoom = clamp(Math.max(this._targetZoom, minZoom), this._minZoom, CAMERA.MAX_ZOOM);
    this._forceApply = true;
  }

  /**
   * Convert a position on the canvas (pixels) to world pixels. The returned
   * object is reused between calls.
   */
  screenToWorld(screenX, screenY) {
    this._point.x = this._cx + (screenX - this._viewW / 2) / this._zoom;
    this._point.y = this._cy + (screenY - this._viewH / 2) / this._zoom;
    return this._point;
  }

  /**
   * Advance the camera by one frame.
   * @param {number} deltaMs Frame time in milliseconds.
   * @returns {boolean} True if the Phaser camera was updated.
   */
  update(deltaMs) {
    const dt = Math.min(deltaMs, 100) / 1000; // ignore long hitches (tab switches)
    this.zoomChanged = false;
    let changed = this._syncViewport();
    if (this._forceApply) {
      this._forceApply = false;
      changed = true;
    }

    // Keyboard panning with optional smoothing
    let ix = 0;
    let iy = 0;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) ix -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) ix += 1;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) iy -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) iy += 1;
    if (ix !== 0 && iy !== 0) {
      ix *= Math.SQRT1_2;
      iy *= Math.SQRT1_2;
    }
    const worldSpeed = (this.panSpeed * (this._boost ? CAMERA.BOOST : 1)) / this._zoom; // constant on-screen speed
    const targetVx = ix * worldSpeed;
    const targetVy = iy * worldSpeed;
    if (this.smoothing) {
      const k = 1 - Math.exp(-dt * 12);
      this._vx += (targetVx - this._vx) * k;
      this._vy += (targetVy - this._vy) * k;
      if (targetVx === 0 && Math.abs(this._vx) < 1) this._vx = 0;
      if (targetVy === 0 && Math.abs(this._vy) < 1) this._vy = 0;
    } else {
      this._vx = targetVx;
      this._vy = targetVy;
    }
    if (this._vx !== 0 || this._vy !== 0) {
      this._cx += this._vx * dt;
      this._cy += this._vy * dt;
      this._anchor = null;
      changed = true;
    }

    // Middle-button drag (movement accumulated by pointer events since last frame)
    if (this._dragDX !== 0 || this._dragDY !== 0) {
      this._cx -= this._dragDX / this._zoom;
      this._cy -= this._dragDY / this._zoom;
      this._dragDX = 0;
      this._dragDY = 0;
      this._anchor = null;
      changed = true;
    }

    // Zoom toward the cursor
    if (this._zoom !== this._targetZoom) {
      if (this.smoothing) {
        this._zoom += (this._targetZoom - this._zoom) * (1 - Math.exp(-dt * 16));
        if (Math.abs(this._targetZoom - this._zoom) < this._targetZoom * 0.002) this._zoom = this._targetZoom;
      } else {
        this._zoom = this._targetZoom;
      }
      if (this._anchor) {
        this._cx = this._anchor.wx - (this._anchor.sx - this._viewW / 2) / this._zoom;
        this._cy = this._anchor.wy - (this._anchor.sy - this._viewH / 2) / this._zoom;
      }
      this.zoomChanged = true;
      changed = true;
    } else {
      this._anchor = null;
    }

    if (!changed) return false;
    this._apply();
    return true;
  }

  /** Keep the camera centre such that the view never leaves the map bounds. */
  _clampCenter() {
    const halfW = this._viewW / 2 / this._zoom;
    const halfH = this._viewH / 2 / this._zoom;
    const b = this._bounds;
    this._cx = b.right - b.left <= halfW * 2 ? (b.left + b.right) / 2 : clamp(this._cx, b.left + halfW, b.right - halfW);
    this._cy = b.bottom - b.top <= halfH * 2 ? (b.top + b.bottom) / 2 : clamp(this._cy, b.top + halfH, b.bottom - halfH);
  }

  _apply() {
    this._clampCenter();
    this._camera.setZoom(this._zoom);
    this._camera.centerOn(this._cx, this._cy);
  }

  /** React to canvas resizes: recompute how far the player may zoom out. */
  _syncViewport() {
    const w = this._camera.width;
    const h = this._camera.height;
    if (w <= 0 || h <= 0 || (w === this._viewW && h === this._viewH)) return false;
    this._viewW = w;
    this._viewH = h;
    const fit = Math.min(w / (this._bounds.right - this._bounds.left), h / (this._bounds.bottom - this._bounds.top));
    this._minZoom = Math.max(CAMERA.MIN_ZOOM_FLOOR, fit);
    if (this._firstSync) {
      // Start zoomed all the way out so the whole world and its border are visible.
      this._firstSync = false;
      this._zoom = this._targetZoom = this._minZoom;
    } else {
      this._targetZoom = clamp(this._targetZoom, this._minZoom, CAMERA.MAX_ZOOM);
      this._zoom = Math.max(this._zoom, this._minZoom);
    }
    this.zoomChanged = true;
    return true;
  }

  _onKeyDown(event) {
    this._boost = event.shiftKey;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!MOVE_KEYS.has(event.code) || isTypingContext(event.target)) return;
    this._keys.add(event.code);
    event.preventDefault();
  }

  _onKeyUp(event) {
    this._boost = event.shiftKey;
    this._keys.delete(event.code);
  }

  /** Window lost focus or tab hidden: release keys so the camera cannot get stuck moving. */
  _onBlur() {
    this._keys.clear();
    this._boost = false;
    this._endDrag();
  }

  _onWheel(event) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1; // lines / pages / pixels
    const delta = clamp(event.deltaY * unit, -400, 400);
    if (delta === 0) return;
    const next = clamp(this._targetZoom * Math.exp(-delta * CAMERA.WHEEL_SENSITIVITY), this._minZoom, CAMERA.MAX_ZOOM);
    if (next === this._targetZoom) return;

    const rect = this._canvas.getBoundingClientRect();
    const sx = (event.clientX - rect.left) * (this._viewW / rect.width);
    const sy = (event.clientY - rect.top) * (this._viewH / rect.height);
    this._anchor = {
      sx,
      sy,
      wx: this._cx + (sx - this._viewW / 2) / this._zoom,
      wy: this._cy + (sy - this._viewH / 2) / this._zoom,
    };
    this._targetZoom = next;
  }

  _onPointerDown(pointer) {
    if (!pointer.middleButtonDown()) return;
    this._dragging = true;
    this._dragLastX = pointer.x;
    this._dragLastY = pointer.y;
    this._canvas.style.cursor = 'grabbing';
  }

  _onPointerMove(pointer) {
    if (!this._dragging) return;
    if (!pointer.middleButtonDown()) {
      this._endDrag();
      return;
    }
    this._dragDX += pointer.x - this._dragLastX;
    this._dragDY += pointer.y - this._dragLastY;
    this._dragLastX = pointer.x;
    this._dragLastY = pointer.y;
  }

  _onPointerUp(pointer) {
    if (this._dragging && !pointer.middleButtonDown()) this._endDrag();
  }

  _endDrag() {
    this._dragging = false;
    this._dragDX = 0;
    this._dragDY = 0;
    this._canvas.style.cursor = '';
  }
}
