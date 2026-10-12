// Сравнение на две ревизии на един документ (§4.1 „confronto tra revisioni“) една до друга:
// метаданни (само разликите), приложимост (вкл. табло), компоненти и текст по страници (редова
// разлика: изтрито вляво, добавено вдясно). Изтритото/добавеното е белязано с текст и знак, не
// само с цвят.

import { t } from '../i18n.js';
import { call, fmtDate } from './core.js';
import { statusBadge } from './kb-common.js';
import { badge, dialog, errText, h, toast } from './ui.js';

const DATE_FIELDS = new Set(['effectiveFrom', 'effectiveTo']);

function value(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (DATE_FIELDS.has(field)) return fmtDate(v);
  if (typeof v === 'boolean') return v ? t('admin.yes') : t('admin.no');
  if (field === 'status') return t(`admin.status.${v}`);
  if (field === 'type') return t(`admin.docType.${v}`);
  if (field === 'audience') return t(`admin.audience.${v}`);
  if (field === 'checksum') return `${String(v).slice(0, 16)}…`;
  return String(v);
}

function metadataTable(cmp) {
  if (cmp.metadata.length === 0) return h('p', { class: 'muted' }, t('admin.kb.compare.sameMeta'));
  return h(
    'div',
    { class: 'tbl-wrap' },
    h(
      'table',
      { class: 'tbl kb-cmp-meta' },
      h('caption', { class: 'sr-only' }, t('admin.kb.compare.metadata')),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, t('admin.kb.compare.field')),
          h('th', { scope: 'col' }, cmp.a.revision),
          h('th', { scope: 'col' }, cmp.b.revision),
        ),
      ),
      h(
        'tbody',
        {},
        ...cmp.metadata.map((m) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, t(`admin.kb.field.${m.field}`)),
            h('td', {}, value(m.field, m.a)),
            h('td', {}, value(m.field, m.b)),
          ),
        ),
      ),
    ),
  );
}

/** Множество: само в A (махнато), само в B (добавено), общо. */
function setBlock(diff, emptyKey) {
  if (!diff.onlyA.length && !diff.onlyB.length) {
    return h('p', { class: 'muted' }, t(emptyKey));
  }
  const list = (items, kind, sign, labelKey) =>
    items.length
      ? h(
          'ul',
          { class: `plain kb-set kb-set-${kind}` },
          ...items.map((x) =>
            h(
              'li',
              {},
              h('span', { class: 'kb-sign', 'aria-hidden': 'true' }, sign),
              h('span', { class: 'sr-only' }, `${t(labelKey)}: `),
              x,
            ),
          ),
        )
      : null;
  return h(
    'div',
    {},
    list(diff.onlyA, 'del', '−', 'admin.kb.compare.removed'),
    list(diff.onlyB, 'add', '+', 'admin.kb.compare.added'),
  );
}

/** Една страница: два стълба (A | B), ред по ред от редовата разлика. */
function pageBlock(p) {
  const head = h(
    'h4',
    { class: 'kb-cmp-page' },
    t('admin.kb.compare.page', { page: p.page }),
    ' ',
    badge(p.status === 'same' ? 'ok' : 'warn', t(`admin.kb.compare.status.${p.status}`)),
  );
  if (p.status === 'same') return h('section', {}, head);
  if (!p.lines)
    return h('section', {}, head, h('p', { class: 'hint' }, t('admin.kb.compare.tooLarge')));
  const cell = (text, kind) =>
    h(
      'div',
      { class: `kb-diff-cell kb-diff-${kind}` },
      kind === 'same'
        ? null
        : h(
            'span',
            { class: 'sr-only' },
            `${t(kind === 'del' ? 'admin.kb.compare.removed' : 'admin.kb.compare.added')}: `,
          ),
      text,
    );
  const empty = () => h('div', { class: 'kb-diff-cell kb-diff-none', 'aria-hidden': 'true' });
  const rows = p.lines.map((l) =>
    h(
      'div',
      { class: 'kb-diff-row' },
      l.op === '+' ? empty() : cell(l.text, l.op === '-' ? 'del' : 'same'),
      l.op === '-' ? empty() : cell(l.text, l.op === '+' ? 'add' : 'same'),
    ),
  );
  return h('section', {}, head, h('div', { class: 'kb-diff' }, ...rows));
}

export async function openCompare(aId, bId) {
  let cmp;
  try {
    cmp = await call(
      'GET',
      `/admin/documents/compare?a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}`,
    );
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const side = (d) =>
    h(
      'div',
      { class: 'kb-cmp-side' },
      h('p', { class: 'mono' }, `${d.code} · ${d.revision}`),
      statusBadge(d.status),
    );
  const d = dialog({
    title: t('admin.kb.compare.title', { code: cmp.a.code }),
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      h('div', { class: 'kb-cmp-heads' }, side(cmp.a), side(cmp.b)),
      h('h3', { class: 'sub' }, t('admin.kb.compare.metadata')),
      metadataTable(cmp),
      h('h3', { class: 'sub' }, t('admin.docs.applicability')),
      setBlock(cmp.applicability, 'admin.kb.compare.sameRules'),
      h('h3', { class: 'sub' }, t('admin.kb.compare.components')),
      setBlock(cmp.components, 'admin.kb.compare.sameComponents'),
      h('h3', { class: 'sub' }, t('admin.kb.compare.text')),
      cmp.truncated ? h('p', { class: 'note note-warn' }, t('admin.kb.compare.truncated')) : null,
      ...cmp.pages.map(pageBlock),
    ],
    actions: [],
  });
  // Дългото сравнение е само текст (без бутони): тялото се фокусира, за да се превърта с клавиатура.
  const body = d.el.querySelector('.dlg-body');
  if (body) {
    body.tabIndex = 0;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', t('admin.kb.compare.title', { code: cmp.a.code }));
  }
}
