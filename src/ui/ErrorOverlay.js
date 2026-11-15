import { el } from './dom.js';
import { openModal } from './dialogs.js';

const DEDUPE_WINDOW_MS = 5000;

/** One-line, human-readable description of anything that was thrown. */
export function describeError(error) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Shows errors to the player instead of leaving a frozen or blank screen.
 * It is built from plain DOM and does not depend on Phaser, so it still works
 * if the game engine failed to start. Every error is also logged by whoever
 * raised it; this overlay never hides anything from the console.
 */
export class ErrorOverlay {
  constructor() {
    this._dialog = null;
    this._extraNote = null;
    this._extraCount = 0;
    this._recent = new Map(); // message key -> time last shown
  }

  /** Report an unexpected exception. */
  report(error, { title = 'Something went wrong', recoverable = true } = {}) {
    this.show({ title, message: describeError(error), error, recoverable });
  }

  /**
   * @param {{ title?: string, message?: string, error?: unknown, recoverable?: boolean }} info
   *   `recoverable: false` removes the Continue button: the only way forward is a reload.
   */
  show({ title = 'Something went wrong', message = 'An unexpected error occurred.', error = null, recoverable = true } = {}) {
    if (this._dialog) {
      this._extraCount++;
      if (this._extraNote) {
        this._extraNote.textContent = `${this._extraCount} more error${this._extraCount === 1 ? '' : 's'} occurred. See the browser console.`;
      }
      return;
    }
    const key = `${title}|${message}`;
    const now = Date.now();
    if (now - (this._recent.get(key) ?? -Infinity) < DEDUPE_WINDOW_MS) return; // repeat of an error just shown
    this._recent.set(key, now);

    const stack = error instanceof Error && error.stack ? error.stack : '';
    this._extraCount = 0;
    this._extraNote = el('p', { class: 'dialog__note', role: 'status' });

    const actions = el('div', { class: 'dialog__actions' });
    if (recoverable) actions.append(el('button', { class: 'btn', value: 'continue', text: 'Continue' }));
    actions.append(
      el('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: 'Reload page',
        onClick: () => window.location.reload(),
      }),
    );

    const dialog = el(
      'dialog',
      { class: 'dialog dialog--error', role: 'alertdialog', 'aria-labelledby': 'error-title', 'aria-describedby': 'error-message' },
      el(
        'form',
        { method: 'dialog', class: 'dialog__body' },
        el('h2', { id: 'error-title', class: 'dialog__title', text: title }),
        el('p', { id: 'error-message', class: 'dialog__text', text: message }),
        stack
          ? el('details', { class: 'dialog__details' }, el('summary', { text: 'Technical details' }), el('pre', { text: stack }))
          : null,
        this._extraNote,
        actions,
      ),
    );
    if (!recoverable) dialog.addEventListener('cancel', (event) => event.preventDefault());
    dialog.addEventListener('close', () => {
      dialog.remove();
      this._dialog = null;
      this._extraNote = null;
    });
    this._dialog = dialog;
    document.body.append(dialog);
    openModal(dialog);
  }
}
