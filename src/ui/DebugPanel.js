import { el } from './dom.js';

/**
 * Developer overlay toggled with F3.
 *
 * Systems register a *section*: a function that returns { label: value }.
 * The panel polls visible sections a few times per second and only touches
 * the DOM when a value actually changed, so it costs nothing while hidden and
 * very little while shown.
 */
export class DebugPanel {
  /**
   * @param {HTMLElement} root
   * @param {{ visible?: boolean, refreshMs?: number }} [options]
   */
  constructor(root, { visible = false, refreshMs = 250 } = {}) {
    this._refreshMs = refreshMs;
    this._timer = null;
    this._sections = new Map(); // id -> { provider, rows: Map<label, {node, last}>, container, failed }
    this._content = el('div', { class: 'debug__content' });
    this.element = el(
      'aside',
      { class: 'debug', 'aria-label': 'Debug information', hidden: true },
      el('div', { class: 'debug__title', text: 'Debug (F3)' }),
      this._content,
    );
    root.append(this.element);
    this._onKeyDown = (event) => {
      if (event.key === 'F3') {
        event.preventDefault(); // browsers use F3 for "find"
        this.toggle();
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    if (visible) this.show();
  }

  get visible() { return !this.element.hidden; }

  toggle() { if (this.visible) this.hide(); else this.show(); }

  show() {
    this.element.hidden = false;
    this._refresh();
    if (this._timer === null) this._timer = window.setInterval(() => this._refresh(), this._refreshMs);
    console.info('[Debug] Panel shown.');
  }

  hide() {
    this.element.hidden = true;
    if (this._timer !== null) {
      window.clearInterval(this._timer);
      this._timer = null;
    }
    console.info('[Debug] Panel hidden.');
  }

  /**
   * Add (or replace) a section.
   * @param {string} id
   * @param {string} title
   * @param {() => Record<string, string|number>} provider
   */
  addSection(id, title, provider) {
    this.removeSection(id);
    const container = el('div', { class: 'debug__section' }, el('div', { class: 'debug__heading', text: title }));
    this._content.append(container);
    this._sections.set(id, { provider, container, rows: new Map(), failed: false });
    if (this.visible) this._refresh();
  }

  removeSection(id) {
    const section = this._sections.get(id);
    if (!section) return;
    section.container.remove();
    this._sections.delete(id);
  }

  _refresh() {
    for (const [id, section] of this._sections) {
      let values;
      try {
        values = section.provider();
      } catch (error) {
        if (!section.failed) console.error(`[Debug] Section "${id}" failed:`, error);
        section.failed = true;
        values = { Error: 'see console' };
      }
      for (const [label, raw] of Object.entries(values)) {
        const text = String(raw);
        let row = section.rows.get(label);
        if (!row) {
          const node = el('span', { class: 'debug__value' });
          section.container.append(el('div', { class: 'debug__row' }, el('span', { class: 'debug__label', text: label }), node));
          row = { node, last: null };
          section.rows.set(label, row);
        }
        if (row.last !== text) {
          row.node.textContent = text;
          row.last = text;
        }
      }
    }
  }
}
