// Общите градивни блокове на конзолата: полета, бутони, статус, таблица, известие.
// Всичко от сървъра влиза само като текст (h() от dom.js) — никога innerHTML.

import { $, announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';

export { $, clear, h, announce };

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

// ── Известия ─────────────────────────────────────────────────────────────────────────────────

export function toast(text, kind = 'ok') {
  const box = $('#toasts');
  if (!box) return;
  const el = h('p', { class: `toast toast-${kind}` }, text);
  box.append(el);
  announce(text);
  setTimeout(() => el.remove(), kind === 'err' ? 10000 : 5000);
}

// ── Диалог ───────────────────────────────────────────────────────────────────────────────────

/**
 * Модален диалог (нативният <dialog>: фокусът е затворен в него, Esc затваря).
 * actions: [{label, primary, danger, onClick}] — onClick може да е async; ако хвърли ApiError,
 * преведената грешка се показва в диалога и той остава отворен; `false` също го оставя отворен.
 * Основното действие е submit на формата (Enter работи, валидацията на полетата е нативна).
 */
export function dialog({
  title,
  body,
  actions = [],
  cancel = true,
  wide = false,
  closeLabel,
  onClose,
}) {
  // Диалог, отворен от друг диалог (който се затваря), връща фокуса към първоначалния бутон.
  const opener = document.activeElement?.closest?.('dialog')?.opener ?? document.activeElement;
  const titleId = uid('dlg');
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const footer = h('div', { class: 'dlg-actions' });
  const form = h('form', { class: 'dlg-form', novalidate: true });
  const dlg = h(
    'dialog',
    { class: `dlg${wide ? ' dlg-wide' : ''}`, 'aria-labelledby': titleId },
    h(
      'header',
      { class: 'dlg-head' },
      h('h2', { id: titleId }, title),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-quiet dlg-x',
          'aria-label': closeLabel ?? t('common.close'),
          onclick: () => dlg.close(),
        },
        '×',
      ),
    ),
    form,
  );
  form.append(h('div', { class: 'dlg-body' }, body), error, footer);

  const buttons = [];
  // `locked` държи бутон изключен и след края на заявката (напр. „Приложи“ преди прегледа).
  const setBusy = (busy) => {
    for (const b of buttons) b.disabled = busy || b.locked === true;
  };
  const setError = (text) => {
    error.textContent = text ?? '';
    error.hidden = !text;
  };
  const run = async (action) => {
    setError('');
    setBusy(true);
    try {
      const result = await action.onClick?.(api);
      if (result !== false) dlg.close();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  if (cancel) {
    const b = button(t('common.cancel'), () => dlg.close());
    buttons.push(b);
    footer.append(b);
  }
  let primary = null;
  for (const action of actions) {
    const b = h(
      'button',
      {
        type: action.primary ? 'submit' : 'button',
        class: `btn btn-${action.danger ? 'danger' : action.primary ? 'primary' : 'secondary'}`,
        onclick: action.primary ? undefined : () => run(action),
      },
      action.label,
    );
    if (action.primary) primary = action;
    action.ref?.(b);
    buttons.push(b);
    footer.append(b);
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!primary) return;
    if (!form.reportValidity()) return;
    void run(primary);
  });
  dlg.opener = opener;
  const api = { el: dlg, form, setError, setBusy, close: () => dlg.close() };
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    onClose?.();
  });
  document.body.append(dlg);
  dlg.showModal();
  const first = dlg.querySelector(
    '.dlg-body input:not([type=hidden]), .dlg-body select, .dlg-body textarea',
  );
  (
    first ??
    footer.querySelector('.btn-primary, .btn-danger') ??
    dlg.querySelector('.dlg-x')
  ).focus();
  return api;
}

/** Включва/изключва бутон трайно (преживява setBusy на диалога). */
export function lock(btn, locked) {
  btn.locked = locked;
  btn.disabled = locked;
}

/** Потвърждение с ясен текст; връща Promise<boolean>. */
export function confirmDialog({ title, message, confirmLabel, danger = false, extra }) {
  return new Promise((resolve) => {
    let answered = false;
    dialog({
      title,
      body: [h('p', {}, message), extra],
      actions: [
        {
          label: confirmLabel,
          primary: !danger,
          danger,
          onClick: () => {
            answered = true;
            resolve(true);
          },
        },
      ],
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
  });
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
