// Общите градивни блокове на конзолата: полета, бутони, статус, таблица, известие.
// Всичко от сървъра влиза само като текст (h() от dom.js) — никога innerHTML.
// Полетата и бутоните са в `ui-controls.js`, диалозите — в `ui-dialog.js`; тук се внасят всички.

import { $, announce, clear, h } from '../dom.js';
import { t } from '../i18n.js';
import { button, errText, input } from './ui-controls.js';

export { $, clear, h, announce };
export {
  uid,
  errText,
  field,
  input,
  select,
  checkbox,
  textarea,
  button,
  badge,
} from './ui-controls.js';
export { dialog, lock, confirmDialog } from './ui-dialog.js';

// ── Известия ─────────────────────────────────────────────────────────────────────────────────

export function toast(text, kind = 'ok') {
  const box = $('#toasts');
  if (!box) return;
  const el = h('p', { class: `toast toast-${kind}` }, text);
  box.append(el);
  announce(text);
  setTimeout(() => el.remove(), kind === 'err' ? 10000 : 5000);
}

// ── Таблица ──────────────────────────────────────────────────────────────────────────────────

/**
 * Таблица, която на тесен екран става списък от карти: всяка клетка носи data-label.
 * columns: [{label, render(row) → Node|string, cls}], select: {isSelected(row), toggle(row, on)}.
 */
export function dataTable({ columns, rows, caption, rowClass }) {
  const head = h(
    'tr',
    {},
    ...columns.map((c) => h('th', { scope: 'col', class: c.cls }, c.head ?? c.label)),
  );
  const body = h('tbody');
  for (const row of rows) {
    const tr = h('tr', { class: rowClass?.(row) });
    for (const c of columns) {
      tr.append(h('td', { 'data-label': c.label ?? '', class: c.cls }, c.render(row)));
    }
    body.append(tr);
  }
  return h(
    'div',
    { class: 'tbl-wrap' },
    h(
      'table',
      { class: 'tbl' },
      caption ? h('caption', { class: 'sr-only' }, caption) : null,
      h('thead', {}, head),
      body,
    ),
  );
}

export function emptyState(message, hint) {
  return h(
    'div',
    { class: 'empty' },
    h('p', { class: 'empty-title' }, message),
    hint ? h('p', { class: 'muted' }, hint) : null,
  );
}

export function loading(message = t('admin.loading')) {
  return h('p', { class: 'muted loading', role: 'status' }, message);
}

export function failure(err, retry) {
  return h(
    'div',
    { class: 'empty empty-err', role: 'alert' },
    h('p', { class: 'form-error' }, errText(err)),
    retry ? button(t('admin.retry'), retry) : null,
  );
}

/** Заглавие на раздела + действия отдясно. */
export function sectionHead(title, ...actions) {
  return h(
    'div',
    { class: 'sec-head' },
    h('h1', { tabindex: '-1', id: 'sec-title' }, title),
    h('div', { class: 'sec-actions' }, ...actions),
  );
}

// ── Еднократна тайна ─────────────────────────────────────────────────────────────────────────

/**
 * Блок за стойност, която се вижда САМО сега (линк за парола): само за четене, с копиране.
 * Не се пази никъде; след затваряне на диалога няма как да се върне.
 */
export function onceSecret({ label, value, note }) {
  const box = input({
    type: 'text',
    readonly: true,
    value,
    class: 'once-value mono',
    spellcheck: 'false',
    'aria-label': label,
  });
  const copy = button(t('admin.copy'), async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t('admin.copied'));
    } catch {
      box.focus();
      box.select();
      toast(t('admin.copyManual'), 'warn');
    }
  });
  return h(
    'div',
    { class: 'once' },
    h('p', { class: 'once-title' }, t('admin.once.title')),
    h('div', { class: 'inline' }, box, copy),
    note ? h('p', { class: 'hint' }, note) : null,
  );
}
