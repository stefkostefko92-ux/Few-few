// Диалозите на конзолата (част от `ui.js` — внасяй през него): модален диалог, потвърждение.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { button, errText, uid } from './ui-controls.js';

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
