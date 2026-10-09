// Полето за съобщение в разговор: текст, Ctrl/Cmd+Enter или бутон „Изпрати“, бързи отговори
// (`:shortcut`, редактируеми преди изпращане). Изпращането е на родителя (оптимистично и
// идемпотентно); тук е само вводът. Етикетът е видим в основния изглед и скрит в плаващите прозорци.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { attachQuickResponses } from './quick.js';

/**
 * @param {{ scope: string, onSend: (text: string) => void, label?: string, hideLabel?: boolean }} opts
 */
export function createComposer({ scope, onSend, label, hideLabel = false }) {
  const id = `cmp-${scope}`;
  const area = h('textarea', {
    id,
    rows: '2',
    maxlength: '4000',
    required: true,
    placeholder: t('conv.placeholder'),
    'aria-describedby': `${id}-hint`,
  });
  const labelEl = h(
    'label',
    { for: id, class: hideLabel ? 'sr-only' : null },
    label ?? t('conv.composerLabel'),
  );
  const wrap = h('div', { class: 'qr-wrap' }, area);
  const send = h('button', { class: 'btn btn-primary btn-send', type: 'submit' }, t('chat.send'));
  const hint = h('p', { class: 'hint composer-keys', id: `${id}-hint` }, t('conv.sendHint'));
  const form = h(
    'form',
    {
      class: 'composer conv-composer',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        submit();
      },
    },
    labelEl,
    wrap,
    h('div', { class: 'composer-row' }, hint, send),
  );

  function submit() {
    const text = area.value.trim();
    if (!text) return area.focus();
    area.value = '';
    onSend(text);
    area.focus();
  }

  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });
  const detach = attachQuickResponses(area, wrap);

  return {
    el: form,
    focus: () => area.focus(),
    setDisabled: (value) => {
      area.disabled = value;
      send.disabled = value;
    },
    /** Нов език: преводите на неподвижните етикети. */
    relabel: () => {
      labelEl.textContent = label ?? t('conv.composerLabel');
      area.placeholder = t('conv.placeholder');
      send.textContent = t('chat.send');
      hint.textContent = t('conv.sendHint');
    },
    destroy: detach,
  };
}
