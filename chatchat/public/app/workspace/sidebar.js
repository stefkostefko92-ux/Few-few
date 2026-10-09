// Страничната лента: Предпочитани, Канали, Директни съобщения (списъците от модела) + броячи.
// Случаите са в cases.js. Всеки елемент е бутон с видим текст; непрочетеното има число, не само цвят.

import { clear, h, $ } from '../dom.js';
import { t } from '../i18n.js';
import { conversationsByActivity, othersOf, titleOf, ws } from './model.js';
import { presenceDot } from './presence.js';

export function unreadBadge(n) {
  if (!(n > 0)) return null;
  return h(
    'span',
    { class: 'badge', 'aria-label': t('conv.unread', { count: n }) },
    n > 99 ? '99+' : String(n),
  );
}

/** Ред на разговор (бутон) — общ за лентата, историята и бързия превключвател. */
export function conversationItem(conv, { active, onOpen }) {
  const last = conv.lastMessage;
  const preview = last?.deleted
    ? t('msg.deletedNote')
    : last?.preview
      ? `${last.sender?.name ? `${last.sender.name}: ` : ''}${last.preview}`
      : '';
  const other = conv.type === 'DIRECT' ? othersOf(conv)[0] : null;
  return h(
    'button',
    {
      class: `conv-item${active ? ' is-active' : ''}${conv.unread > 0 ? ' is-unread' : ''}`,
      type: 'button',
      'aria-current': active ? 'true' : null,
      onclick: () => onOpen(conv.id),
    },
    h(
      'span',
      { class: 'conv-top' },
      other ? presenceDot(other.id) : null,
      h('span', { class: 'conv-title-text' }, titleOf(conv)),
      conv.starred ? h('span', { class: 'star', 'aria-label': t('conv.starred') }, '★') : null,
      conv.notificationPref === 'NONE'
        ? h('span', { class: 'muted-tag', 'aria-label': t('conv.muted') }, '⊘')
        : null,
      unreadBadge(conv.unread),
    ),
    preview ? h('span', { class: 'conv-preview' }, preview) : null,
  );
}

function fill(listId, convs, activeId, onOpen) {
  const ul = $(`#${listId}`);
  clear(ul);
  for (const c of convs) {
    ul.append(h('li', null, conversationItem(c, { active: c.id === activeId, onOpen })));
  }
  const empty = ul.parentElement.querySelector('.side-empty');
  if (empty) empty.hidden = convs.length > 0;
  return convs;
}

export function renderSidebar({ activeId, onOpen }) {
  const member = conversationsByActivity((c) => c.member !== false && c.type !== 'CASE');
  const starred = fill(
    'starred-list',
    member.filter((c) => c.starred),
    activeId,
    onOpen,
  );
  const channels = fill(
    'channels-list',
    member.filter((c) => c.type === 'CHANNEL'),
    activeId,
    onOpen,
  );
  const dms = fill(
    'dms-list',
    member.filter((c) => c.type !== 'CHANNEL'),
    activeId,
    onOpen,
  );
  const set = (key, n) => {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = n > 0 ? `(${n})` : '';
  };
  set('starred', starred.length);
  set('channels', channels.length);
  set('dms', dms.length);
  const unread = member.reduce(
    (n, c) => n + (c.notificationPref === 'NONE' ? 0 : (c.unread ?? 0)),
    0,
  );
  const badge = $('#switch-badge');
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.hidden = unread === 0;
  return { unread, loaded: ws.listLoaded };
}
