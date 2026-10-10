// Търсенето в историята (FR-16) и списъците „Da fare“ / „Preferiti“ (§12.1) в основната част.
// Сървърът търси само в достъпното и връща откъса като ЧАСТИ ({ text, match }) — тук те стават
// текстови възли и <mark>; HTML от сървъра няма. Резултатът отваря съобщението в контекста му.

import { $, announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { fmtStamp, roleLabel } from '../format.js';
import { t } from '../i18n.js';
import { wsApi } from './api.js';
import { titleOf, ws } from './model.js';

/** Последното търсене — пази се при смяна на изгледа/езика (само в паметта). */
const last = { q: '', results: [], cursor: null, error: '', searched: false };

function setHead(title, tools) {
  $('#list-title').textContent = title;
  clear($('#list-tools')).append(...(tools ?? []));
}

/** Заглавието на разговора на резултата: познатият от лентата, иначе по вид/име. */
export function placeOf(conv) {
  if (!conv?.id) return '';
  const known = ws.convs.get(conv.id);
  if (known) return titleOf(known);
  if (conv.type === 'CASE') return t('conv.caseDiscussion', { number: conv.name ?? '' }).trim();
  if (conv.name) return conv.name;
  return conv.type === 'DIRECT' ? t('conv.direct') : t('conv.group');
}

function whoOf(r) {
  if (r.kind === 'AI') return t('ai.label');
  if (r.kind === 'SYSTEM') return t('chat.system');
  if (r.source === 'case') return r.authorName ?? roleLabel(r.authorRole);
  return r.sender?.name ?? t('msg.unknownSender');
}

function snippet(parts) {
  return h(
    'p',
    { class: 'hit-snippet' },
    (parts ?? []).map((p) => (p.match ? h('mark', null, p.text) : p.text)),
  );
}

function hit(r, onOpen) {
  const where =
    r.source === 'case'
      ? t('search.inCase', { number: r.caseNumber ?? '' })
      : t('search.inConversation', { name: placeOf(r.conversation) });
  return h(
    'li',
    null,
    h(
      'button',
      { class: 'search-hit', type: 'button', onclick: () => onOpen(r) },
      h(
        'span',
        { class: 'hit-top' },
        h('span', { class: 'hit-where' }, where),
        r.replyToId ? h('span', { class: 'muted' }, `· ${t('search.inThread')}`) : null,
        h('time', { class: 'when', datetime: String(r.createdAt) }, fmtStamp(r.createdAt)),
      ),
      h('span', { class: 'hit-who' }, whoOf(r)),
      snippet(r.snippet),
      h('span', { class: 'sr-only' }, t('search.openHint')),
    ),
  );
}

async function runSearch(q, { more = false } = {}) {
  last.error = '';
  try {
    const data = await wsApi.search(q, more ? last.cursor : null);
    last.results = more ? [...last.results, ...(data.results ?? [])] : (data.results ?? []);
    last.cursor = data.nextCursor ?? null;
  } catch (err) {
    last.error = errorText(err);
    if (!more) last.results = [];
  }
  last.q = q;
  last.searched = true;
}

export function renderSearch({ onOpen, focus = false }) {
  setHead(t('search.title'));
  const body = clear($('#list-body'));
  const status = h('p', { class: 'muted', role: 'status', id: 'search-status' });
  const input = h('input', {
    id: 'search-q',
    type: 'search',
    value: last.q,
    minlength: '2',
    maxlength: '200',
    autocomplete: 'off',
    placeholder: t('search.placeholder'),
    'aria-describedby': 'search-hint',
  });
  const form = h(
    'form',
    {
      class: 'search-form',
      role: 'search',
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q.length < 2) {
          status.textContent = t('search.tooShort');
          return input.focus();
        }
        status.textContent = t('search.searching');
        await runSearch(q);
        renderResults();
        announce(last.error || t('search.shown', { count: last.results.length }));
        return undefined;
      },
    },
    h('label', { for: 'search-q' }, t('search.label')),
    h(
      'div',
      { class: 'search-row' },
      input,
      h('button', { class: 'btn btn-primary', type: 'submit' }, t('search.submit')),
    ),
    h('p', { class: 'hint', id: 'search-hint' }, t('search.hint')),
  );
  const results = h('ul', { class: 'search-hits', 'aria-label': t('search.resultsLabel') });
  body.append(form, status, results);

  function renderResults() {
    clear(results);
    status.classList.toggle('form-error', Boolean(last.error));
    if (last.error) status.textContent = last.error;
    else if (last.searched && last.results.length === 0) status.textContent = t('search.empty');
    else if (last.searched) status.textContent = t('search.shown', { count: last.results.length });
    for (const r of last.results) results.append(hit(r, onOpen));
    if (last.cursor) {
      results.append(
        h(
          'li',
          null,
          h(
            'button',
            {
              class: 'btn btn-secondary',
              type: 'button',
              onclick: async () => {
                await runSearch(last.q, { more: true });
                renderResults();
              },
            },
            t('search.more'),
          ),
        ),
      );
    }
  }
  renderResults();
  if (focus) input.focus();
}

// ── „Da fare“ / „Preferiti“ ─────────────────────────────────────────────────────────────────

export async function renderMarked({ kind, onOpen }) {
  setHead(t(kind === 'TODO' ? 'ws.nav.todo' : 'ws.nav.saved'));
  const body = clear($('#list-body'));
  body.append(h('p', { class: 'muted' }, t('conv.loading')));
  let items = [];
  let cursor = null;
  const list = h('ul', { class: 'search-hits' });
  const load = async (more) => {
    const data = await wsApi.marked(kind, more ? cursor : null);
    items = more ? [...items, ...(data.items ?? [])] : (data.items ?? []);
    cursor = data.nextCursor ?? null;
  };
  const remove = async (item) => {
    try {
      await wsApi.mark(item.messageId, kind === 'TODO' ? 'todo' : 'starred', false);
      items = items.filter((x) => x !== item);
      draw();
    } catch (err) {
      announce(errorText(err));
    }
  };
  function draw() {
    clear(body);
    if (items.length === 0) body.append(h('p', { class: 'muted' }, t('ws.marked.empty')));
    clear(list);
    for (const item of items) {
      list.append(
        h(
          'li',
          { class: 'marked-row' },
          h(
            'button',
            {
              class: 'search-hit',
              type: 'button',
              onclick: () => onOpen({ ...item, id: item.messageId, source: 'conversation' }),
            },
            h(
              'span',
              { class: 'hit-top' },
              h('span', { class: 'hit-where' }, placeOf(item.conversation)),
              h(
                'time',
                { class: 'when', datetime: String(item.createdAt) },
                fmtStamp(item.createdAt),
              ),
            ),
            h('span', { class: 'hit-who' }, item.sender?.name ?? t('msg.unknownSender')),
            h('p', { class: 'hit-snippet' }, item.preview),
          ),
          h(
            'button',
            { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => void remove(item) },
            t('ws.marked.remove'),
          ),
        ),
      );
    }
    body.append(list);
    if (cursor) {
      body.append(
        h(
          'button',
          {
            class: 'btn btn-secondary',
            type: 'button',
            onclick: async () => {
              await load(true);
              draw();
            },
          },
          t('ws.marked.more'),
        ),
      );
    }
  }
  try {
    await load(false);
    draw();
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error', role: 'alert' }, errorText(err)));
  }
}

export function resetSearch() {
  Object.assign(last, { q: '', results: [], cursor: null, error: '', searched: false });
}
