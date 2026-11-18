import { DEFAULT_SETTLEMENT_CONFIG } from '../config/settlementConfig.js';
import { EVENTS } from '../systems/Events.js';
import { el, formatNumber } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TYPE_LABELS = Object.fromEntries(Object.entries(DEFAULT_SETTLEMENT_CONFIG.types).map(([k, v]) => [k, v.label]));
const MAX_DEVELOPMENT = DEFAULT_SETTLEMENT_CONFIG.development.maxLevel;

const percent = (v, digits = 0) => `${(v * 100).toFixed(digits)}%`;
const signed = (v, digits = 1) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(digits)}`;

/**
 * Settlement inspection panel (left side). Shows one selected settlement and
 * refreshes yearly. It only reads the settlement object it is given; it never
 * changes it, and it talks to the world view through the EventBus.
 */
export class SettlementPanel {
  /**
   * @param {{ root: HTMLElement, bus: import('../systems/EventBus.js').EventBus }} deps
   */
  constructor({ root, bus }) {
    this._bus = bus;
    this._settlement = null;
    this._rows = {};

    this._build();
    root.append(this.element);

    this._unsubscribers = [
      bus.on(EVENTS.SETTLEMENT_SELECTED, ({ settlement }) => this._setSettlement(settlement)),
      bus.on(EVENTS.SETTLEMENTS_UPDATED, () => this._render()),
      bus.on(EVENTS.SETTLEMENTS_CREATED, () => this._setSettlement(null)),
    ];
  }

  /** Hide and forget the current selection (leaving the world). */
  hide() {
    this._setSettlement(null);
  }

  _build() {
    const r = this._rows;
    const row = (label, key) => {
      r[key] = el('dd', { text: '-' });
      return [el('dt', { text: label }), r[key]];
    };

    r.name = el('h2', { class: 'settlement-panel__name', id: 'settlement-name' });
    r.type = el('span', { class: 'settlement-panel__type' });
    r.sub = el('p', { class: 'settlement-panel__sub' });
    r.status = el('p', { class: 'settlement-panel__status', role: 'status', 'aria-live': 'polite' });
    r.devFill = el('div', { class: 'meter__fill' });
    r.devText = el('span', { class: 'settlement-panel__dev-text' });
    r.livingFill = el('div', { class: 'meter__fill meter__fill--living' });
    r.chart = document.createElementNS(SVG_NS, 'svg');
    r.chart.setAttribute('viewBox', '0 0 240 44');
    r.chart.setAttribute('class', 'sparkline');
    r.chart.setAttribute('role', 'img');
    r.line = document.createElementNS(SVG_NS, 'polyline');
    r.chart.append(r.line);

    this.element = el(
      'aside',
      { class: 'settlement-panel', 'aria-labelledby': 'settlement-name', hidden: true },
      el(
        'div',
        { class: 'settlement-panel__head' },
        el('div', {}, r.name, r.sub),
        el('button', {
          class: 'settlement-panel__close', type: 'button', 'aria-label': 'Close settlement panel', title: 'Close',
          text: '×',
          onClick: () => this._bus.emit(EVENTS.CMD_SETTLEMENT_SELECT, { id: null }),
        }),
      ),
      el('div', { class: 'settlement-panel__badges' }, r.type),
      r.status,
      el(
        'dl',
        { class: 'info-list' },
        ...row('Population', 'population'),
        ...row('Capacity', 'capacity'),
        ...row('Growth rate', 'growth'),
        ...row('Births last year', 'births'),
        ...row('Deaths last year', 'deaths'),
      ),
      el('h3', { class: 'settlement-panel__heading', text: 'Food' }),
      el(
        'dl',
        { class: 'info-list' },
        ...row('Storage', 'storage'),
        ...row('Production per year', 'production'),
        ...row('Consumption per year', 'consumption'),
        ...row('Balance per year', 'balance'),
      ),
      el('h3', { class: 'settlement-panel__heading', text: 'Development' }),
      el('div', { class: 'settlement-panel__dev' }, r.devText, el('div', { class: 'meter', 'aria-hidden': 'true' }, r.devFill)),
      el(
        'dl',
        { class: 'info-list' },
        ...row('Living conditions', 'living'),
      ),
      el('div', { class: 'meter', 'aria-hidden': 'true' }, r.livingFill),
      el('h3', { class: 'settlement-panel__heading', text: 'Population history' }),
      r.chart,
      el('button', {
        class: 'btn btn--small settlement-panel__focus', type: 'button', text: 'Show on map',
        onClick: () => this._settlement && this._bus.emit(EVENTS.CMD_SETTLEMENT_SELECT, { id: this._settlement.id, focus: true }),
      }),
    );
  }

  _setSettlement(settlement) {
    this._settlement = settlement ?? null;
    this.element.hidden = this._settlement === null;
    if (this._settlement) this._render();
  }

  _render() {
    const s = this._settlement;
    if (!s) return;
    const r = this._rows;
    const p = s.population;
    const cfg = DEFAULT_SETTLEMENT_CONFIG;

    r.name.textContent = s.name;
    r.type.textContent = s.active ? TYPE_LABELS[s.type] : 'Abandoned';
    r.type.dataset.type = s.active ? s.type : 'abandoned';
    r.sub.textContent = `Founded in year ${formatNumber(s.foundedYear)}  at ${s.x}, ${s.y}`;

    if (!s.active) r.status.textContent = `Abandoned in year ${formatNumber(s.abandonedYear)}.`;
    else if (p.fedRatio < 0.999) r.status.textContent = `Food shortage: ${percent(p.fedRatio)} of need met.`;
    else if (s.foodStorage >= s.storageLimit * 0.9) r.status.textContent = 'Food secure, stores are full.';
    else r.status.textContent = 'Food secure.';
    r.status.dataset.state = !s.active ? 'abandoned' : p.fedRatio < 0.999 ? 'shortage' : 'ok';

    r.population.textContent = formatNumber(Math.round(p.total));
    r.capacity.textContent = formatNumber(Math.round(p.capacity));
    r.growth.textContent = `${signed(p.growthRate * 100)}% per year`;
    r.births.textContent = formatNumber(Math.round(p.births));
    r.deaths.textContent = formatNumber(Math.round(p.deaths));

    r.storage.textContent = `${formatNumber(Math.round(s.foodStorage))} / ${formatNumber(Math.round(s.storageLimit))}`;
    r.production.textContent = formatNumber(Math.round(p.foodProduction));
    r.consumption.textContent = formatNumber(Math.round(p.foodConsumption));
    const balance = p.foodProduction - p.foodConsumption;
    r.balance.textContent = `${balance >= 0 ? '+' : '-'}${formatNumber(Math.round(Math.abs(balance)))}`;

    r.devText.textContent = `Level ${s.developmentLevel} of ${MAX_DEVELOPMENT}`;
    const cost = cfg.development.levelCostBase + cfg.development.levelCostStep * s.developmentLevel;
    const progress = s.developmentLevel >= MAX_DEVELOPMENT ? 1 : Math.max(0, Math.min(1, s.developmentProgress / cost));
    r.devFill.style.transform = `scaleX(${progress.toFixed(3)})`;
    r.living.textContent = percent(p.livingConditions);
    r.livingFill.style.transform = `scaleX(${p.livingConditions.toFixed(3)})`;

    this._renderChart(s);
  }

  /** Population over the last years as a small line chart. */
  _renderChart(s) {
    const history = s.getHistory();
    const r = this._rows;
    if (history.length < 2) {
      r.line.setAttribute('points', '');
      return;
    }
    const max = Math.max(...history, 1);
    const min = Math.min(...history);
    const span = Math.max(max - min, max * 0.1, 1);
    const points = history
      .map((v, i) => `${((i / (history.length - 1)) * 236 + 2).toFixed(1)},${(40 - ((v - min) / span) * 36).toFixed(1)}`)
      .join(' ');
    r.line.setAttribute('points', points);
    r.chart.setAttribute('aria-label', `Population over the last ${history.length} years, from ${Math.round(history[0])} to ${Math.round(history[history.length - 1])}`);
  }
}
