// Нишката на разговора: списък със съобщения + поле. Един компонент за основния изглед и за
// плаващите прозорци. Изпращането (оптимистично, идемпотентно, с файлове) е в thread-send.js.
// `focusMessage` отваря съобщение в контекста му — и когато е извън заредената страница
// (резултат от търсенето, връзка): зарежда страница около него (`around`).

import { announce, clear, h } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { listen, state } from '../store.js';
import { createComposer } from './composer.js';
import { messageVersion, renderConvMessage } from './message-view.js';
import { byPosition, findMessage, slotOf, sortedMessages, titleOf, ws } from './model.js';
import { reconcile } from './reconcile.js';
import { catchUp, loadAround, loadLatest, loadOlder, loadThread, scheduleRead } from './sync.js';
import { createSender } from './thread-send.js';

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
  let threadRoot = null;
  let known = new Set(slot.messages.keys());
  let loadError = '';

  // role=log на обвивка: ролята на <ol> би скрила <li> от списъчната семантика (axe: listitem).
  const list = h('ol', { class: 'cmsgs' });
  const scroller = h(
    'div',
    { class: 'cmsgs-log', role: 'log', 'aria-live': 'off', tabindex: '0' },
    list,
  );
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
  const sender = createSender({ convId, render: (opts) => render(opts) });
  const composer = createComposer({
    scope,
    convId,
    hideLabel: compact,
    onSend: (text, files) => void sender.send(text, files, threadRoot),
  });
  const root = h(
    'div',
    { class: `thread${compact ? ' thread-compact' : ''}` },
    bar,
    older,
    scroller,
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
    return [...all.sort(byPosition), ...sender.visible(have, threadRoot)];
  };

  function render({ stick } = {}) {
    const near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < NEAR_BOTTOM;
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
    if (stick ?? near) scroller.scrollTop = scroller.scrollHeight;
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
    const before = scroller.scrollHeight;
    try {
      await loadOlder(convId);
    } catch (err) {
      loadError = errorText(err);
    }
    render({ stick: false });
    scroller.scrollTop += scroller.scrollHeight - before;
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

  const ready = load();

  const highlight = (id) => {
    const el = list.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('is-target');
    setTimeout(() => el.classList.remove('is-target'), 2500);
    return true;
  };

  /** Съобщение от търсенето/връзка: в нишка → отваря нишката; извън страницата → `around`. */
  async function focusMessage(id, replyToId = null) {
    if (replyToId) {
      await openThread(replyToId);
      if (!findMessage(convId, id)) await loadThread(convId, replyToId).catch(() => undefined);
      render({ stick: false });
      return highlight(id);
    }
    if (highlight(id)) return true;
    try {
      await loadAround(convId, id);
    } catch (err) {
      loadError = errorText(err);
    }
    render({ stick: false });
    return highlight(id);
  }

  return {
    el: root,
    /** Първото зареждане (за отваряне „в контекст“ — без състезание с последната страница). */
    ready,
    /** Превърта към съобщение (връзка, търсене, известие) и го маркира за миг. */
    focusMessage,
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
