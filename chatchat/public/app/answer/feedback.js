// Обратна връзка за отговора (FR-10): полезен / не е полезен / техническа грешка. След „Не е
// полезен“/„Техническа грешка“ — по желание кратък коментар: стига до отговорника за знанието като
// предложение за подобрение (сървърът маскира личните данни; UI казва „без лични данни“).

import { h } from '../dom.js';
import { t } from '../i18n.js';

const NEGATIVE = new Set(['NOT_USEFUL', 'TECHNICAL_ERROR']);

/** Формата за коментар след отрицателна оценка. */
function commentForm(message, rating, onFeedback, status) {
  const id = `fbc-${message.id}`;
  const hintId = `${id}-hint`;
  const area = h('textarea', {
    id,
    class: 'fb-comment',
    rows: '3',
    maxlength: '1000',
    'aria-describedby': hintId,
    placeholder: t('fb.comment.placeholder'),
  });
  const send = h(
    'button',
    { class: 'btn btn-secondary btn-sm', type: 'submit' },
    t('fb.comment.send'),
  );
  const form = h(
    'form',
    { class: 'fb-comment-form', novalidate: true },
    h('label', { for: id }, t('fb.comment.label')),
    h('p', { id: hintId, class: 'hint' }, t('fb.comment.hint')),
    area,
    h('div', { class: 'fb-comment-row' }, send),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = area.value.trim();
    if (!comment) {
      area.focus();
      return;
    }
    send.disabled = true;
    area.readOnly = true;
    status.textContent = '';
    try {
      await onFeedback(message.id, rating, comment);
      form.replaceChildren(h('p', { class: 'form-note' }, t('fb.comment.thanks')));
      status.textContent = t('fb.comment.thanks');
    } catch {
      send.disabled = false;
      area.readOnly = false;
      status.textContent = t('fb.error');
    }
  });
  return form;
}

export function feedbackRow(message, onFeedback, rated) {
  const titleId = `fb-${message.id}`;
  const status = h('p', { class: 'fb-status', role: 'status' });
  const slot = h('div', { class: 'fb-slot' });
  const buttons = [];
  const make = (rating, key) => {
    const done = rated ? rated(message.id) : null;
    const b = h(
      'button',
      {
        type: 'button',
        'aria-pressed': done === rating ? 'true' : 'false',
        disabled: done ? true : null,
        class: `btn btn-secondary btn-fb${done === rating ? ' is-chosen' : ''}`,
        onclick: async () => {
          buttons.forEach((x) => (x.disabled = true));
          status.textContent = '';
          try {
            await onFeedback(message.id, rating);
            b.setAttribute('aria-pressed', 'true');
            b.classList.add('is-chosen');
            status.textContent = t('fb.thanks');
            if (NEGATIVE.has(rating)) {
              const form = commentForm(message, rating, onFeedback, status);
              slot.replaceChildren(form);
              form.querySelector('textarea')?.focus();
            }
          } catch {
            buttons.forEach((x) => (x.disabled = false));
            status.textContent = t('fb.error');
          }
        },
      },
      t(key),
    );
    buttons.push(b);
    return b;
  };
  const result = h(
    'div',
    { class: 'feedback', role: 'group', 'aria-labelledby': titleId },
    h('p', { id: titleId, class: 'fb-title' }, t('fb.title')),
    h(
      'div',
      { class: 'fb-buttons' },
      make('USEFUL', 'fb.useful'),
      make('NOT_USEFUL', 'fb.notUseful'),
      make('TECHNICAL_ERROR', 'fb.techError'),
    ),
    slot,
    status,
  );
  if (rated && rated(message.id)) status.textContent = t('fb.thanks');
  return result;
}
