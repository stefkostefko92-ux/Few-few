// Един документ: жизненият цикъл и позволените преходи (§4.1/§7.3, AC-10). Принципът на четирите
// очи (§11.3): документ по безопасност не се публикува от човека, който го е качил.

import { t } from '../i18n.js';
import { call, fmtDate, fwRange } from './core.js';
import { lifecycle } from './kb-common.js';
import { button, confirmDialog, dialog, errText, h, toast } from './ui.js';
import { definitionList } from './users-common.js';

/** Кои преходи са възможни от статуса: [действие, етикет, роля на бутона]. */
const NEXT = {
  DRAFT: [['submit', 'primary']],
  REVIEW: [
    ['publish', 'primary'],
    ['reject', 'secondary'],
  ],
  PUBLISHED: [['deprecate', 'danger']],
  DEPRECATED: [],
};

export function openDocument(doc, reload) {
  const blockedFourEyes = doc.safetyRelevant && doc.uploadedByMe;
  const buttons = h('div', { class: 'btn-row' });
  for (const [action, kind] of NEXT[doc.status]) {
    const blocked = action === 'publish' && blockedFourEyes;
    buttons.append(
      button(t(`admin.docs.act.${action}`), () => void transition(doc, action, d, reload), {
        kind,
        disabled: blocked || undefined,
      }),
    );
  }
  const d = dialog({
    title: `${doc.code} · ${doc.revision}`,
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      h('p', { class: 'doc-title' }, doc.title),
      lifecycle(doc.status),
      doc.safetyRelevant
        ? h(
            'p',
            { class: `note ${blockedFourEyes && doc.status === 'REVIEW' ? 'note-warn' : ''}` },
            blockedFourEyes && doc.status === 'REVIEW'
              ? t('admin.docs.fourEyes.blocked')
              : t('admin.docs.fourEyes.rule'),
          )
        : null,
      definitionList([
        [t('admin.docs.type'), t(`admin.docType.${doc.type}`)],
        [t('admin.docs.audience'), t(`admin.audience.${doc.audience}`)],
        [t('admin.docs.language'), doc.language.toUpperCase()],
        [t('admin.docs.safety'), doc.safetyRelevant ? t('admin.yes') : t('admin.no')],
        [t('admin.docs.chunks'), String(doc.chunks)],
        [
          t('admin.docs.checksum'),
          h('span', { class: 'mono small' }, `${doc.checksum.slice(0, 16)}…`),
        ],
        [t('admin.docs.publishedAt'), fmtDate(doc.publishedAt)],
        [t('admin.docs.deprecatedAt'), fmtDate(doc.deprecatedAt)],
      ]),
      h('h3', { class: 'sub' }, t('admin.docs.applicability')),
      h(
        'ul',
        { class: 'plain' },
        ...doc.applicability.map((a) =>
          h(
            'li',
            {},
            h('span', { class: 'mono' }, a.productModel),
            a.hwRevision ? ` · HW ${a.hwRevision}` : '',
            ` · ${t('admin.products.fw')} ${fwRange(a.fwMin, a.fwMax)}`,
          ),
        ),
      ),
      buttons.children.length ? h('h3', { class: 'sub' }, t('admin.docs.next')) : null,
      buttons,
    ],
    actions: [],
  });
  return d;
}

async function transition(doc, action, detail, reload) {
  const ok = await (action === 'submit'
    ? Promise.resolve(true)
    : confirmDialog({
        title: t(`admin.docs.act.${action}`),
        message: t(`admin.docs.confirm.${action}`, { code: doc.code, rev: doc.revision }),
        confirmLabel: t(`admin.docs.act.${action}`),
        danger: action === 'deprecate' || action === 'reject',
      }));
  if (!ok) return;
  detail.close();
  try {
    const res = await call('POST', `/admin/documents/${doc.id}/${action}`);
    toast(t(`admin.docs.done.${action}`, { code: doc.code, rev: doc.revision }));
    reload();
    // Нова ревизия отписва старата: кодовете, сочили я, минават в преглед и чакат свързване.
    if (res?.errorsToReview?.length) {
      dialog({
        title: t('admin.docs.review.title'),
        cancel: false,
        closeLabel: t('common.close'),
        body: [
          h('p', {}, t('admin.docs.review.text', { count: res.errorsToReview.length })),
          h(
            'ul',
            { class: 'plain' },
            ...res.errorsToReview.map((e) =>
              h('li', {}, h('span', { class: 'mono' }, `${e.code} v${e.version}`)),
            ),
          ),
        ],
        actions: [
          {
            label: t('admin.docs.review.go'),
            primary: true,
            onClick: () => {
              location.hash = '#codes?status=REVIEW';
            },
          },
        ],
      });
    }
  } catch (err) {
    toast(errText(err), 'err');
  }
}
