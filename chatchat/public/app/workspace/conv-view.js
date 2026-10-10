// Основният изглед на разговор: заглавие, звезда, „Отвори в прозорец“, нишката и панелът с
// подробности (участници с присъствие, известия за разговора, напускане, добавяне на хора).

import { announce, clear, h, $ } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { emit, listen, state } from '../store.js';
import { wsApi } from './api.js';
import { can } from './caps.js';
import { othersOf, titleOf, upsertConversation, ws } from './model.js';
import { presenceDot, presenceText } from './presence.js';
import { loadConversation, loadPresence } from './sync.js';
import { mountThread } from './thread.js';

let current = null; // { id, thread }
const hooks = { onPopout: () => {}, onLeave: () => {}, onAddPeople: () => {} };

export const setConvHooks = (h2) => Object.assign(hooks, h2);
export const currentConversationId = () => current?.id ?? null;

function renderHead(conv) {
  $('#conv-title').textContent = titleOf(conv);
  const sub =
    conv.type === 'DIRECT'
      ? othersOf(conv)[0]
        ? presenceText(othersOf(conv)[0].id)
        : ''
      : t('conv.members', { count: conv.memberCount ?? (conv.members ?? []).length });
  $('#conv-sub').textContent = sub;
  const star = $('#conv-star');
  star.setAttribute('aria-pressed', String(conv.starred === true));
  star.disabled = conv.member === false;
}

function memberRow(m) {
  return h(
    'li',
    { class: 'member' },
    presenceDot(m.id),
    h('span', { class: 'member-name' }, m.name),
    m.role === 'OWNER' ? h('span', { class: 'muted' }, t('conv.owner')) : null,
    h('span', { class: 'muted member-state' }, presenceText(m.id)),
  );
}

function renderInfo(conv) {
  const body = clear($('#info-body'));
  const members = conv.members ?? [];
  $('#info-summary').textContent = t('conv.members', { count: conv.memberCount ?? members.length });
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = (e) => {
    err.textContent = errorText(e);
    err.hidden = false;
  };
  body.append(
    h('h3', null, t('conv.participants')),
    h('ul', { class: 'member-list' }, members.map(memberRow)),
  );
  if (
    conv.type !== 'DIRECT' &&
    conv.type !== 'CASE' &&
    can('conversation:create') &&
    conv.member !== false
  ) {
    body.append(
      h(
        'button',
        {
          class: 'btn btn-secondary btn-block',
          type: 'button',
          onclick: () => hooks.onAddPeople(conv.id),
        },
        t('conv.addPeople'),
      ),
    );
  }
  if (conv.member !== false) {
    const pref = h(
      'select',
      {
        id: 'info-pref',
        onchange: async (e) => {
          try {
            const { conversation } = await wsApi.prefs(conv.id, e.currentTarget.value);
            upsertConversation(conversation);
            emit('ws:convs');
            announce(t('conv.prefSaved'));
          } catch (ex) {
            fail(ex);
          }
        },
      },
      ['ALL', 'MENTIONS', 'NONE'].map((v) => h('option', { value: v }, t(`conv.pref.${v}`))),
    );
    pref.value = conv.notificationPref ?? 'ALL';
    body.append(
      h('div', { class: 'field' }, h('label', { for: 'info-pref' }, t('conv.prefLabel')), pref),
    );
  }
  if ((conv.type === 'CHANNEL' || conv.type === 'GROUP') && conv.member !== false) {
    body.append(
      h(
        'button',
        {
          class: 'btn btn-secondary btn-block',
          type: 'button',
          onclick: async () => {
            try {
              await wsApi.removeMember(conv.id, state.user.id);
              hooks.onLeave(conv.id);
            } catch (ex) {
              fail(ex);
            }
          },
        },
        t('conv.leave'),
      ),
    );
  }
  body.append(err);
}

function joinBanner(conv) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  return h(
    'div',
    { class: 'join-banner' },
    h('p', null, t('conv.notMember')),
    h(
      'button',
      {
        class: 'btn btn-primary',
        type: 'button',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          error.hidden = true;
          try {
            await wsApi.addMembers(conv.id, [state.user.id]);
            await openConversationView(conv.id);
          } catch (err) {
            error.textContent = errorText(err);
            error.hidden = false;
            btn.disabled = false;
          }
        },
      },
      t('browse.join'),
    ),
    error,
  );
}

export function closeConversationView() {
  current?.thread?.destroy();
  current?.unsub?.();
  current = null;
}

export async function openConversationView(id, { messageId } = {}) {
  closeConversationView();
  const token = { id, thread: null, unsub: null };
  current = token;
  const host = clear($('#conv-host'));
  host.append(h('p', { class: 'muted' }, t('conv.loading')));
  let conv = ws.convs.get(id);
  let canJoin = false;
  try {
    const r = await loadConversation(id);
    conv = r.conversation;
    canJoin = r.canJoin;
  } catch (err) {
    if (current === token)
      clear(host).append(h('p', { class: 'form-error', role: 'alert' }, errorText(err)));
    return false;
  }
  if (current !== token) return false;
  clear(host);
  renderHead(conv);
  renderInfo(conv);
  void loadPresence((conv.members ?? []).map((m) => m.id));
  if (conv.member === false) {
    host.append(joinBanner(conv));
    if (!canJoin) return true;
    return true;
  }
  token.thread = mountThread(host, id, { scope: 'main' });
  const refresh = () => {
    const c = ws.convs.get(id);
    if (!c || current !== token) return;
    renderHead(c);
    renderInfo(c);
  };
  token.unsub = [
    listen('ws:convs', refresh),
    listen('ws:presence', refresh),
    listen('lang', refresh),
  ].reduce(
    (acc, off) => () => {
      acc();
      off();
    },
    () => {},
  );
  if (messageId) setTimeout(() => token.thread?.focusMessage(messageId), 400);
  return true;
}

export function initConvView() {
  // Подробностите: на широк екран винаги отворени (бутонът е излишен), на тесен — сгъваеми.
  const info = $('#conv-info');
  const toggle = $('#info-toggle');
  toggle.addEventListener('click', () => {
    const open = info.dataset.open !== 'true';
    info.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  const mq = window.matchMedia('(min-width: 1100px)');
  const sync = () => {
    toggle.disabled = mq.matches;
    if (mq.matches) toggle.removeAttribute('aria-expanded');
    else toggle.setAttribute('aria-expanded', String(info.dataset.open === 'true'));
  };
  mq.addEventListener('change', sync);
  sync();
  $('#conv-star').addEventListener('click', async () => {
    const conv = ws.convs.get(current?.id);
    if (!conv) return;
    try {
      const { conversation } = await wsApi.star(conv.id, !conv.starred);
      upsertConversation(conversation);
      emit('ws:convs');
      announce(conversation.starred ? t('conv.starred') : t('conv.unstarred'));
    } catch {
      /* звездата е удобство; грешката се вижда по непроменения бутон */
    }
  });
  $('#conv-popout').addEventListener('click', () => current && hooks.onPopout(current.id));
}
