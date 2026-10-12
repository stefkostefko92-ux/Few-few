// Едно предложение за знанието: какво е (коментар / конфликт / чернова от решен случай), откъде
// идва, историята на решението и позволените действия: „Прегледай“ (NEW → IN_REVIEW), „Приеми“ с
// връзка към документ/код (IN_REVIEW → ACCEPTED), „Отхвърли“ с причина (IN_REVIEW → REJECTED).
// Сървърът проверява всичко наново (kb:manage, клиент, статус).

import { has, t } from '../i18n.js';
import { call, fmtDateTime, query } from './core.js';
import { openDocument } from './documents-detail.js';
import { badge, button, dialog, errText, field, h, select, textarea, toast } from './ui.js';

const STATUS_KIND = { NEW: 'info', IN_REVIEW: 'warn', ACCEPTED: 'ok', REJECTED: 'stop' };
const SOURCE_KIND = { FEEDBACK: 'info', SOLVED_CASE: 'ok', CONFLICT: 'warn' };

export const statusBadge = (s) => badge(STATUS_KIND[s] ?? 'idle', t(`kbq.status.${s}`));
export const sourceBadge = (s) => badge(SOURCE_KIND[s] ?? 'idle', t(`kbq.source.${s}`));

/** Грешката на действие — с превод под префикса на опашката, ако има такъв. */
const actionError = (err) =>
  err?.code && has(`kbq.err.${err.code}`) ? t(`kbq.err.${err.code}`) : errText(err);

/** „MAN-500 rev. A“ — кодът и ревизията на запис от конфликта. */
const itemText = (i) =>
  i.kind === 'error' && i.errorCode
    ? t('kbq.conflict.errorItem', { code: i.errorCode, doc: i.documentCode, rev: i.revision })
    : t('kbq.conflict.docItem', { doc: i.documentCode, rev: i.revision });

/** Едноредово описание за таблицата. */
export function proposalSummary(p) {
  if (p.source === 'CONFLICT' && p.conflict) {
    const items = (p.conflict.items ?? []).map(itemText);
    return h(
      'span',
      {},
      t(p.conflict.kind === 'error' ? 'kbq.conflict.error' : 'kbq.conflict.revision', {
        code: p.conflict.code,
      }),
      ': ',
      items.join(t('kbq.conflict.between')),
    );
  }
  if (p.source === 'SOLVED_CASE') {
    return h(
      'span',
      {},
      p.draftDocument
        ? t('kbq.solved.draft', { code: p.draftDocument.code, rev: p.draftDocument.revision })
        : t('kbq.solved.noDraft'),
      p.comment ? h('span', { class: 'muted' }, ` — ${p.comment}`) : null,
    );
  }
  return h(
    'span',
    {},
    p.rating ? h('strong', {}, `${t(`fb.rating.${p.rating}`)}: `) : null,
    p.comment ?? '',
  );
}

function details(p) {
  const rows = [
    [t('kbq.col.source'), sourceBadge(p.source)],
    [t('kbq.col.status'), statusBadge(p.status)],
    [t('kbq.col.case'), p.case ? h('span', { class: 'mono' }, p.case.number) : '—'],
    [
      t('kbq.created'),
      `${fmtDateTime(p.createdAt)}${p.createdBy ? ` · ${p.createdBy.name}` : ` · ${t('kbq.system')}`}`,
    ],
    [
      t('kbq.col.seen'),
      `${fmtDateTime(p.lastSeenAt)} · ${t('kbq.occurrences', { n: p.occurrences })}`,
    ],
  ];
  if (p.reviewer) rows.push([t('kbq.reviewer'), p.reviewer.name]);
  if (p.decidedBy)
    rows.push([t('kbq.decided'), `${fmtDateTime(p.decidedAt)} · ${p.decidedBy.name}`]);
  if (p.resultDocument) {
    rows.push([
      t('kbq.result.document'),
      h('span', { class: 'mono' }, `${p.resultDocument.code} · ${p.resultDocument.revision}`),
    ]);
  }
  if (p.resultError) {
    rows.push([
      t('kbq.result.error'),
      h('span', { class: 'mono' }, `${p.resultError.code} v${p.resultError.version}`),
    ]);
  }
  if (p.rejectReason) rows.push([t('kbq.rejectReason'), p.rejectReason]);
  return h('dl', { class: 'facts' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

/** Документите и кодовете на клиента за избора „с какво е прието“. */
async function linkOptions() {
  const [docs, errors] = await Promise.all([
    call('GET', '/admin/documents'),
    call('GET', `/admin/errors${query({})}`),
  ]);
  return {
    documents: docs.documents.map((d) => ({
      value: d.id,
      label: `${d.code} · ${d.revision} · ${t(`admin.status.${d.status}`)}`,
    })),
    errors: errors.errors.map((e) => ({
      value: e.id,
      label: `${e.code} v${e.version} · ${e.productModel} · ${t(`admin.status.${e.status}`)}`,
    })),
  };
}

async function accept(p, done) {
  let opts;
  try {
    opts = await linkOptions();
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const preset =
    p.draftDocument?.id ??
    (p.conflict?.items ?? []).find((i) => i.kind === 'document')?.documentId ??
    '';
  const doc = select([{ value: '', label: t('kbq.accept.none') }, ...opts.documents], preset);
  const err = select([{ value: '', label: t('kbq.accept.none') }, ...opts.errors], '');
  dialog({
    title: t('kbq.accept.title'),
    body: [
      h('p', { class: 'muted' }, t('kbq.accept.hint')),
      field(t('kbq.accept.document'), doc),
      field(t('kbq.accept.error'), err),
    ],
    actions: [
      {
        label: t('kbq.action.accept'),
        primary: true,
        onClick: async (d) => {
          if (!doc.value && !err.value) {
            d.setError(t('kbq.err.link_required'));
            return false;
          }
          try {
            await call('POST', `/admin/proposals/${encodeURIComponent(p.id)}/accept`, {
              ...(doc.value ? { documentId: doc.value } : {}),
              ...(err.value ? { errorId: err.value } : {}),
            });
          } catch (e) {
            d.setError(actionError(e));
            return false;
          }
          toast(t('kbq.accepted'));
          done();
          return true;
        },
      },
    ],
  });
}

function reject(p, done) {
  const reason = textarea({ required: true, minlength: 3, maxlength: 500, rows: 4 });
  dialog({
    title: t('kbq.reject.title'),
    body: [field(t('kbq.reject.reason'), reason, { hint: t('kbq.reject.hint') })],
    actions: [
      {
        label: t('kbq.action.reject'),
        primary: true,
        onClick: async (d) => {
          try {
            await call('POST', `/admin/proposals/${encodeURIComponent(p.id)}/reject`, {
              reason: reason.value.trim(),
            });
          } catch (e) {
            d.setError(actionError(e));
            return false;
          }
          toast(t('kbq.rejected'));
          done();
          return true;
        },
      },
    ],
  });
}

/** Детайлът на предложението с действията според статуса. */
export function openProposal(p, reload) {
  let d = null;
  const done = () => {
    d?.close();
    reload?.();
  };
  const actions = [];
  if (p.status === 'NEW') {
    actions.push(
      button(
        t('kbq.action.review'),
        async () => {
          try {
            await call('POST', `/admin/proposals/${encodeURIComponent(p.id)}/review`);
            toast(t('kbq.reviewing'));
            done();
          } catch (e) {
            toast(actionError(e), 'err');
          }
        },
        { kind: 'primary' },
      ),
    );
  }
  if (p.status === 'IN_REVIEW') {
    actions.push(
      button(t('kbq.action.accept'), () => void accept(p, done), { kind: 'primary' }),
      button(t('kbq.action.reject'), () => reject(p, done), { kind: 'danger' }),
    );
  }
  if (p.draftDocument) {
    actions.push(
      button(t('kbq.openDraft'), () => void openDocument({ id: p.draftDocument.id }, reload)),
    );
  }
  for (const i of p.source === 'CONFLICT' ? (p.conflict?.items ?? []) : []) {
    actions.push(
      button(
        t('kbq.openSource', { doc: i.documentCode, rev: i.revision }),
        () => void openDocument({ id: i.documentId }, reload),
      ),
    );
  }
  d = dialog({
    title: t(`kbq.source.${p.source}`),
    wide: true,
    cancel: false,
    body: [
      h('p', { class: 'kbq-summary' }, proposalSummary(p)),
      p.source !== 'FEEDBACK' && p.comment ? h('p', { class: 'muted' }, p.comment) : null,
      details(p),
      p.source === 'SOLVED_CASE' ? h('p', { class: 'note' }, t('kbq.solved.lifecycle')) : null,
      h('div', { class: 'btn-row' }, ...actions),
    ],
  });
}
