// Един код за грешка: преглед на причините/проверките, публикуване, отписване и свързване с нов
// документ-източник (след нова ревизия кодът е REVIEW и AI не го вижда, докато не се свърже).

import { t } from '../i18n.js';
import { call, fwRange } from './core.js';
import { docLabel } from './codes-form.js';
import { lifecycle } from './kb-common.js';
import { button, confirmDialog, dialog, errText, field, h, input, select, toast } from './ui.js';
import { definitionList } from './users-common.js';

export async function openCode(row, reload) {
  let e;
  try {
    e = await call('GET', `/admin/errors/${row.id}`);
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  const open = e.status === 'DRAFT' || e.status === 'REVIEW';
  const srcOk = e.sourceDocument?.status === 'PUBLISHED';
  const buttons = h('div', { class: 'btn-row' });
  if (open) {
    buttons.append(
      button(t('admin.codes.act.publish'), () => void publish(e, d, reload), {
        kind: 'primary',
        disabled: !srcOk || undefined,
      }),
      button(t('admin.codes.act.relink'), () => void relink(e, d, reload)),
    );
  }
  if (e.status === 'PUBLISHED') {
    buttons.append(
      button(t('admin.codes.act.deprecate'), () => void deprecate(e, d, reload), {
        kind: 'danger',
      }),
    );
  }
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
  const d = dialog({
    title: `${e.code} · v${e.version}`,
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      h('p', { class: 'doc-title' }, e.title),
      lifecycle(e.status),
      e.status === 'REVIEW'
        ? h('p', { class: 'note note-warn' }, t('admin.codes.reviewNote'))
        : null,
      open && !srcOk
        ? h('p', { class: 'note note-warn' }, t('admin.codes.sourceNotPublished'))
        : null,
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
      rels,
      buttons.children.length ? h('h3', { class: 'sub' }, t('admin.docs.next')) : null,
      buttons,
    ],
    actions: [],
  });
}

async function publish(e, detail, reload) {
  const ok = await confirmDialog({
    title: t('admin.codes.act.publish'),
    message: t('admin.codes.confirm.publish', { code: e.code, version: e.version }),
    confirmLabel: t('admin.codes.act.publish'),
  });
  if (!ok) return;
  detail.close();
  try {
    await call('POST', `/admin/errors/${e.id}/publish`);
    toast(t('admin.codes.done.publish', { code: e.code }));
    reload();
  } catch (err) {
    toast(errText(err), 'err');
  }
}

async function deprecate(e, detail, reload) {
  const ok = await confirmDialog({
    title: t('admin.codes.act.deprecate'),
    message: t('admin.codes.confirm.deprecate', { code: e.code, version: e.version }),
    confirmLabel: t('admin.codes.act.deprecate'),
    danger: true,
  });
  if (!ok) return;
  detail.close();
  try {
    await call('POST', `/admin/errors/${e.id}/deprecate`);
    toast(t('admin.codes.done.deprecate', { code: e.code }));
    reload();
  } catch (err) {
    toast(errText(err), 'err');
  }
}

async function relink(e, detail, reload) {
  let docs;
  try {
    docs = (await call('GET', '/admin/documents?status=PUBLISHED')).documents;
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  // Само публикувани документи, които важат за модела на кода (сървърът проверява и сам).
  const usable = docs.filter((d) => d.applicability.some((a) => a.productModel === e.productModel));
  if (!usable.length) {
    toast(t('admin.codes.relink.none'), 'warn');
    return;
  }
  const source = select(
    usable.map((d) => ({ value: d.id, label: docLabel(d) })),
    usable[0].id,
  );
  const page = input({ type: 'number', min: 1, max: 100000, value: e.sourcePage ?? '' });
  detail.close();
  dialog({
    title: t('admin.codes.relink.title', { code: e.code }),
    body: [
      h('p', {}, t('admin.codes.relink.text')),
      field(t('admin.codes.source'), source),
      field(t('admin.codes.sourcePage'), page),
    ],
    actions: [
      {
        label: t('admin.codes.act.relink'),
        primary: true,
        onClick: async () => {
          await call('POST', `/admin/errors/${e.id}/relink`, {
            sourceDocumentId: source.value,
            ...(page.value ? { sourcePage: Number(page.value) } : {}),
          });
          toast(t('admin.codes.relink.done', { code: e.code }));
          reload();
        },
      },
    ],
  });
}
