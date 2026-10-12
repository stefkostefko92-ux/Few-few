// Действията по съобщение от §12.1: „отбележи като непрочетено“, „da fare“ (TODO) и „любимо“
// (STARRED). Маркерите са лични (само в REST към самия човек); състоянието се показва с текст,
// не само с цвят. Правилата за достъп са на сървъра — тук е само копчето и отговорът му.

import { announce, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { emit } from '../store.js';
import { wsApi } from './api.js';
import { findMessage, upsertConversation, upsertMessage } from './model.js';

const KINDS = {
  TODO: { path: 'todo', on: 'ws.msg.todoOn', off: 'ws.msg.todoOff', tag: 'ws.msg.todoTag' },
  STARRED: { path: 'starred', on: 'ws.msg.starOn', off: 'ws.msg.starOff', tag: 'ws.msg.starTag' },
};
const ANNOUNCE = {
  TODO: ['ws.msg.todoAdded', 'ws.msg.todoRemoved'],
  STARRED: ['ws.msg.starAdded', 'ws.msg.starRemoved'],
};

const has = (m, kind) => Array.isArray(m.marks) && m.marks.includes(kind);

/** Етикетите в заглавието на съобщението (текст, не само цвят). */
export function markTags(m) {
  if (!Array.isArray(m.marks) || m.marks.length === 0) return null;
  return h(
    'span',
    { class: 'mark-tags' },
    m.marks
      .filter((k) => KINDS[k])
      .map((k) => h('span', { class: `mark-tag mark-${k.toLowerCase()}` }, t(KINDS[k].tag))),
  );
}

async function toggle(convId, m, kind, fail) {
  const on = !has(m, kind);
  try {
    const res = await wsApi.mark(m.id, KINDS[kind].path, on);
    const current = findMessage(convId, m.id) ?? m;
    upsertMessage(convId, { ...current, marks: res.marks }, { counted: true });
    emit(`ws:msgs:${convId}`);
    emit('ws:marks');
    announce(t(ANNOUNCE[kind][on ? 0 : 1]));
    fail('');
  } catch (err) {
    fail(errorText(err));
  }
}

async function markUnread(convId, m, fail) {
  try {
    const res = await wsApi.markUnread(m.id);
    upsertConversation({
      id: convId,
      unread: res.unread,
      lastReadMessageId: res.lastReadMessageId,
    });
    emit('ws:convs');
    announce(t('ws.msg.markedUnread'));
    fail('');
  } catch (err) {
    fail(errorText(err));
  }
}

/** Копчетата в панела „Действия“ на съобщението. */
export function markButtons(m, ctx, fail) {
  const conv = ctx.conv;
  const buttons = [];
  if (conv?.member !== false) {
    buttons.push(
      h(
        'button',
        {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          onclick: () => void markUnread(ctx.convId, m, fail),
        },
        t('ws.msg.markUnread'),
      ),
    );
  }
  for (const kind of ['TODO', 'STARRED']) {
    buttons.push(
      h(
        'button',
        {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          onclick: () => void toggle(ctx.convId, m, kind, fail),
        },
        t(has(m, kind) ? KINDS[kind].off : KINDS[kind].on),
      ),
    );
  }
  return buttons;
}
