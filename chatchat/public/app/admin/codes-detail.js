// Един код за грешка (FR-04): причините/проверките, жизненият цикъл, четирите очи за безопасност,
// историята и позволените действия. Чернова се редактира; публикуваната версия е неизменима —
// промяна = „Нова версия“. Отписване/възстановяване искат причина; версиите не се трият.

import { t } from '../i18n.js';
import { call, fwRange } from './core.js';
import { codeAction } from './codes-actions.js';
import { historyList, lifecycle } from './kb-common.js';
import { button, dialog, errText, h, toast } from './ui.js';
import { definitionList } from './users-common.js';

/** Позволените действия по статус: [действие, вид на бутона]. */
const NEXT = {
  DRAFT: [
    ['edit', 'secondary'],
    ['submit', 'primary'],
    ['relink', 'secondary'],
  ],
  REVIEW: [
    ['publish', 'primary'],
    ['reject', 'secondary'],
    ['relink', 'secondary'],
  ],
  PUBLISHED: [
    ['newVersion', 'secondary'],
    ['deprecate', 'danger'],
  ],
  DEPRECATED: [
    ['restore', 'secondary'],
    ['newVersion', 'secondary'],
  ],
};

function relationsBlock(e) {
  const rels = h('div', { class: 'rels' });
  for (const kind of ['SYMPTOM', 'CAUSE', 'CHECK', 'FIX']) {
    const items = e.relations.filter((r) => r.kind === kind);
    if (!items.length) continue;
    rels.append(
      h('h3', { class: 'sub' }, t(`admin.codes.kind.${kind}`)),
      h(
        'ul',
        { class: 'plain' },
        ...items.map((r) =>
          h(
            'li',
            {},
            r.text,
            r.expected
              ? h('span', { class: 'muted' }, ` — ${t('admin.codes.rel.expected')}: ${r.expected}`)
              : null,
            r.actionClass !== 'INFORMATIVE'
              ? h(
                  'span',
                  {
                    class: `tag tag-${r.actionClass === 'SAFETY_RELEVANT' || r.actionClass === 'DIRECT_COMMAND' ? 'stop' : 'info'}`,
                  },
                  t(`admin.actionClass.${r.actionClass}`),
                )
              : null,
          ),
        ),
      ),
    );
  }
  return rels;
}

function notes(e) {
  const out = [];
  if (e.status === 'REVIEW') out.push(h('p', { class: 'note' }, t('admin.err.reviewNote')));
  const open = e.status === 'DRAFT' || e.status === 'REVIEW';
  if (open && e.sourceDocument?.status !== 'PUBLISHED') {
    out.push(h('p', { class: 'note note-warn' }, t('admin.codes.sourceNotPublished')));
  }
  if (e.status === 'PUBLISHED' && e.sourceDocument && e.sourceDocument.status !== 'PUBLISHED') {
    out.push(h('p', { class: 'note note-warn' }, t('admin.err.sourceGone')));
  }
  if (e.safetyRelevantVersion) {
    const blocked = e.fourEyesBlocked && e.status === 'REVIEW';
    out.push(
      h(
        'p',
        { class: `note ${blocked ? 'note-warn' : ''}` },
        blocked ? t('admin.err.fourEyes.blocked') : t('admin.err.fourEyes.rule'),
      ),
    );
  }
  if (e.status === 'PUBLISHED' || e.status === 'DEPRECATED') {
    out.push(h('p', { class: 'hint' }, t('admin.err.immutable')));
  }
  return out;
}

export async function openCode(row, reload) {
  let e;
  try {
    e = await call('GET', `/admin/errors/${row.id}`);
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const srcOk = e.sourceDocument?.status === 'PUBLISHED';
  let d = null;
  const done = () => {
    d?.close();
    reload();
  };
  const buttons = h('div', { class: 'btn-row' });
  for (const [action, kind] of NEXT[e.status] ?? []) {
    const blocked = action === 'publish' && (!srcOk || e.fourEyesBlocked);
    buttons.append(
      button(t(`admin.err.act.${action}`), () => void codeAction(e, action, done), {
        kind,
        disabled: blocked || undefined,
      }),
    );
  }
  d = dialog({
    title: `${e.code} · v${e.version}`,
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      h('p', { class: 'doc-title' }, e.title),
      lifecycle(e.status),
      ...notes(e),
      h('p', {}, e.description),
      definitionList([
        [t('admin.devices.model'), e.productModel],
        [t('admin.codes.severity'), t(`admin.severity.${e.severity}`)],
        [t('admin.codes.safety'), e.safetyRelevant ? t('admin.yes') : t('admin.no')],
        [t('admin.codes.hw'), e.hwRevision ?? ''],
        [t('admin.codes.fwScope'), fwRange(e.fwMin, e.fwMax)],
        [
          t('admin.codes.source'),
          e.sourceDocument
            ? `${e.sourceDocument.code} · ${e.sourceDocument.revision} (${t(`admin.status.${e.sourceDocument.status}`)})${e.sourcePage ? `, ${t('ans.page')} ${e.sourcePage}` : ''}`
            : '',
        ],
      ]),
      relationsBlock(e),
      h('h3', { class: 'sub' }, t('admin.kb.history.title')),
      historyList(e.history),
      buttons.children.length ? h('h3', { class: 'sub' }, t('admin.docs.next')) : null,
      buttons,
    ],
    actions: [],
  });
}
