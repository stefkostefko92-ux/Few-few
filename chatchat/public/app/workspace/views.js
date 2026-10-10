// Списъците в основната част: Inbox (известия), Cronologia (всички разговори, с търсене по име)
// и преглед на публичните канали. Известията не носят текст на съобщения — само имена и номера.

import { clear, h, $ } from '../dom.js';
import { errorText } from '../errors.js';
import { fmtStamp, roleLabel } from '../format.js';
import { has, t } from '../i18n.js';
import { flowKey } from '../flow/labels.js';
import { state } from '../store.js';
import { wsApi } from './api.js';
import { conversationsByActivity, titleOf, ws } from './model.js';
import { conversationItem } from './sidebar.js';
import { loadConversations, loadNotifications, loadPublicChannels } from './sync.js';

export function notificationText(n) {
  const p = n.payload ?? {};
  const count = p.count > 1 ? ` (×${p.count})` : '';
  // Събитията на потока (ticket.*, step.*, handoff.*) — с ключове под своя префикс (flow/labels.js).
  const key = has(`notif.${n.eventType}`)
    ? `notif.${n.eventType}`
    : (flowKey(n.eventType, 'notif') ?? `notif.${n.eventType}`);
  const text = t(key, {
    actor: p.actor?.name ?? '',
    name: p.conversationName ?? t('conv.direct'),
    number: p.number ?? p.caseNumber ?? '',
    // Порталът получава ролята на служителя, не името — тогава се показва ролята.
    assignee: p.assignedTo ? (p.assignedTo.name ?? roleLabel(p.assignedTo.role)) : '',
    status: p.status ? t(`ticketstatus.${p.status}`) : '',
    step: p.step ?? '',
  });
  return (text === key ? n.eventType : text) + count;
}

function setHead(title, tools) {
  $('#list-title').textContent = title;
  clear($('#list-tools')).append(...(tools ?? []));
}

export function renderInbox({ onOpenNotification }) {
  setHead(t('inbox.title'), [
    h(
      'button',
      {
        class: 'btn btn-secondary btn-sm',
        type: 'button',
        disabled: ws.unreadNotifications === 0,
        onclick: async () => {
          await wsApi.readNotifications({ all: true });
          await loadNotifications();
        },
      },
      t('inbox.readAll'),
    ),
  ]);
  const body = clear($('#list-body'));
  if (ws.notifications.length === 0) {
    body.append(h('p', { class: 'muted' }, t('inbox.empty')));
    return;
  }
  body.append(
    h(
      'ul',
      { class: 'notif-list' },
      ws.notifications.map((n) =>
        h(
          'li',
          null,
          h(
            'button',
            {
              class: `notif${n.readAt ? '' : ' is-unread'}`,
              type: 'button',
              onclick: () => onOpenNotification(n),
            },
            h('span', { class: 'notif-state' }, n.readAt ? t('inbox.read') : t('inbox.new')),
            h('span', { class: 'notif-text' }, notificationText(n)),
            h('time', { class: 'when', datetime: String(n.createdAt) }, fmtStamp(n.createdAt)),
          ),
        ),
      ),
    ),
  );
}

export function renderHistory({ onOpen, query = '' }) {
  const input = h('input', {
    type: 'search',
    id: 'history-filter',
    value: query,
    'aria-label': t('history.filter'),
    placeholder: t('history.filter'),
    oninput: (e) => renderHistory({ onOpen, query: e.currentTarget.value, keepFocus: true }),
  });
  setHead(t('history.title'), [input]);
  const q = query.trim().toLowerCase();
  const convs = conversationsByActivity(
    (c) => c.member !== false && (!q || titleOf(c).toLowerCase().includes(q)),
  );
  const cases = state.cases.filter(
    (c) =>
      !q ||
      `${c.number} ${c.context?.productModel ?? ''} ${c.context?.errorCode ?? ''}`
        .toLowerCase()
        .includes(q),
  );
  const body = clear($('#list-body'));
  if (!convs.length && !cases.length) body.append(h('p', { class: 'muted' }, t('history.empty')));
  if (convs.length) {
    body.append(
      h('h3', null, t('history.conversations')),
      h(
        'ul',
        { class: 'side-list' },
        convs.map((c) => h('li', null, conversationItem(c, { active: false, onOpen }))),
      ),
    );
  }
  if (cases.length) {
    body.append(
      h('h3', null, t('cases.title')),
      h(
        'ul',
        { class: 'side-list' },
        cases.map((c) =>
          h(
            'li',
            null,
            h(
              'button',
              { class: 'conv-item', type: 'button', onclick: () => onOpen(`case:${c.id}`) },
              h(
                'span',
                { class: 'conv-top' },
                h('span', { class: 'conv-title-text mono' }, c.number),
              ),
              h(
                'span',
                { class: 'conv-preview' },
                `${c.context?.productModel ?? t('cases.noModel')} · ${fmtStamp(c.updatedAt)}`,
              ),
            ),
          ),
        ),
      ),
    );
  }
  if (ws.nextCursor && !q) {
    body.append(
      h(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onclick: async () => {
            await loadConversations({ more: true });
            renderHistory({ onOpen, query });
          },
        },
        t('history.more'),
      ),
    );
  }
  const el = document.getElementById('history-filter');
  if (el && arguments[0]?.keepFocus) {
    el.focus();
    el.setSelectionRange(query.length, query.length);
  }
}

export async function renderBrowse({ onJoin }) {
  setHead(t('browse.title'));
  const body = clear($('#list-body'));
  body.append(h('p', { class: 'muted' }, t('conv.loading')));
  try {
    await loadPublicChannels();
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error', role: 'alert' }, errorText(err)));
    return;
  }
  clear(body);
  if (!ws.publicChannels.length) body.append(h('p', { class: 'muted' }, t('browse.empty')));
  body.append(
    h(
      'ul',
      { class: 'side-list' },
      ws.publicChannels.map((c) =>
        h(
          'li',
          { class: 'browse-row' },
          h('span', { class: 'conv-title-text' }, c.name),
          h('span', { class: 'muted' }, t('browse.members', { count: c.memberCount ?? 0 })),
          h(
            'button',
            { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => onJoin(c.id) },
            t('browse.join'),
          ),
        ),
      ),
    ),
  );
}
