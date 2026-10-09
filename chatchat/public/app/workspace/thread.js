// Нишката на разговора: списък със съобщения + поле. Един компонент за основния изглед и за
// плаващите прозорци. Изпращането е оптимистично и идемпотентно (clientMessageId): при грешка или
// прекъсване повторният опит ползва СЪЩИЯ ключ — сървърът връща записаното, дубликат няма (AC-12).

import { announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { emit, listen, state } from '../store.js';
import { wsApi } from './api.js';
import { createComposer } from './composer.js';
import { messageVersion, renderConvMessage } from './message-view.js';
import {
  byPosition,
  slotOf,
  sortedMessages,
  titleOf,
  upsertConversation,
  upsertMessage,
  ws,
} from './model.js';
import { reconcile } from './reconcile.js';
import { catchUp, loadLatest, loadOlder, loadThread, scheduleRead } from './sync.js';

const NEAR_BOTTOM = 96;

/**
 * @param {HTMLElement} host
 * @param {string} convId
 * @param {{ scope: string, compact?: boolean }} opts
 */
export function mountThread(host, convId, { scope, compact = false }) {
  const slot = slotOf(convId);
  const cache = new Map();
  const ctx = {
    convId,
    scope,
    inThread: false,
    open: new Set(),
    editing: new Set(),
    refresh: () => render(),
    openThread: (rootId) => void openThread(rootId),
  };
  /** Локално изпратените, още непотвърдени съобщения. */
  let pending = [];
  let threadRoot = null;
  let known = new Set(slot.messages.keys());
  let loadError = '';

  const list = h('ol', { class: 'cmsgs', role: 'log', 'aria-live': 'off', tabindex: '0' });
  const state_ = h('p', { class: 'muted chat-hint', role: 'status' });
  const older = h(
    'button',
    {
      class: 'btn btn-secondary btn-sm older',
      type: 'button',
      hidden: true,
      onclick: () => void more(),
    },
    t('conv.older'),
  );
  const back = h(
    'button',
    { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => closeThread() },
    t('thread.back'),
  );
  const bar = h(
    'div',
    { class: 'thread-bar', hidden: true },
    back,
    h('strong', null, t('thread.title')),
  );
  const composer = createComposer({
    scope,
    hideLabel: compact,
    onSend: (text) => void send(text),
  });
  const root = h(
    'div',
    { class: `thread${compact ? ' thread-compact' : ''}` },
    bar,
    older,
    list,
    state_,
    composer.el,
  );
  host.append(root);
  ws.watching.add(convId);

  /* ---- данни за показване ---- */

  const visibleItems = () => {
    const all = threadRoot
      ? [slot.messages.get(threadRoot), ...(slot.threads.get(threadRoot)?.values() ?? [])].filter(
          Boolean,
        )
      : sortedMessages(convId);
    const have = new Set(
      [...slot.messages.values(), ...[...slot.threads.values()].flatMap((m) => [...m.values()])]
        .map((m) => m.clientMessageId)
        .filter(Boolean),
    );
    const mine = pending.filter(
      (p) => !have.has(p.clientMessageId) && (p.replyToId ?? null) === threadRoot,
    );
    return [...all.sort(byPosition), ...mine];
  };

  function render({ stick } = {}) {
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM;
    const items = visibleItems();
    reconcile(list, cache, items, {
      key: (m) => m.id,
      version: (m) => messageVersion(m, ctx),
      make: (m) => renderConvMessage(m, ctx),
    });
    older.hidden = !(slot.hasMore && !threadRoot);
    state_.hidden = items.length > 0 && !loadError;
    state_.textContent = loadError || (slot.loaded ? t('conv.empty') : t('conv.loading'));
    state_.classList.toggle('form-error', Boolean(loadError));
    if (stick ?? near) list.scrollTop = list.scrollHeight;
  }

  /* ---- събития ---- */

  const onMessages = () => {
    for (const m of slot.messages.values()) {
      if (!known.has(m.id)) {
        known.add(m.id);
        if (
          slot.loaded &&
          m.sender?.id !== state.user?.id &&
          !m.deleted &&
          document.visibilityState === 'visible'
        ) {
          announce(`${m.sender?.name ?? ''}: ${m.body ?? ''}`);
        }
      }
    }
    render();
  };
  const unsubs = [
    listen(`ws:msgs:${convId}`, onMessages),
    listen(`thread:${convId}`, () => render()),
    listen('lang', () => {
      cache.clear();
      clear(list);
      older.textContent = t('conv.older');
      back.textContent = t('thread.back');
      composer.relabel();
      render();
    }),
  ];

  /* ---- зареждане ---- */

  async function load() {
    loadError = '';
    render();
    try {
      await (slot.loaded ? catchUp(convId) : loadLatest(convId));
    } catch (err) {
      loadError = `${t('conv.loadError')} ${errorText(err)}`;
    }
    render({ stick: true });
    if ((ws.convs.get(convId)?.unread ?? 0) > 0) scheduleRead(convId);
  }

  async function more() {
    const before = list.scrollHeight;
    try {
      await loadOlder(convId);
    } catch (err) {
      loadError = errorText(err);
    }
    render({ stick: false });
    list.scrollTop += list.scrollHeight - before;
  }

  async function openThread(rootId) {
    threadRoot = rootId;
    ctx.inThread = true;
    cache.clear();
    clear(list);
    bar.hidden = false;
    render({ stick: true });
    try {
      await loadThread(convId, rootId);
    } catch (err) {
      loadError = errorText(err);
    }
    render({ stick: true });
    composer.focus();
  }

  function closeThread() {
    threadRoot = null;
    ctx.inThread = false;
    cache.clear();
    clear(list);
    bar.hidden = true;
    render({ stick: true });
  }

  /* ---- изпращане ---- */

  async function deliver(local) {
    local.pending = 'sending';
    render({ stick: true });
    try {
      const { message } = await wsApi.post(convId, {
        text: local.body,
        clientMessageId: local.clientMessageId,
        ...(local.replyToId ? { replyToId: local.replyToId } : {}),
      });
      upsertMessage(convId, message);
      pending = pending.filter((p) => p !== local);
      if (!message.replyToId) {
        upsertConversation({
          id: convId,
          lastMessage: {
            id: message.id,
            sender: message.sender,
            preview: String(message.body ?? '').slice(0, 140),
            deleted: false,
            createdAt: message.createdAt,
          },
          lastActivityAt: message.createdAt,
        });
        emit('ws:convs');
      }
      render({ stick: true });
    } catch (err) {
      local.pending = 'failed';
      // 4xx (напр. член вече не е, отказ) не се оправя с повтор; мрежа/5xx — да.
      local.error = errorText(err);
      render({ stick: true });
      announce(`${t('msg.failed')} ${local.error}`);
    }
  }

  async function send(text) {
    const cmid = crypto.randomUUID();
    const local = {
      id: `local-${cmid}`,
      clientMessageId: cmid,
      conversationId: convId,
      kind: 'HUMAN',
      sender: { id: state.user.id, name: state.user.name },
      body: text,
      createdAt: new Date().toISOString(),
      replyToId: threadRoot,
      reactions: [],
      deleted: false,
      pending: 'sending',
      retry: () => void deliver(local),
      discard: () => {
        pending = pending.filter((p) => p !== local);
        render();
      },
    };
    pending.push(local);
    await deliver(local);
  }

  void load();

  return {
    el: root,
    /** Превърта към съобщение (връзка, известие) и го маркира за миг. */
    focusMessage: (id) => {
      const el = list.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.classList.add('is-target');
      setTimeout(() => el.classList.remove('is-target'), 2500);
      return true;
    },
    focusComposer: () => composer.focus(),
    title: () => titleOf(ws.convs.get(convId) ?? { type: 'GROUP' }),
    reload: () => void load(),
    destroy: () => {
      for (const off of unsubs) off();
      composer.destroy();
      ws.watching.delete(convId);
      root.remove();
    },
  };
}
