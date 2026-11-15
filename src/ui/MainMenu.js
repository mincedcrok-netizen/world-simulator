import { EVENTS } from '../systems/Events.js';
import { drawMenuBackdrop } from './menuBackdrop.js';
import { confirmDialog } from './dialogs.js';
import { el } from './dom.js';
import { WorldCreationScreen } from './WorldCreationScreen.js';

const VERSION = '0.1.0';

/**
 * The main menu: home, world creation, load placeholder and exit screens.
 * Pure DOM; it announces intent on the EventBus and does not know Phaser exists.
 */
export class MainMenu {
  /**
   * @param {{ root: HTMLElement, bus: import('../systems/EventBus.js').EventBus,
   *           settingsDialog: import('./SettingsDialog.js').SettingsDialog }} deps
   */
  constructor({ root, bus, settingsDialog }) {
    this._bus = bus;
    this._settingsDialog = settingsDialog;
    this._view = 'home';
    this._backdropDrawn = false;

    this._backdrop = el('canvas', { class: 'menu__backdrop', 'aria-hidden': 'true' });
    this._creation = new WorldCreationScreen({
      onSubmit: (config) => this._bus.emit(EVENTS.WORLD_CREATE_REQUESTED, config),
      onBack: () => this.showView('home'),
    });

    this._views = {
      home: this._buildHome(),
      new: el('div', { class: 'menu__view', 'data-view': 'new' }, this._creation.element),
      load: this._buildLoad(),
      exit: this._buildExit(),
    };

    this.element = el(
      'div',
      { class: 'menu', hidden: true },
      this._backdrop,
      el('div', { class: 'menu__graticule', 'aria-hidden': 'true' }),
      el('div', { class: 'menu__shade', 'aria-hidden': 'true' }),
      el('main', { class: 'menu__content' }, Object.values(this._views)),
      el('p', { class: 'menu__version', text: `Version ${VERSION}` }),
    );
    root.append(this.element);

    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this._view !== 'home' && this._view !== 'exit' && !document.querySelector('dialog[open]')) {
        this.showView('home');
      }
    });
  }

  show() {
    this.element.hidden = false;
    if (!this._backdropDrawn) {
      this._backdropDrawn = true;
      // Paint after the first frame so the menu appears immediately.
      window.setTimeout(() => {
        try {
          drawMenuBackdrop(this._backdrop);
        } catch (error) {
          console.error('[Menu] Could not draw the menu backdrop:', error);
        }
      }, 0);
    }
    this.showView('home');
  }

  hide() {
    this.element.hidden = true;
  }

  /** @param {'home'|'new'|'load'|'exit'} name */
  showView(name) {
    if (!this._views[name]) throw new Error(`Unknown menu view "${name}".`);
    this._view = name;
    for (const [key, view] of Object.entries(this._views)) view.classList.toggle('is-active', key === name);
    if (name === 'new') {
      this._creation.reset();
      this._creation.focus();
    } else {
      this._views[name].querySelector('button')?.focus();
    }
  }

  _buildHome() {
    const items = [
      { label: 'New World', action: () => this.showView('new') },
      { label: 'Load World', action: () => this.showView('load') },
      { label: 'Settings', action: () => this._settingsDialog.open() },
      { label: 'Exit', action: () => this._exit() },
    ];
    const list = el(
      'ul',
      { class: 'menu__list' },
      items.map((item) => el('li', {}, el('button', { class: 'menu__item', type: 'button', text: item.label, onClick: item.action }))),
    );
    list.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const buttons = [...list.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      if (index === -1) return;
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    return el(
      'div',
      { class: 'menu__view is-active', 'data-view': 'home' },
      el('h1', { class: 'menu__title', text: 'WORLD SIMULATOR' }),
      el('div', { class: 'menu__rule', 'aria-hidden': 'true' }),
      el('p', { class: 'menu__tagline', text: 'Generate a world, then watch its civilizations rise and fall.' }),
      el('nav', { 'aria-label': 'Main menu' }, list),
    );
  }

  _buildLoad() {
    return el(
      'div',
      { class: 'menu__view', 'data-view': 'load' },
      el(
        'section',
        { class: 'sheet sheet--narrow', 'aria-labelledby': 'load-title' },
        el('h2', { id: 'load-title', class: 'sheet__title', text: 'Load World' }),
        el('p', { class: 'sheet__text', text: 'There are no saved worlds yet.' }),
        el('p', { class: 'sheet__text sheet__text--dim', text: 'Saving and loading arrive in a later phase. For now, create a new world to explore.' }),
        el(
          'div',
          { class: 'sheet__actions' },
          el('button', { class: 'btn', type: 'button', text: 'Back', onClick: () => this.showView('home') }),
          el('button', { class: 'btn btn--primary', type: 'button', text: 'New World', onClick: () => this.showView('new') }),
        ),
      ),
    );
  }

  _buildExit() {
    return el(
      'div',
      { class: 'menu__view', 'data-view': 'exit' },
      el(
        'section',
        { class: 'sheet sheet--narrow', 'aria-labelledby': 'exit-title' },
        el('h2', { id: 'exit-title', class: 'sheet__title', text: 'World Simulator has closed' }),
        el('p', { class: 'sheet__text', text: 'Browsers do not let a page close its own tab, so you can close it yourself now.' }),
        el(
          'div',
          { class: 'sheet__actions' },
          el('button', { class: 'btn btn--primary', type: 'button', text: 'Return to Main Menu', onClick: () => this.showView('home') }),
        ),
      ),
    );
  }

  async _exit() {
    const confirmed = await confirmDialog({
      title: 'Exit World Simulator?',
      message: 'Your settings are saved. Worlds cannot be saved yet.',
      confirmLabel: 'Exit',
      danger: true,
    });
    if (!confirmed) return;
    console.info('[Menu] Exit requested.');
    window.close(); // only works for tabs opened by script; otherwise falls through to the exit screen
    window.setTimeout(() => this.showView('exit'), 150);
  }
}
