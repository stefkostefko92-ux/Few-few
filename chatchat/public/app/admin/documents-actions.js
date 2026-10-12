// Преходите на документа (§4.1, §11.3) — само статус, никога редакция (документите са
// неизменими). Отписване и възстановяване искат причина (в одита, без лични данни); при
// публикуване на нова ревизия старата НЕ се отписва, освен ако отговорникът изрично избере
// „заменя старата за всички табла“ (тогава — с причина).

import { t } from '../i18n.js';
import { call } from './core.js';
import { checkbox, dialog, errText, h, toast } from './ui.js';
import { reasonField } from './users-common.js';

/** Кои преходи са възможни от статуса: [действие, вид на бутона]. */
export const NEXT = {
  DRAFT: [['submit', 'primary']],
  REVIEW: [
    ['publish', 'primary'],
    ['reject', 'secondary'],
  ],
  PUBLISHED: [['deprecate', 'danger']],
  DEPRECATED: [['restore', 'secondary']],
};

const label = (action) => t(`admin.kb.act.${action}`);

/** Кодовете, които AI вече не вижда (източникът им е отписан) — не изчезват тихо. */
function showAffected(errors) {
  if (!errors?.length) return;
  dialog({
    title: t('admin.kb.affected.title'),
    cancel: false,
    body: [
      h('p', {}, t('admin.kb.affected.text', { count: errors.length })),
      h(
        'ul',
        { class: 'plain' },
        ...errors.map((e) => h('li', {}, h('span', { class: 'mono' }, `${e.code} v${e.version}`))),
      ),
    ],
    actions: [
      {
        label: t('admin.kb.affected.go'),
        primary: true,
        onClick: () => {
          location.hash = '#codes?status=PUBLISHED';
        },
      },
    ],
  });
}

/** Публикуване: по избор (само при нова ревизия) — „заменя старата за ВСИЧКИ табла“ + причина. */
function publishBody(doc) {
  if (!doc.supersedesId) return { nodes: [], read: () => ({}) };
  const replace = checkbox(t('admin.kb.publish.replaces'));
  const box = replace.querySelector('input');
  const reason = reasonField({ required: false });
  reason.node.hidden = true;
  box.addEventListener('change', () => {
    reason.node.hidden = !box.checked;
    reason.area.required = box.checked;
    reason.area.minLength = box.checked ? 3 : 0;
  });
  return {
    nodes: [h('p', { class: 'note' }, t('admin.kb.publish.keeps')), replace, reason.node],
    read: () => (box.checked ? { replacesPrevious: true, reason: reason.value() } : {}),
  };
}

/**
 * Пуска прехода: потвърждение (с причина, където трябва) → POST → съобщение → презареждане.
 * `onDone` затваря детайла и обновява списъка.
 */
export async function runTransition(doc, action, onDone) {
  const names = { code: doc.code, rev: doc.revision };
  if (action === 'submit') {
    // Пращането за преглед не променя нищо видимо за AI — без потвърждение.
    try {
      await call('POST', `/admin/documents/${doc.id}/submit`);
      toast(t('admin.kb.done.submit', names));
      onDone();
    } catch (err) {
      toast(errText(err), 'err');
    }
    return;
  }
  const needsReason = action === 'deprecate' || action === 'restore';
  const reason = reasonField({ required: needsReason });
  const publish = action === 'publish' ? publishBody(doc) : null;
  dialog({
    title: `${label(action)} — ${doc.code} · ${doc.revision}`,
    wide: action === 'publish',
    body: [
      h('p', {}, t(`admin.kb.confirm.${action}`, names)),
      ...(publish ? publish.nodes : []),
      action === 'publish' ? null : reason.node,
    ],
    actions: [
      {
        label: label(action),
        // Основното действие е submit на формата: задължителната причина се проверява нативно.
        primary: true,
        danger: action === 'deprecate',
        onClick: async () => {
          const body =
            action === 'publish'
              ? publish.read()
              : reason.value()
                ? { reason: reason.value() }
                : {};
          const res = await call('POST', `/admin/documents/${doc.id}/${action}`, body);
          toast(t(`admin.kb.done.${action}`, names));
          onDone();
          showAffected(res?.errorsAffected);
        },
      },
    ],
  });
}
