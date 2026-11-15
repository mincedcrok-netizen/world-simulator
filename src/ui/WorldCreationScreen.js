import {
  LANDMASS_OPTIONS, NAME_MAX_LENGTH, SEED_MAX_LENGTH, VARIETY_OPTIONS, WATER_OPTIONS, WORLD_SIZES,
  createDefaultWorldConfig, validateWorldConfig,
} from '../config/worldOptions.js';
import { randomSeedString } from '../utils/Random.js';
import { generateWorldName } from '../utils/WorldNames.js';
import { el } from './dom.js';

/**
 * Radio-group styled as a segmented control. Native radios keep arrow-key
 * navigation, form semantics and screen-reader support for free.
 */
function createSegmented({ name, legend, options, value }) {
  const group = el('fieldset', { class: 'field field--group' }, el('legend', { class: 'field__label', text: legend }));
  const control = el('div', { class: 'segmented' });
  const inputs = [];
  for (const [key, option] of Object.entries(options)) {
    const input = el('input', { type: 'radio', name, value: key, checked: key === value });
    inputs.push(input);
    control.append(
      el(
        'label',
        {},
        input,
        el('span', {}, el('strong', { text: option.label }), option.tiles ? el('small', { text: `${option.tiles} × ${option.tiles}` }) : null),
      ),
    );
  }
  const error = el('p', { class: 'field__error', id: `${name}-error`, role: 'alert' });
  group.append(control, error);
  return {
    element: group,
    error,
    inputs,
    get value() { return inputs.find((i) => i.checked)?.value ?? ''; },
    set value(next) { for (const i of inputs) i.checked = i.value === next; },
  };
}

/** The "New World" form. Collects options, validates them and reports a clean config. */
export class WorldCreationScreen {
  /**
   * @param {{ onSubmit: (config: import('../config/worldOptions.js').WorldConfig) => void, onBack: () => void }} handlers
   */
  constructor({ onSubmit, onBack }) {
    this._onSubmit = onSubmit;

    this._nameInput = el('input', {
      id: 'world-name', class: 'input', type: 'text', maxlength: NAME_MAX_LENGTH + 20, autocomplete: 'off',
      spellcheck: 'false', 'aria-describedby': 'world-name-error',
    });
    this._nameError = el('p', { class: 'field__error', id: 'world-name-error', role: 'alert' });
    this._seedInput = el('input', {
      id: 'world-seed', class: 'input', type: 'text', maxlength: SEED_MAX_LENGTH + 20, autocomplete: 'off',
      spellcheck: 'false', 'aria-describedby': 'world-seed-hint world-seed-error',
    });
    this._seedError = el('p', { class: 'field__error', id: 'world-seed-error', role: 'alert' });
    this._formError = el('p', { class: 'field__error', role: 'alert' });

    this._size = createSegmented({ name: 'size', legend: 'World size', options: WORLD_SIZES, value: 'medium' });
    this._landmass = createSegmented({ name: 'landmass', legend: 'Landmass distribution', options: LANDMASS_OPTIONS, value: 'balanced' });
    this._water = createSegmented({ name: 'water', legend: 'Water coverage', options: WATER_OPTIONS, value: 'normal' });
    this._variety = createSegmented({ name: 'variety', legend: 'Terrain variety', options: VARIETY_OPTIONS, value: 'normal' });

    this._errorTargets = {
      name: { error: this._nameError, focus: this._nameInput },
      seed: { error: this._seedError, focus: this._seedInput },
      size: { error: this._size.error, focus: this._size.inputs[0] },
      landmass: { error: this._landmass.error, focus: this._landmass.inputs[0] },
      water: { error: this._water.error, focus: this._water.inputs[0] },
      variety: { error: this._variety.error, focus: this._variety.inputs[0] },
      form: { error: this._formError, focus: this._nameInput },
    };

    this.element = el(
      'section',
      { class: 'sheet', 'aria-labelledby': 'new-world-title' },
      el('h2', { id: 'new-world-title', class: 'sheet__title', text: 'New World' }),
      el(
        'form',
        { class: 'sheet__form', novalidate: true, onSubmit: (event) => { event.preventDefault(); this._submit(); } },
        el(
          'div',
          { class: 'field' },
          el('label', { class: 'field__label', for: 'world-name', text: 'World name' }),
          el(
            'div',
            { class: 'field__row' },
            this._nameInput,
            el('button', {
              class: 'btn btn--small', type: 'button', text: 'New name',
              onClick: () => { this._nameInput.value = generateWorldName(); this._clearError('name'); },
            }),
          ),
          this._nameError,
        ),
        el(
          'div',
          { class: 'field' },
          el('label', { class: 'field__label', for: 'world-seed', text: 'World seed' }),
          el(
            'div',
            { class: 'field__row' },
            this._seedInput,
            el('button', {
              class: 'btn btn--small', type: 'button', text: 'Randomize',
              onClick: () => { this._seedInput.value = randomSeedString(); this._clearError('seed'); },
            }),
          ),
          el('p', { class: 'hint', id: 'world-seed-hint', text: 'Numbers or text. The same seed and options always make the same world.' }),
          this._seedError,
        ),
        this._size.element,
        this._landmass.element,
        el('div', { class: 'field-grid' }, this._water.element, this._variety.element),
        this._formError,
        el(
          'div',
          { class: 'sheet__actions' },
          el('button', { class: 'btn', type: 'button', text: 'Back', onClick: onBack }),
          el('button', { class: 'btn btn--primary', type: 'submit', text: 'Create World' }),
        ),
      ),
    );

    this._nameInput.addEventListener('input', () => this._clearError('name'));
    this._seedInput.addEventListener('input', () => this._clearError('seed'));
    this.reset();
  }

  /** Refill the form with a fresh random name and seed and the default options. */
  reset() {
    const defaults = createDefaultWorldConfig();
    this._nameInput.value = defaults.name;
    this._seedInput.value = defaults.seed;
    this._size.value = defaults.size;
    this._landmass.value = defaults.landmass;
    this._water.value = defaults.water;
    this._variety.value = defaults.variety;
    for (const field of Object.keys(this._errorTargets)) this._clearError(field);
  }

  focus() {
    this._nameInput.focus();
    this._nameInput.select();
  }

  _clearError(field) {
    const target = this._errorTargets[field];
    target.error.textContent = '';
    if (field === 'name') this._nameInput.removeAttribute('aria-invalid');
    if (field === 'seed') this._seedInput.removeAttribute('aria-invalid');
  }

  _submit() {
    for (const field of Object.keys(this._errorTargets)) this._clearError(field);
    const result = validateWorldConfig({
      name: this._nameInput.value,
      seed: this._seedInput.value,
      size: this._size.value,
      landmass: this._landmass.value,
      water: this._water.value,
      variety: this._variety.value,
    });
    if (!result.ok) {
      let firstFocus = null;
      for (const [field, message] of Object.entries(result.errors)) {
        const target = this._errorTargets[field];
        if (!target) continue;
        target.error.textContent = message;
        if (field === 'name') this._nameInput.setAttribute('aria-invalid', 'true');
        if (field === 'seed') this._seedInput.setAttribute('aria-invalid', 'true');
        firstFocus ??= target.focus;
      }
      firstFocus?.focus();
      return;
    }
    this._onSubmit(result.value);
  }
}
