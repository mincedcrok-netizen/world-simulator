import { el } from './dom.js';

/** Full-screen "please wait" shown while a world is being generated. */
export class LoadingOverlay {
  constructor(root) {
    this._text = el('p', { class: 'loading__text' });
    this.element = el(
      'div',
      { class: 'loading', role: 'status', 'aria-live': 'polite', hidden: true },
      el('div', { class: 'loading__spinner', 'aria-hidden': 'true' }),
      this._text,
    );
    root.append(this.element);
  }

  show(message = 'Loading…') {
    this._text.textContent = message;
    this.element.hidden = false;
  }

  hide() {
    this.element.hidden = true;
  }
}
