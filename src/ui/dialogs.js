import { el } from './dom.js';

let dialogCounter = 0;

/** Open a <dialog> modally, falling back to a plain open attribute on very old browsers. */
export function openModal(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/**
 * Ask a yes/no question in a modal dialog.
 * Resolves true only when the confirm button is used; Escape and Cancel resolve false.
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
}) {
  return new Promise((resolve) => {
    if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }
    const titleId = `dialog-title-${++dialogCounter}`;
    const dialog = el(
      'dialog',
      { class: 'dialog', 'aria-labelledby': titleId },
      el(
        'form',
        { method: 'dialog', class: 'dialog__body' },
        el('h2', { id: titleId, class: 'dialog__title', text: title }),
        el('p', { class: 'dialog__text', text: message }),
        el(
          'div',
          { class: 'dialog__actions' },
          // Cancel is focused first so Enter never confirms a destructive action by accident.
          el('button', { class: 'btn', value: 'cancel', autofocus: true, text: cancelLabel }),
          el('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, value: 'confirm', text: confirmLabel }),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed);
    });
    document.body.append(dialog);
    openModal(dialog);
  });
}
