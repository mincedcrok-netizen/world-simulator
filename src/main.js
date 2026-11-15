import './ui/styles/base.css';
import './ui/styles/menu.css';
import './ui/styles/hud.css';
import './ui/styles/dialogs.css';

import { SettingsStore } from './config/settings.js';
import { createGame } from './game/Game.js';
import { EventBus } from './systems/EventBus.js';
import { EVENTS } from './systems/Events.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { ErrorOverlay } from './ui/ErrorOverlay.js';
import { LoadingOverlay } from './ui/LoadingOverlay.js';
import { MainMenu } from './ui/MainMenu.js';
import { SettingsDialog } from './ui/SettingsDialog.js';
import { WorldHUD } from './ui/WorldHUD.js';

/** Errors browsers raise for harmless layout reasons; not worth interrupting the player. */
const BENIGN_ERRORS = [/ResizeObserver loop/i];

function installGlobalErrorHandlers(errorOverlay) {
  window.addEventListener('error', (event) => {
    if (BENIGN_ERRORS.some((pattern) => pattern.test(event.message ?? ''))) return;
    console.error('[Global] Uncaught error:', event.error ?? event.message);
    errorOverlay.report(event.error ?? new Error(event.message));
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global] Unhandled promise rejection:', event.reason);
    errorOverlay.report(event.reason ?? new Error('Unhandled promise rejection'));
  });
}

function bootstrap() {
  const errorOverlay = new ErrorOverlay();
  installGlobalErrorHandlers(errorOverlay);

  try {
    console.info('[Main] Starting World Simulator…');
    const root = document.getElementById('ui-root');
    if (!root || !document.getElementById('game-container')) {
      throw new Error('The page is missing its #ui-root or #game-container element.');
    }

    // Errors thrown inside event handlers are logged by the bus and surfaced here.
    const bus = new EventBus({
      onHandlerError: (error, eventName) =>
        errorOverlay.report(error, { title: `Something went wrong (${eventName})` }),
    });
    bus.on(EVENTS.APP_ERROR, (info) => errorOverlay.show(info));

    const settings = new SettingsStore({ bus });
    const settingsDialog = new SettingsDialog({ settings });
    const debug = new DebugPanel(root, { visible: settings.get('showDebugOnStart') });
    const loading = new LoadingOverlay(root);
    const menu = new MainMenu({ root, bus, settingsDialog });
    const hud = new WorldHUD({ root, bus, settingsDialog });

    const services = { bus, settings, debug, loading, menu, hud, errorOverlay };
    createGame({ parent: 'game-container', services });
  } catch (error) {
    console.error('[Main] Initialization failed:', error);
    document.getElementById('boot-splash')?.remove();
    errorOverlay.show({
      title: 'World Simulator could not start',
      message: error instanceof Error ? error.message : String(error),
      error,
      recoverable: false,
    });
  }
}

bootstrap();
