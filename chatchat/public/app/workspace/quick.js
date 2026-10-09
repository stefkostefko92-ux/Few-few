// Бързи отговори (FR-20, AC-15): `:shortcut` в полето → предложения от GET /quick-responses.
// Изборът ВМЪКВА текста в полето, редактируем — нищо не се изпраща само (грешно съобщение към
// клиент не бива да излиза без човешки поглед). Шаблонът носи версия; показва се в бележката.

import { announce, clear, h } from '../dom.js';
import { getLang, t } from '../i18n.js';
import { wsApi } from './api.js';

const TTL = 5 * 60 * 1000;
const TOKEN = /(^|\s):([\p{L}\p{N}_-]{0,40})$/u;
const MAX_SUGGESTIONS = 6;

let cache = null;
let loadedAt = 0;
let inflight = null;
let uid = 0;

export async function loadQuickResponses(force = false) {
  if (!force && cache && Date.now() - loadedAt < TTL) return cache;
  inflight ??= wsApi
    .quickResponses()
    .then((d) => {
      cache = Array.isArray(d.quickResponses) ? d.quickResponses : [];
      loadedAt = Date.now();
      return cache;
    })
    .catch(() => cache ?? [])
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const resetQuickResponses = () => {
  cache = null;
  loadedAt = 0;
};

/** Съвпадения по префикс; езикът на интерфейса е пред другите. */
export function suggestionsFor(list, token) {
  const lang = getLang();
  const q = token.toLowerCase();
  return list
    .filter((r) => r.shortcut.startsWith(q))
    .sort(
      (a, b) =>
        Number(b.locale === lang) - Number(a.locale === lang) ||
        a.shortcut.localeCompare(b.shortcut),
    )
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} wrap позициониран родител на полето (за списъка и бележката)
 * @returns {() => void} разкачване
 */
export function attachQuickResponses(textarea, wrap) {
  const id = ++uid;
  const listId = `qr-list-${id}`;
  const list = h('ul', {
    class: 'qr-list',
    id: listId,
    role: 'listbox',
    'aria-label': t('qr.label'),
    hidden: true,
  });
  const note = h('p', { class: 'hint qr-note', role: 'status', hidden: true });
  wrap.append(list, note);
  textarea.setAttribute('role', 'combobox');
  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-expanded', 'false');
  textarea.setAttribute('aria-controls', listId);

  let items = [];
  let active = 0;
  let range = null; // [start, end] на :token в текста

  const close = () => {
    list.hidden = true;
    items = [];
    range = null;
    textarea.setAttribute('aria-expanded', 'false');
    textarea.removeAttribute('aria-activedescendant');
  };

  const paint = () => {
    clear(list);
    items.forEach((r, i) => {
      list.append(
        h(
          'li',
          {
            id: `qr-opt-${id}-${i}`,
            role: 'option',
            class: `qr-opt${i === active ? ' is-active' : ''}`,
            'aria-selected': String(i === active),
            // mousedown, не click: полето да не губи фокус преди избора
            onmousedown: (e) => {
              e.preventDefault();
              choose(i);
            },
          },
          h('span', { class: 'qr-short mono' }, `:${r.shortcut}`),
          h('span', { class: 'qr-title' }, r.title),
          h('span', { class: 'qr-meta' }, `${r.locale.toUpperCase()} · v${r.version}`),
        ),
      );
    });
    list.hidden = items.length === 0;
    textarea.setAttribute('aria-expanded', String(items.length > 0));
    if (items.length) textarea.setAttribute('aria-activedescendant', `qr-opt-${id}-${active}`);
  };

  const choose = (i) => {
    const r = items[i];
    if (!r || !range) return;
    const [start, end] = range;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = `${before}${r.body}${after}`;
    const caret = before.length + r.body.length;
    textarea.setSelectionRange(caret, caret);
    close();
    note.textContent = t('qr.inserted', { shortcut: r.shortcut, version: r.version });
    note.hidden = false;
    announce(note.textContent);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  };

  const update = async () => {
    const caret = textarea.selectionStart ?? 0;
    const m = TOKEN.exec(textarea.value.slice(0, caret));
    if (!m) return close();
    const quick = await loadQuickResponses();
    // Ответът закъсня и текстът е друг — не показваме остарели предложения.
    if (textarea.selectionStart !== caret) return;
    items = suggestionsFor(quick, m[2]);
    range = [caret - m[2].length - 1, caret];
    active = Math.min(active, Math.max(0, items.length - 1));
    if (items.length === 0) return close();
    paint();
  };

  const onInput = () => {
    note.hidden = true;
    void update();
  };
  const onKey = (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  textarea.addEventListener('input', onInput);
  textarea.addEventListener('keydown', onKey, true);
  textarea.addEventListener('blur', close);
  textarea.addEventListener('focus', () => void loadQuickResponses());
  return () => {
    textarea.removeEventListener('input', onInput);
    textarea.removeEventListener('keydown', onKey, true);
    list.remove();
    note.remove();
  };
}
