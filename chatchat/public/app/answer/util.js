// Общи помощници за блоковете на отговора (само DOM възли и textContent — никога innerHTML).

import { h } from '../dom.js';

export const arr = (v) => (Array.isArray(v) ? v : []);
export const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function icon(kind) {
  // kind: warn | stop | info — формата различава, не само цветът
  return h(
    'span',
    { class: `ico ico-${kind}`, 'aria-hidden': 'true' },
    kind === 'stop' ? '×' : kind === 'warn' ? '!' : 'i',
  );
}

export function block(title, className, ...body) {
  return h(
    'section',
    { class: `blk ${className ?? ''}`.trim() },
    title ? h('h3', { class: 'blk-title' }, title) : null,
    ...body,
  );
}
