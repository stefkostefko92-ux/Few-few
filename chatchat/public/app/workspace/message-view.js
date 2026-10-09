// Едно съобщение от разговор: автор и час, текст (само textContent), реакции, нишка и действия.
// Изтритото оставя следа („Съобщението е изтрито“), не дупка. Действията са видими бутони с
// етикети (не само при hover) — работят с тъч и клавиатура.

import { h } from '../dom.js';
import { fmtStamp } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import {
  canDelete,
  canEdit,
  conversationOf,
  copyLink,
  isMine,
  removeMessage,
  saveEdit,
  toggleReaction,
} from './message-actions.js';
import { reactionChips, reactionPalette } from './reactions.js';

/** Низ, който се променя само когато визията на съобщението трябва да се обнови. */
export function messageVersion(m, ctx) {
  return JSON.stringify([
    m.body,
    m.deleted,
    m.editedAt,
    m.reactions,
    m.replyCount,
    m.pending,
    m.error,
    ctx.open.has(m.id),
    ctx.editing.has(m.id),
  ]);
}

function header(m) {
  const mine = isMine(m);
  const name = m.sender?.name ?? t('msg.unknownSender');
  const head = h('header', { class: 'msg-head' });
  if (m.kind === 'AI') {
    head.append(
      h(
        'span',
        { class: 'ai-tag' },
        h('span', { class: 'ai-tag-mark', 'aria-hidden': 'true' }, 'AI'),
        t('ai.label'),
      ),
    );
  } else if (m.kind === 'SYSTEM') {
    head.append(h('span', { class: 'sys-tag' }, t('chat.system')));
  } else {
    head.append(h('span', { class: 'who' }, mine ? `${t('chat.you')} · ${name}` : name));
  }
  if (m.createdAt) {
    head.append(h('time', { class: 'when', datetime: String(m.createdAt) }, fmtStamp(m.createdAt)));
  }
  if (m.editedAt && !m.deleted) head.append(h('span', { class: 'edited' }, t('msg.editedTag')));
  return head;
}

function editor(m, ctx) {
  const area = h(
    'textarea',
    { rows: '3', maxlength: '4000', 'aria-label': t('msg.editLabel') },
    '',
  );
  area.value = m.body ?? '';
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const done = () => {
    ctx.editing.delete(m.id);
    ctx.refresh();
  };
  const save = async () => {
    const text = area.value.trim();
    if (!text) return area.focus();
    const failure = await saveEdit(ctx.convId, m, text);
    if (failure) {
      err.textContent = failure;
      err.hidden = false;
    } else done();
  };
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') done();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  });
  queueMicrotask(() => area.focus());
  return h(
    'div',
    { class: 'msg-edit' },
    area,
    err,
    h(
      'div',
      { class: 'btn-pair' },
      h(
        'button',
        { class: 'btn btn-primary btn-sm', type: 'button', onclick: save },
        t('msg.save'),
      ),
      h(
        'button',
        { class: 'btn btn-secondary btn-sm', type: 'button', onclick: done },
        t('common.cancel'),
      ),
    ),
  );
}

function tools(m, ctx) {
  const conv = conversationOf(ctx.convId);
  const row = h('div', { class: 'msg-tools' });
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = (text) => {
    err.textContent = text ?? '';
    err.hidden = !text;
  };
  const toggle = async (reaction, on) => fail(await toggleReaction(ctx.convId, m, reaction, on));

  const isOpen = ctx.open.has(m.id);
  row.append(
    h(
      'button',
      {
        class: 'btn btn-quiet btn-sm',
        type: 'button',
        'aria-expanded': String(isOpen),
        onclick: () => {
          if (isOpen) ctx.open.delete(m.id);
          else ctx.open.add(m.id);
          ctx.refresh();
        },
      },
      t('msg.actions'),
    ),
  );
  if (!ctx.inThread) {
    const n = m.replyCount ?? 0;
    row.append(
      h(
        'button',
        { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => ctx.openThread(m.id) },
        n > 0 ? t('msg.replies', { count: n }) : t('msg.reply'),
      ),
    );
  }
  if (isOpen) {
    const panel = h('div', { class: 'msg-panel' });
    panel.append(reactionPalette(m, toggle));
    const extra = h('div', { class: 'btn-row' });
    if (canEdit(m)) {
      extra.append(
        h(
          'button',
          {
            class: 'btn btn-secondary btn-sm',
            type: 'button',
            onclick: () => {
              ctx.editing.add(m.id);
              ctx.refresh();
            },
          },
          t('msg.edit'),
        ),
      );
    }
    if (canDelete(m, conv)) {
      extra.append(
        h(
          'button',
          {
            class: 'btn btn-secondary btn-sm',
            type: 'button',
            onclick: async () => fail(await removeMessage(ctx.convId, m)),
          },
          t('msg.delete'),
        ),
      );
    }
    extra.append(
      h(
        'button',
        {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          onclick: async () => fail((await copyLink(ctx.convId, m)) ? '' : t('msg.linkFailed')),
        },
        t('msg.copyLink'),
      ),
    );
    panel.append(extra);
    row.append(panel);
  }
  row.append(err);
  return row;
}

function pendingBar(m) {
  if (m.pending === 'failed') {
    return h(
      'p',
      { class: 'msg-pending-line form-error', role: 'alert' },
      t('msg.failed'),
      m.error ? ` ${m.error} ` : ' ',
      h(
        'button',
        { class: 'btn btn-secondary btn-sm', type: 'button', onclick: m.retry },
        t('msg.retry'),
      ),
      ' ',
      h(
        'button',
        { class: 'btn btn-quiet btn-sm', type: 'button', onclick: m.discard },
        t('msg.discard'),
      ),
    );
  }
  return h('p', { class: 'msg-pending-line muted' }, t('msg.sending'));
}

export function renderConvMessage(m, ctx) {
  const mine = isMine(m);
  const li = h('li', {
    class: `cmsg${mine ? ' is-mine' : ''}${m.deleted ? ' is-deleted' : ''}${m.kind !== 'HUMAN' ? ` is-${m.kind.toLowerCase()}` : ''}`,
    id: `m-${ctx.scope}-${m.id}`,
    'data-message-id': m.id,
  });
  li.append(header(m));
  if (m.deleted) {
    li.append(h('p', { class: 'msg-text muted' }, t('msg.deletedNote')));
    return li;
  }
  if (ctx.editing.has(m.id)) {
    li.append(editor(m, ctx));
    return li;
  }
  li.append(h('p', { class: 'msg-text' }, String(m.body ?? '')));
  if (m.pending) {
    li.append(pendingBar(m));
    return li;
  }
  const chips = reactionChips(m, async (reaction, on) => {
    await toggleReaction(ctx.convId, m, reaction, on);
  });
  if (chips) li.append(chips);
  if (state.user && !m.pending) li.append(tools(m, ctx));
  return li;
}
