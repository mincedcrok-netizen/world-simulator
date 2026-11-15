import Phaser from 'phaser';

/**
 * First scene. Phase 1 has no external assets to load, so it only verifies the
 * renderer, removes the HTML boot splash and hands over to the menu. Asset
 * preloading belongs here in later phases.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    console.info(`[Boot] Phaser ${Phaser.VERSION} started with the ${renderer} renderer.`);
    if (renderer === 'Canvas') {
      console.warn('[Boot] WebGL is unavailable; using the slower Canvas renderer.');
    }
    document.getElementById('boot-splash')?.remove();
    this.scene.start('MenuScene');
  }
}
