// Преходите на код за грешка (FR-04): преглед, публикуване (четири очи за безопасност), връщане,
// отписване и възстановяване (с причина), нова версия и пресвързване. Сървърът решава всичко;
// тук само питаме за потвърждение/причина и казваме резултата.

import { t } from '../i18n.js';
import { call } from './core.js';
import { docLabel, editCode } from './codes-form.js';
import { dialog, errText, field, h, input, select, toast } from './ui.js';
import { reasonField } from './users-common.js';

const names = (e) => ({ code: e.code, version: e.version });

/** Преход с потвърждение; `reason` — 'required' | 'optional' | null. */
function confirmed(e, action, reason, onDone) {
  const field_ = reason ? reasonField({ required: reason === 'required' }) : null;
  dialog({
    title: `${t(`admin.err.act.${action}`)} — ${e.code} · v${e.version}`,
    body: [h('p', {}, t(`admin.err.confirm.${action}`, names(e))), field_?.node],
    actions: [
      {
        label: t(`admin.err.act.${action}`),
        primary: true,
        danger: action === 'deprecate',
        onClick: async () => {
          const value = field_?.value();
          await call('POST', `/admin/errors/${e.id}/${action}`, value ? { reason: value } : {});
          toast(t(`admin.err.done.${action}`, names(e)));
          onDone();
        },
      },
    ],
  });
}

export async function codeAction(e, action, onDone) {
  switch (action) {
    case 'submit':
      try {
        await call('POST', `/admin/errors/${e.id}/submit`);
        toast(t('admin.err.done.submit', names(e)));
        onDone();
      } catch (err) {
        toast(errText(err), 'err');
      }
      return;
    case 'publish':
      return confirmed(e, 'publish', null, onDone);
    case 'reject':
      return confirmed(e, 'reject', 'optional', onDone);
    case 'deprecate':
    case 'restore':
      return confirmed(e, action, 'required', onDone);
    case 'edit':
      return void editCode(e, onDone);
    case 'newVersion':
      return newVersion(e, onDone);
    case 'relink':
      return relink(e, onDone);
  }
}

/** Публикуваната версия е неизменима: копие като чернова → веднага в редакция. */
function newVersion(e, onDone) {
  dialog({
    title: t('admin.err.act.newVersion'),
    body: [h('p', {}, t('admin.err.confirm.newVersion', names(e)))],
    actions: [
      {
        label: t('admin.err.act.newVersion'),
        primary: true,
        onClick: async () => {
          const res = await call('POST', `/admin/errors/${e.id}/new-version`);
          toast(t('admin.err.done.newVersion', { code: e.code, version: res.version }));
          onDone();
          const fresh = await call('GET', `/admin/errors/${res.errorId}`);
          void editCode(fresh, onDone);
        },
      },
    ],
  });
}

async function relink(e, onDone) {
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
          onDone();
        },
      },
    ],
  });
}
