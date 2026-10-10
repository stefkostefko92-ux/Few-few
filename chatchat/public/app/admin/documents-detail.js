// Един документ: метаданните §7.2, приложимостта (вкл. табло), прегледът на страниците преди
// публикуване, ревизиите на кода (със сравнение), кодовете с този източник, историята от одита и
// позволените преходи (§4.1/§7.3, AC-10). Документите са неизменими: няма „редакция“ — само
// преходи. Четирите очи (§11.3): документ по безопасност не се публикува от качилия/пратилия.

import { t } from '../i18n.js';
import { call, fmtDate } from './core.js';
import { openCompare } from './documents-compare.js';
import { NEXT, runTransition } from './documents-actions.js';
import { previewBlock } from './documents-preview.js';
import {
  boardBadge,
  historyList,
  lifecycle,
  ruleText,
  statusBadge,
  validityBadge,
  validityText,
} from './kb-common.js';
import { badge, button, dialog, errText, h, toast } from './ui.js';
import { definitionList } from './users-common.js';

function fourEyesNote(doc) {
  if (!doc.safetyRelevant) return null;
  const blocked = doc.fourEyesBlocked && doc.status === 'REVIEW';
  return h(
    'p',
    { class: `note ${blocked ? 'note-warn' : ''}` },
    blocked ? t('admin.kb.fourEyes.blocked') : t('admin.kb.fourEyes.rule'),
  );
}

const olderFirst = (x, y) =>
  new Date(x.createdAt).getTime() <= new Date(y.createdAt).getTime() ? [x.id, y.id] : [y.id, x.id];

function revisionsBlock(detail) {
  const others = detail.revisions.filter((r) => !r.current);
  if (others.length === 0) return h('p', { class: 'muted' }, t('admin.kb.revisions.none'));
  return h(
    'ul',
    { class: 'plain kb-revisions' },
    ...others.map((r) =>
      h(
        'li',
        {},
        h('span', { class: 'mono' }, `${detail.document.code} · ${r.revision}`),
        ' ',
        statusBadge(r.status),
        ' ',
        // Старата ревизия вляво, новата вдясно (по реда на качване).
        button(
          t('admin.kb.compare.go'),
          () => void openCompare(...olderFirst(r, detail.document)),
          {
            small: true,
            'aria-label': `${t('admin.kb.compare.go')}: ${r.revision} → ${detail.document.revision}`,
          },
        ),
      ),
    ),
  );
}

function errorsBlock(errors) {
  if (!errors.length) return h('p', { class: 'muted' }, t('admin.kb.errors.none'));
  return h(
    'ul',
    { class: 'plain' },
    ...errors.map((e) =>
      h(
        'li',
        {},
        h('span', { class: 'mono' }, `${e.code} v${e.version}`),
        ' ',
        statusBadge(e.status),
      ),
    ),
  );
}

/** Отваря детайла на документ (ред от списъка или { id }). `reload` обновява списъка. */
export async function openDocument(row, reload) {
  let detail;
  try {
    detail = await call('GET', `/admin/documents/${encodeURIComponent(row.id)}`);
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const doc = detail.document;
  const supersedes = detail.revisions.find((r) => r.id === doc.supersedesId);
  const buttons = h('div', { class: 'btn-row' });
  let d = null;
  const done = () => {
    d?.close();
    reload?.();
  };
  for (const [action, kind] of NEXT[doc.status] ?? []) {
    const blocked = action === 'publish' && doc.fourEyesBlocked;
    buttons.append(
      button(t(`admin.kb.act.${action}`), () => void runTransition(doc, action, done), {
        kind,
        disabled: blocked || undefined,
      }),
    );
  }
  d = dialog({
    title: `${doc.code} · ${doc.revision}`,
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      h('p', { class: 'doc-title' }, doc.title),
      lifecycle(doc.status),
      h(
        'p',
        { class: 'btn-row' },
        validityBadge(doc),
        boardBadge(doc),
        doc.safetyRelevant ? badge('warn', t('admin.docs.safetyBadge')) : null,
      ),
      fourEyesNote(doc),
      doc.status === 'PUBLISHED' || doc.status === 'DEPRECATED'
        ? h('p', { class: 'hint' }, t('admin.kb.immutable'))
        : null,
      definitionList([
        [t('admin.docs.type'), t(`admin.docType.${doc.type}`)],
        [t('admin.docs.audience'), t(`admin.audience.${doc.audience}`)],
        [t('admin.docs.language'), doc.language.toUpperCase()],
        [t('admin.kb.validity'), validityText(doc)],
        [t('admin.docs.subsystem'), doc.subsystem ?? ''],
        [t('admin.docs.supersedes'), supersedes ? supersedes.revision : ''],
        [t('admin.kb.sourceFilename'), doc.sourceFilename],
        [t('admin.docs.chunks'), String(doc.chunks)],
        [
          t('admin.docs.checksum'),
          h('span', { class: 'mono small' }, `${doc.checksum.slice(0, 16)}…`),
        ],
        [t('admin.docs.publishedAt'), fmtDate(doc.publishedAt)],
        [t('admin.docs.deprecatedAt'), fmtDate(doc.deprecatedAt)],
      ]),
      h('h3', { class: 'sub' }, t('admin.docs.applicability')),
      h('ul', { class: 'plain' }, ...doc.applicability.map((a) => h('li', {}, ruleText(a)))),
      h('h3', { class: 'sub' }, t('admin.kb.preview.title')),
      previewBlock(detail),
      h('h3', { class: 'sub' }, t('admin.kb.revisions.title')),
      revisionsBlock(detail),
      h('h3', { class: 'sub' }, t('admin.kb.errors.title')),
      errorsBlock(detail.errors),
      h('h3', { class: 'sub' }, t('admin.kb.history.title')),
      historyList(detail.history),
      buttons.children.length ? h('h3', { class: 'sub' }, t('admin.docs.next')) : null,
      buttons,
    ],
    actions: [],
  });
  return d;
}
