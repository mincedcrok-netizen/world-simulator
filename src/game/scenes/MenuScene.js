import Phaser from 'phaser';
import { validateWorldConfig } from '../../config/worldOptions.js';
import { EVENTS } from '../../systems/Events.js';

/**
 * Hosts the HTML main menu. The menu itself is DOM (see ui/MainMenu.js); this
 * scene just shows it, and starts the world when the menu asks for one.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const { bus, menu, loading } = this.registry.get('services');
    this._starting = false;
    menu.show();
    loading.hide();

    const unsubscribe = bus.on(EVENTS.WORLD_CREATE_REQUESTED, (config) => this._onCreateRequested(config));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      menu.hide();
    });
  }

  _onCreateRequested(config) {
    if (this._starting) return; // ignore double clicks
    const { bus, menu, loading } = this.registry.get('services');

    // The UI already validated, but never trust input crossing a module boundary.
    const result = validateWorldConfig(config);
    if (!result.ok) {
      console.error('[Menu] World creation rejected:', result.errors);
      bus.emit(EVENTS.APP_ERROR, {
        title: 'Could not create the world',
        message: `Some world settings are invalid: ${Object.values(result.errors).join(' ')}`,
        recoverable: true,
      });
      return;
    }

    this._starting = true;
    console.info(`[Menu] Creating world "${result.value.name}".`);
    menu.hide();
    loading.show('Generating world…');
    // Let the browser paint the loading message before the (synchronous) generation starts.
    window.setTimeout(() => {
      if (!this.scene.isActive('MenuScene')) return;
      this.scene.start('WorldScene', { worldConfig: result.value });
    }, 60);
  }
}
