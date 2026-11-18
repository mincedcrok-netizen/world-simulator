import { SIMULATION } from '../config/settings.js';
import { LANDMASS_OPTIONS, VARIETY_OPTIONS, WATER_OPTIONS, WORLD_SIZES } from '../config/worldOptions.js';
import { EVENTS } from '../systems/Events.js';
import { confirmDialog } from './dialogs.js';
import { el, formatNumber, icon, isTypingContext } from './dom.js';

const LARGEST_COUNT = 6;

/**
 * In-world interface: top bar, information side panel and simulation controls.
 *
 * It talks to the simulation only through the EventBus: it sends `cmd:sim:*`
 * commands and renders `sim:*` notifications. It never holds a reference to
 * the Simulation object.
 */
export class WorldHUD {
  /**
   * @param {{ root: HTMLElement, bus: import('../systems/EventBus.js').EventBus,
   *           settingsDialog: import('./SettingsDialog.js').SettingsDialog }} deps
   */
  constructor({ root, bus, settingsDialog }) {
    this._bus = bus;
    this._settingsDialog = settingsDialog;
    this._progressStep = -1;
    this._settlementsVisible = true;
    this._refs = {};
    this._speedButtons = new Map();

    this.element = this._build();
    root.append(this.element);

    this._unsubscribers = [
      bus.on(EVENTS.SIM_INITIALIZED, (p) => this._onInitialized(p)),
      bus.on(EVENTS.SIM_STARTED, (p) => this._applySnapshot(p.snapshot)),
      bus.on(EVENTS.SIM_PAUSED, (p) => this._applySnapshot(p.snapshot)),
      bus.on(EVENTS.SIM_RESUMED, (p) => this._applySnapshot(p.snapshot)),
      bus.on(EVENTS.SIM_SPEED_CHANGED, (p) => this._applySnapshot(p.snapshot)),
      bus.on(EVENTS.SIM_YEAR_CHANGED, (p) => this._setYear(p.year)),
      bus.on(EVENTS.SIM_TICK, (p) => this._setProgress(p.yearProgress)),
      bus.on(EVENTS.SETTLEMENTS_CREATED, (p) => this._updateSettlements(p)),
      bus.on(EVENTS.SETTLEMENTS_UPDATED, (p) => this._updateSettlements(p)),
    ];

    this._onKeyDown = (event) => this._handleShortcut(event);
    window.addEventListener('keydown', this._onKeyDown);
  }

  show() { this.element.hidden = false; }
  hide() { this.element.hidden = true; }

  _build() {
    const r = this._refs;

    // Top bar
    r.worldName = el('h1', { class: 'hud-top__world' });
    r.year = el('span', { class: 'hud-top__year-value', text: '1' });
    r.progress = el('div', { class: 'year-bar__fill' });
    r.statusText = el('span', { text: 'Running' });
    r.statusDot = el('span', { class: 'status-dot', 'aria-hidden': 'true' });
    const top = el(
      'header',
      { class: 'hud-top' },
      r.worldName,
      el(
        'div',
        { class: 'hud-top__year' },
        el('div', { class: 'hud-top__year-line' }, el('span', { class: 'hud-top__year-label', text: 'Year' }), r.year),
        el('div', { class: 'year-bar', 'aria-hidden': 'true' }, r.progress),
      ),
      el('div', { class: 'hud-top__status', role: 'status', 'aria-live': 'polite' }, r.statusDot, r.statusText),
    );

    // Side panel
    const info = (key) => {
      r[key] = el('dd', { text: '-' });
      return r[key];
    };
    // Fixed pool of buttons for the largest settlements (text is updated in place each year).
    r.largestButtons = [];
    r.largest = el('ul', { class: 'settlement-list' });
    for (let i = 0; i < LARGEST_COUNT; i++) {
      const name = el('span', { class: 'settlement-list__name' });
      const pop = el('span', { class: 'settlement-list__pop' });
      const button = el('button', {
        class: 'settlement-list__button', type: 'button', hidden: true,
        onClick: () => this._bus.emit(EVENTS.CMD_SETTLEMENT_SELECT, { id: Number(button.dataset.id), focus: true }),
      }, name, pop);
      r.largestButtons.push({ button, name, pop });
      r.largest.append(el('li', {}, button));
    }
    r.sideBody = el(
      'div',
      { class: 'hud-side__body', id: 'hud-side-body' },
      el('h2', { class: 'hud-side__heading', text: 'World' }),
      el(
        'dl',
        { class: 'info-list' },
        el('dt', { text: 'Name' }), info('infoName'),
        el('dt', { text: 'Seed' }), info('infoSeed'),
        el('dt', { text: 'Size' }), info('infoSize'),
        el('dt', { text: 'Landmass' }), info('infoLandmass'),
        el('dt', { text: 'Water' }), info('infoWater'),
        el('dt', { text: 'Terrain variety' }), info('infoVariety'),
      ),
      el('h2', { class: 'hud-side__heading', text: 'Population' }),
      el(
        'dl',
        { class: 'info-list' },
        el('dt', { text: 'Settlements' }), info('infoSettlements'),
        el('dt', { text: 'Population' }), info('infoPopulation'),
      ),
      el('h3', { class: 'hud-side__subheading', text: 'Largest settlements' }),
      r.largest,
      el('h2', { class: 'hud-side__heading', text: 'Civilizations' }),
      el('dl', { class: 'info-list' }, el('dt', { text: 'Civilizations' }), info('infoCivs')),
      el('p', { class: 'hud-side__note', text: 'No civilizations exist yet. They arrive in a later phase.' }),
      el(
        'div',
        { class: 'hud-side__actions' },
        el('button', {
          class: 'btn', type: 'button', text: 'Show settlements', 'aria-pressed': 'true', title: 'Show or hide settlement markers (H)',
          onClick: (e) => { this._toggleSettlements(); this._blurIfMouse(e); },
        }),
        el('button', { class: 'btn', type: 'button', text: 'World settings', onClick: (e) => { this._settingsDialog.open(); this._blurIfMouse(e); } }),
        el('button', { class: 'btn', type: 'button', text: 'Main menu', onClick: () => this._requestExit() }),
      ),
    );
    r.sideToggle = el(
      'button',
      {
        class: 'hud-side__toggle', type: 'button', 'aria-expanded': 'true', 'aria-controls': 'hud-side-body',
        'aria-label': 'Hide world panel', title: 'Hide panel',
        onClick: (e) => { this._toggleSide(); this._blurIfMouse(e); },
      },
      icon('chevronRight'),
    );
    r.side = el('aside', { class: 'hud-side', 'aria-label': 'World information' }, r.sideToggle, r.sideBody);

    // Bottom controls
    r.pauseBtn = el('button', {
      class: 'btn control-btn', type: 'button', 'aria-pressed': 'false', title: 'Pause (Space)',
      onClick: (e) => { this._bus.emit(EVENTS.CMD_SIM_PAUSE); this._blurIfMouse(e); },
    }, icon('pause'), el('span', { text: 'Pause' }));
    r.playBtn = el('button', {
      class: 'btn control-btn', type: 'button', 'aria-pressed': 'true', title: 'Play (Space)',
      onClick: (e) => { this._bus.emit(EVENTS.CMD_SIM_RESUME); this._blurIfMouse(e); },
    }, icon('play'), el('span', { text: 'Play' }));

    const speedGroup = el('div', { class: 'control-group', role: 'group', 'aria-label': 'Simulation speed' });
    SIMULATION.SPEEDS.forEach((speed, index) => {
      const button = el('button', {
        class: 'btn control-btn control-btn--speed', type: 'button', 'aria-pressed': 'false',
        title: `Speed ${speed}x (key ${index + 1})`, text: `${speed}x`,
        onClick: (e) => { this._bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed }); this._blurIfMouse(e); },
      });
      this._speedButtons.set(speed, button);
      speedGroup.append(button);
    });
    const controls = el(
      'footer',
      { class: 'hud-controls', role: 'toolbar', 'aria-label': 'Simulation controls' },
      el('div', { class: 'control-group' }, r.pauseBtn, r.playBtn),
      speedGroup,
    );

    return el('div', { class: 'hud', hidden: true }, top, r.side, controls);
  }

  _onInitialized({ worldState, snapshot }) {
    const r = this._refs;
    r.worldName.textContent = worldState.name;
    r.infoName.textContent = worldState.name;
    r.infoSeed.textContent = worldState.seed;
    const size = WORLD_SIZES[worldState.size];
    r.infoSize.textContent = `${size.label}, ${worldState.tiles} × ${worldState.tiles} tiles`;
    r.infoLandmass.textContent = LANDMASS_OPTIONS[worldState.landmass].label;
    r.infoWater.textContent = WATER_OPTIONS[worldState.water].label;
    r.infoVariety.textContent = VARIETY_OPTIONS[worldState.variety].label;
    r.infoCivs.textContent = formatNumber(worldState.civilizationCount);
    r.infoPopulation.textContent = formatNumber(worldState.population);
    r.infoSettlements.textContent = formatNumber(worldState.settlementCount);
    this._settlementsVisible = true;
    this._syncSettlementToggle();
    this._progressStep = -1;
    this._setYear(snapshot.year);
    this._setProgress(snapshot.yearProgress);
    this._applySnapshot(snapshot);
  }

  _applySnapshot(snapshot) {
    const r = this._refs;
    r.statusText.textContent = snapshot.paused ? 'Paused' : `Running at ${snapshot.speed}x`;
    r.statusDot.classList.toggle('is-paused', snapshot.paused);
    r.pauseBtn.setAttribute('aria-pressed', String(snapshot.paused));
    r.playBtn.setAttribute('aria-pressed', String(!snapshot.paused));
    for (const [speed, button] of this._speedButtons) button.setAttribute('aria-pressed', String(speed === snapshot.speed));
  }

  _setYear(year) {
    this._refs.year.textContent = formatNumber(year);
  }

  /** Only touches the DOM when the bar moves by at least half a percent. */
  _setProgress(progress) {
    const step = Math.floor(progress * 200);
    if (step === this._progressStep) return;
    this._progressStep = step;
    this._refs.progress.style.transform = `scaleX(${progress.toFixed(4)})`;
  }

  /** Settlement totals and the "largest settlements" list. Touches the DOM only when text changes. */
  _updateSettlements({ settlements, totalPopulation, count }) {
    const r = this._refs;
    r.infoSettlements.textContent = formatNumber(count);
    r.infoPopulation.textContent = formatNumber(Math.round(totalPopulation));

    const top = [];
    for (const s of settlements) {
      if (!s.active) continue;
      // Tiny insertion sort: only the largest LARGEST_COUNT are kept.
      if (top.length === LARGEST_COUNT && s.population.total <= top[LARGEST_COUNT - 1].population.total) continue;
      let i = top.length < LARGEST_COUNT ? top.push(s) - 1 : LARGEST_COUNT - 1;
      top[i] = s;
      while (i > 0 && top[i].population.total > top[i - 1].population.total) {
        [top[i], top[i - 1]] = [top[i - 1], top[i]];
        i--;
      }
    }
    r.largestButtons.forEach((slot, index) => {
      const s = top[index];
      slot.button.hidden = !s;
      if (!s) return;
      slot.button.dataset.id = String(s.id);
      if (slot.name.textContent !== s.name) slot.name.textContent = s.name;
      const text = formatNumber(Math.round(s.population.total));
      if (slot.pop.textContent !== text) slot.pop.textContent = text;
    });
  }

  _toggleSettlements() {
    this._settlementsVisible = !this._settlementsVisible;
    this._syncSettlementToggle();
    this._bus.emit(EVENTS.CMD_SETTLEMENTS_SET_VISIBLE, { visible: this._settlementsVisible });
  }

  _syncSettlementToggle() {
    const button = this.element.querySelector('[title^="Show or hide settlement"]');
    if (button) button.setAttribute('aria-pressed', String(this._settlementsVisible));
  }

  _toggleSide() {
    const collapsed = this._refs.side.classList.toggle('is-collapsed');
    const toggle = this._refs.sideToggle;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Show world panel' : 'Hide world panel');
    toggle.title = collapsed ? 'Show panel' : 'Hide panel';
    this._refs.sideBody.hidden = collapsed;
  }

  async _requestExit() {
    const confirmed = await confirmDialog({
      title: 'Return to the main menu?',
      message: 'This world cannot be saved yet. Leaving it discards the current world.',
      confirmLabel: 'Leave world',
      danger: true,
    });
    if (confirmed) this._bus.emit(EVENTS.WORLD_EXIT_REQUESTED);
  }

  /** After a mouse click, release focus so Space/keys go to the game, not the clicked button. */
  _blurIfMouse(event) {
    if (event.detail > 0) event.currentTarget?.blur();
  }

  /** Space toggles pause; 1-4 pick a speed. Ignored while typing or in a dialog. */
  _handleShortcut(event) {
    if (this.element.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingContext(event.target)) return;
    const onButton = event.target instanceof Element && event.target.closest('button, a, summary');
    if (event.code === 'Space') {
      if (onButton) return; // Space activates the focused control natively
      event.preventDefault();
      this._bus.emit(EVENTS.CMD_SIM_TOGGLE_PAUSE);
      return;
    }
    if (onButton) return;
    if (event.code === 'KeyH') {
      this._toggleSettlements();
      return;
    }
    const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
    if (index !== -1 && index < SIMULATION.SPEEDS.length) {
      this._bus.emit(EVENTS.CMD_SIM_SET_SPEED, { speed: SIMULATION.SPEEDS[index] });
    }
  }
}
