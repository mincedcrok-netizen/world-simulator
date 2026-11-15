/**
 * Tiny DOM helpers so UI code can build elements without innerHTML and
 * without a framework.
 */

/**
 * Create an element.
 *   el('button', { class: 'btn', onClick: fn, 'aria-pressed': 'false' }, 'Label')
 * Props: `class`, `text`, `dataset`, `onXxx` listeners, anything else becomes an attribute.
 * `true` sets a boolean attribute; `false`, `null` and `undefined` skip the prop.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.length > 2 && key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  play: 'M6 4.5v15l13-7.5z',
  pause: 'M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z',
  chevronRight: 'M9 5l7 7-7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
};

/** Small inline SVG icon (decorative: hidden from assistive tech). */
export function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name] ?? '');
  if (name.startsWith('chevron')) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2.2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  } else {
    path.setAttribute('fill', 'currentColor');
  }
  svg.append(path);
  return svg;
}

/** True when a keyboard event came from somewhere the player is typing or a modal is open. */
export function isTypingContext(target) {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"], dialog[open]') !== null
  );
}

/** Format an integer with thousands separators (Year 12,345). */
const numberFormat = new Intl.NumberFormat('en-US');
export function formatNumber(value) {
  return numberFormat.format(value);
}
