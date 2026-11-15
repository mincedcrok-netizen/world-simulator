import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { WorldScene } from './scenes/WorldScene.js';

/**
 * Create the Phaser game. Shared app services (event bus, settings, UI) are
 * handed to every scene through the registry as `services`.
 *
 * @param {{ parent: string, services: object }} options
 * @returns {Phaser.Game}
 */
export function createGame({ parent, services }) {
  const config = {
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0a1217',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    render: {
      powerPreference: 'low-power', // prefer the integrated GPU on hybrid laptops
      antialias: true,
      roundPixels: false,
    },
    fps: { target: 60 },
    audio: { noAudio: true }, // no sound yet; avoids creating an AudioContext
    input: { keyboard: false, gamepad: false }, // keyboard handled by our own DOM listeners
    disableContextMenu: true,
    banner: false,
    scene: [BootScene, MenuScene, WorldScene],
    callbacks: {
      preBoot: (game) => game.registry.set('services', services),
      postBoot: (game) => {
        services.debug.addSection('engine', 'Engine', () => ({
          FPS: Math.round(game.loop.actualFps),
          Renderer: game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas',
        }));
      },
    },
  };
  return new Phaser.Game(config);
}
