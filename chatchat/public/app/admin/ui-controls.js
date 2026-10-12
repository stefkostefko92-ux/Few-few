// Полетата и бутоните на конзолата (част от `ui.js` — внасяй през него).
// Всичко от сървъра влиза само като текст (h() от dom.js) — никога innerHTML.

import { h } from '../dom.js';
import { errorText } from '../errors.js';

let seq = 0;
export const uid = (prefix = 'id') => `${prefix}-${++seq}`;

/** Преведено съобщение за грешка (никога суровият текст на сървъра). */
export const errText = (err) => {
  const base = errorText(err);
  return typeof err?.extra === 'string' && err.extra ? `${base} ${err.extra}` : base;
};

// ── Полета ───────────────────────────────────────────────────────────────────────────────────

/**
 * Поле с етикет: `control` е готов input/select/textarea; връзката label→control е винаги
 * явна (for/id), подсказката е свързана с aria-describedby.
 */
export function field(label, control, { hint, wide = false } = {}) {
  if (!control.id) control.id = uid('f');
  const children = [h('label', { for: control.id }, label)];
  children.push(control);
  if (hint) {
    const hintId = `${control.id}-hint`;
    control.setAttribute('aria-describedby', hintId);
    children.push(h('p', { class: 'hint', id: hintId }, hint));
  }
  return h('div', { class: `field${wide ? ' field-wide' : ''}` }, ...children);
}

export function input(props = {}) {
  return h('input', { type: 'text', autocomplete: 'off', ...props });
}

/** Падащ списък от [{value, label}]; `selected` е стойността за избор. */
export function select(options, selected = '', props = {}) {
  const el = h('select', props);
  for (const o of options) {
    const opt = h('option', { value: o.value }, o.label);
    if (o.value === selected) opt.selected = true;
    el.append(opt);
  }
  return el;
}

export function checkbox(label, props = {}) {
  const box = h('input', { type: 'checkbox', ...props });
  box.id = box.id || uid('c');
  return h('div', { class: 'check' }, box, h('label', { for: box.id }, label));
}

export function textarea(props = {}) {
  return h('textarea', { rows: 3, ...props });
}

// ── Бутони ───────────────────────────────────────────────────────────────────────────────────

export function button(label, onClick, { kind = 'secondary', small = false, ...rest } = {}) {
  const cls = `btn btn-${kind}${small ? ' btn-sm' : ''}${rest.class ? ` ${rest.class}` : ''}`;
  return h('button', { type: 'button', onclick: onClick, ...rest, class: cls }, label);
}

/** Статусен знак: форма + текст (не само цвят). kind: ok | warn | stop | info | idle. */
export function badge(kind, text) {
  return h('span', { class: `badge badge-${kind}` }, text);
}
