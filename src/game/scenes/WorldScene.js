import Phaser from 'phaser';
import { validateWorldConfig } from '../../config/worldOptions.js';
import { Simulation } from '../../simulation/Simulation.js';
import { EVENTS } from '../../systems/Events.js';
import { CameraController } from '../../world/CameraController.js';
import { WorldRenderer } from '../../world/WorldRenderer.js';

const BACKGROUND = '#0a1217';

/**
 * The world view. It wires together the simulation (data + time), the
 * renderer and the camera, and tears all of it down again on exit.
 *
 * The scene itself holds no game rules: it renders what the simulation owns.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' });
  }

  init(data) {
    this._worldConfig = data?.worldConfig ?? null;
    this._simulation = null;
    this._renderer = null;
    this._cameraController = null;
    this._cleanups = [];
  }

  create() {
    const services = this.registry.get('services');
    // Registered first so cleanup also runs if setup below fails half-way.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._teardown(services));
    try {
      this._setup(services);
    } catch (error) {
      this._abort(error, services);
    }
  }

  update(_time, delta) {
    const controller = this._cameraController;
    if (!controller) return;
    controller.update(delta);
    if (controller.zoomChanged) this._renderer.updateZoom(controller.zoom);
  }

  _setup({ bus, settings, hud, debug, loading }) {
    const validation = validateWorldConfig(this._worldConfig);
    if (!validation.ok) {
      throw new Error(`Invalid world configuration: ${Object.values(validation.errors).join(' ')}`);
    }

    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.input.mouse?.disableContextMenu();

    // 1. Simulation first (headless data + clock). The HUD is already listening on the bus.
    const simulation = new Simulation({ bus, secondsPerYear: settings.get('secondsPerYear') });
    this._simulation = simulation;
    hud.show();
    simulation.initialize(validation.value);

    // 2. Rendering of the simulation's world
    this._renderer = new WorldRenderer(this, simulation.world);
    this._renderer.build();

    // 3. Camera
    this._cameraController = new CameraController(this, {
      mapWidth: simulation.world.pixelWidth,
      mapHeight: simulation.world.pixelHeight,
      panSpeed: settings.get('cameraSpeed'),
      smoothing: settings.get('cameraSmoothing'),
    });
    this._cameraController.attach();
    this._renderer.updateZoom(this._cameraController.zoom);

    // 4. Reactions to settings changes and to leaving the world
    this._cleanups.push(
      bus.on(EVENTS.SETTINGS_CHANGED, ({ key, value }) => {
        if (key === 'cameraSpeed') this._cameraController.panSpeed = value;
        if (key === 'cameraSmoothing') this._cameraController.smoothing = value;
      }),
      bus.on(EVENTS.WORLD_EXIT_REQUESTED, () => {
        console.info('[World] Leaving world, returning to the main menu.');
        this.scene.start('MenuScene');
      }),
    );

    // 5. Debug info
    const landPercent = (simulation.world.landRatio() * 100).toFixed(1);
    debug.addSection('simulation', 'Simulation', () => ({
      Year: simulation.clock.year,
      Speed: `${simulation.clock.speed}x`,
      Status: simulation.clock.paused ? 'Paused' : 'Running',
    }));
    debug.addSection('camera', 'Camera', () => {
      const s = this._cameraController.getState();
      return { 'Camera X': Math.round(s.x), 'Camera Y': Math.round(s.y), Zoom: `${s.zoom.toFixed(3)}x` };
    });
    debug.addSection('world', 'World', () => ({
      Map: `${simulation.world.width} x ${simulation.world.height} tiles`,
      Land: `${landPercent}%`,
      Generated: `${simulation.world.generationMs} ms`,
      Lakes: simulation.world.lakes.length,
    }));
    // Tile under the mouse pointer: handy for checking the generated data.
    debug.addSection('tile', 'Tile under cursor', () => {
      const pointer = this.input.activePointer;
      const spot = this._cameraController.screenToWorld(pointer.x, pointer.y);
      const world = simulation.world;
      const info = world.describeTile(Math.floor(spot.x / world.tileSize), Math.floor(spot.y / world.tileSize));
      if (!info) return { Position: 'outside map' };
      const rows = {
        Position: `${info.x}, ${info.y}`,
        Terrain: info.terrain,
        Biome: info.biome,
        Elevation: info.elevation.toFixed(3),
        Temperature: `${info.temperature} C`,
        Rainfall: info.rainfall,
        Moisture: info.moisture,
        River: info.river > 0 ? `size ${info.river}` : 'no',
        Resources: info.resources.length > 0 ? info.resources.slice(0, 3).map((r) => r.name).join(', ') : 'none',
      };
      return rows;
    });

    // 6. Go
    simulation.start();
    loading.hide();
    console.info(`[World] "${validation.value.name}" is ready.`);
  }

  /** Setup failed: tell the player, clean up and go back to the menu. */
  _abort(error, { bus, loading }) {
    console.error('[World] Failed to create the world:', error);
    loading.hide();
    bus.emit(EVENTS.APP_ERROR, {
      title: 'Could not create the world',
      message: error instanceof Error ? error.message : String(error),
      error,
      recoverable: true,
    });
    this.scene.start('MenuScene');
  }

  _teardown({ hud, debug }) {
    for (const cleanup of this._cleanups) cleanup();
    this._cleanups = [];
    this._cameraController?.destroy();
    this._cameraController = null;
    this._renderer?.destroy();
    this._renderer = null;
    this._simulation?.stop();
    this._simulation = null;
    debug.removeSection('simulation');
    debug.removeSection('camera');
    debug.removeSection('world');
    debug.removeSection('tile');
    hud.hide();
  }
}
