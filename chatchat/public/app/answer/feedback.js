// Обратна връзка за отговора: полезен / не е полезен / техническа грешка.

import { h } from '../dom.js';
import { t } from '../i18n.js';

export function feedbackRow(message, onFeedback, rated) {
  const titleId = `fb-${message.id}`;
  const status = h('p', { class: 'fb-status', role: 'status' });
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
    status,
  );
  if (rated && rated(message.id)) status.textContent = t('fb.thanks');
  return result;
}
