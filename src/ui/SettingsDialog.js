import { SETTING_SPECS } from '../config/settings.js';
import { el } from './dom.js';
import { openModal } from './dialogs.js';

const HINTS = {
  secondsPerYear: 'Real seconds that one simulated year takes at 1x speed.',
  cameraSpeed: 'How fast WASD and the arrow keys move the camera.',
  showDebugOnStart: 'You can toggle the debug panel at any time with F3.',
};

const FORMATTERS = {
  secondsPerYear: (v) => `${v} s`,
  cameraSpeed: (v) => `${v}`,
};

/** Shared settings dialog, used from both the main menu and the world view. */
export class SettingsDialog {
  /** @param {{ settings: import('../config/settings.js').SettingsStore }} deps */
  constructor({ settings }) {
    this._settings = settings;
    this._controls = new Map(); // key -> { input, output }

    const rows = Object.entries(SETTING_SPECS).map(([key, spec]) => this._buildRow(key, spec));

    this.dialog = el(
      'dialog',
      { class: 'dialog dialog--settings', 'aria-labelledby': 'settings-title' },
      el(
        'form',
        { method: 'dialog', class: 'dialog__body' },
        el('h2', { id: 'settings-title', class: 'dialog__title', text: 'Settings' }),
        el('div', { class: 'settings__list' }, rows),
        el(
          'div',
          { class: 'dialog__actions' },
          el('button', { class: 'btn', type: 'button', text: 'Reset to defaults', onClick: () => this._reset() }),
          el('button', { class: 'btn btn--primary', value: 'done', text: 'Done' }),
        ),
      ),
    );
    document.body.append(this.dialog);
  }

  open() {
    this._syncControls();
    openModal(this.dialog);
  }

  _buildRow(key, spec) {
    const id = `setting-${key}`;
    const hint = HINTS[key] ? el('p', { class: 'setting__hint', id: `${id}-hint`, text: HINTS[key] }) : null;

    if (spec.type === 'boolean') {
      const input = el('input', {
        type: 'checkbox', id, class: 'setting__checkbox', 'aria-describedby': hint ? `${id}-hint` : null,
        onChange: () => this._settings.set(key, input.checked),
      });
      this._controls.set(key, { input });
      return el('div', { class: 'setting' }, el('label', { class: 'setting__check', for: id }, input, el('span', { text: spec.label })), hint);
    }

    const format = FORMATTERS[key] ?? String;
    const output = el('output', { class: 'setting__value', for: id });
    const input = el('input', {
      type: 'range', id, class: 'setting__range', min: spec.min, max: spec.max, step: spec.step,
      'aria-describedby': hint ? `${id}-hint` : null,
      onInput: () => { output.textContent = format(Number(input.value)); },
      onChange: () => this._settings.set(key, Number(input.value)),
    });
    this._controls.set(key, { input, output, format });
    return el(
      'div',
      { class: 'setting' },
      el('div', { class: 'setting__head' }, el('label', { for: id, text: spec.label }), output),
      input,
      hint,
    );
  }

  _syncControls() {
    for (const [key, control] of this._controls) {
      const value = this._settings.get(key);
      if (typeof value === 'boolean') control.input.checked = value;
      else {
        control.input.value = String(value);
        control.output.textContent = control.format(value);
      }
    }
  }

  _reset() {
    this._settings.reset();
    this._syncControls();
  }
}
