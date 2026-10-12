// Зареждане и синхронизация: REST пълни модела, събитията от потока го допълват. Всяко събитие е
// идемпотентно (слива се по id) — повторено или закъсняло събитие не прави дубликат (AC-12).

import { announce } from '../dom.js';
import { t } from '../i18n.js';
import { emit, state } from '../store.js';
import { wsApi } from './api.js';
import {
  lastMessageId,
  setPresence,
  slotOf,
  titleOf,
  upsertConversation,
  upsertMessage,
  ws,
} from './model.js';

const PREVIEW = 140;

/* ---------- Разговори ---------- */

export async function loadConversations({ more = false } = {}) {
  const data = await wsApi.conversations(more ? ws.nextCursor : null);
  for (const c of data.conversations ?? []) upsertConversation(c);
  ws.nextCursor = data.nextCursor ?? null;
  ws.listLoaded = true;
  emit('ws:convs');
  return data;
}

export async function loadConversation(id) {
  const data = await wsApi.conversation(id);
  const view = upsertConversation(data.conversation);
  emit('ws:convs');
  return { conversation: view, canJoin: data.canJoin === true };
}

export async function loadPublicChannels() {
  const data = await wsApi.publicChannels();
  ws.publicChannels = data.conversations ?? [];
  emit('ws:browse');
}

/* ---------- Съобщения ---------- */

const notify = (convId) => emit(`ws:msgs:${convId}`);

/** Последната страница на разговора (при първо отваряне). */
export async function loadLatest(convId) {
  const s = slotOf(convId);
  const data = await wsApi.messages(convId);
  for (const m of data.messages ?? []) upsertMessage(convId, m);
  s.hasMore = data.hasMore === true;
  s.loaded = true;
  notify(convId);
}

/** По-старите съобщения над най-ранното известно. */
export async function loadOlder(convId) {
  const s = slotOf(convId);
  const first = [...s.messages.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  if (!first) return;
  const data = await wsApi.messages(convId, { before: first.id });
  for (const m of data.messages ?? []) upsertMessage(convId, m);
  s.hasMore = data.hasMore === true;
  notify(convId);
}

/** Резервният път (AC-13): всичко след последното видяно, на страници, докато не свърши. */
export async function catchUp(convId) {
  const s = slotOf(convId);
  if (!s.loaded) return loadLatest(convId);
  let guard = 0;
  for (;;) {
    const after = lastMessageId(convId);
    const data = await wsApi.messages(convId, { after, limit: 100 });
    for (const m of data.messages ?? []) upsertMessage(convId, m);
    notify(convId);
    if (!data.hasMore || ++guard > 10) break;
  }
}

/**
 * Страница около съобщение (търсене, връзка): основният списък се подменя с нея — без „дупка“
 * между нея и последните — и се допълва напред (`catchUp`), докато стигне края.
 */
export async function loadAround(convId, messageId) {
  const s = slotOf(convId);
  const data = await wsApi.messages(convId, { around: messageId, limit: 50 });
  s.messages.clear();
  for (const m of data.messages ?? []) upsertMessage(convId, m);
  s.hasMore = data.hasMore === true;
  s.loaded = true;
  notify(convId);
  if (data.hasNewer) await catchUp(convId);
}

export async function loadThread(convId, rootId) {
  const data = await wsApi.messages(convId, { threadId: rootId, limit: 100 });
  for (const m of data.messages ?? []) upsertMessage(convId, m, { counted: true });
  emit(`thread:${convId}`, rootId);
}

/* ---------- Прочетено ---------- */

const readTimers = new Map();

/** Курсорът „прочетено“ — само напред, с леко забавяне (бърз поток от съобщения = една заявка). */
export function scheduleRead(convId) {
  clearTimeout(readTimers.get(convId));
  readTimers.set(
    convId,
    setTimeout(async () => {
      readTimers.delete(convId);
      const conv = ws.convs.get(convId);
      const last = lastMessageId(convId);
      if (!conv || !last || conv.member === false || !(conv.unread > 0)) return;
      try {
        const res = await wsApi.read(convId, last);
        upsertConversation({
          id: convId,
          unread: res.unread,
          lastReadMessageId: res.lastReadMessageId,
        });
        emit('ws:convs');
        void loadNotifications();
      } catch {
        /* курсорът ще се опита пак при следващо съобщение */
      }
    }, 350),
  );
}

/* ---------- Известия ---------- */

export async function loadNotifications({ more = false } = {}) {
  const data = await wsApi.notifications(more ? ws.notifCursor : null);
  const page = data.notifications ?? [];
  ws.notifications = more ? [...ws.notifications, ...page] : page;
  ws.notifCursor = data.nextCursor ?? null;
  ws.unreadNotifications = data.unreadCount ?? 0;
  // Предпочитанията идват с известията (§14.1) — за диалога „Предпочитания“.
  if (data.preferences) ws.notifPrefs = data.preferences;
  emit('ws:notifs');
}

let notifTimer = 0;
const refreshNotifications = () => {
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => void loadNotifications().catch(() => undefined), 300);
};

/* ---------- Присъствие ---------- */

export async function loadPresence(userIds) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== state.user?.id).slice(0, 100);
  if (ids.length === 0) return;
  const data = await wsApi.presence(ids);
  for (const p of data.presence ?? []) {
    ws.presence.set(p.userId, { status: p.status, lastSeenAt: p.lastSeenAt });
  }
  emit('ws:presence');
}

/* ---------- Събития от потока ---------- */

function previewOf(m) {
  return {
    id: m.id,
    sender: m.sender,
    preview: m.deleted ? null : String(m.body ?? '').slice(0, PREVIEW),
    deleted: m.deleted,
    createdAt: m.createdAt,
  };
}

function onMessage(type, m) {
  const cid = m.conversationId;
  const known = ws.convs.get(cid);
  const result = upsertMessage(cid, m);
  notify(cid);
  if (!known) {
    // Нов разговор (напр. някой ни писа за първи път): взимаме го с права проверка от сървъра.
    void loadConversation(cid)
      .then(() => loadLatest(cid))
      .catch(() => undefined);
    return;
  }
  const fresh = type === 'message.created' && result === 'added';
  const mine = m.sender?.id === state.user?.id;
  const patch = { id: cid };
  if (fresh && !m.replyToId) {
    patch.lastMessage = previewOf(m);
    patch.lastActivityAt = m.createdAt;
  } else if (type === 'message.updated' && known.lastMessage?.id === m.id) {
    patch.lastMessage = previewOf(m);
  }
  if (fresh && !mine) {
    const watching = ws.watching.has(cid) && document.visibilityState === 'visible';
    if (watching) scheduleRead(cid);
    patch.unread = (known.unread ?? 0) + 1;
    if (!watching && known.notificationPref !== 'NONE') {
      announce(t('ws.announce.newMessage', { name: titleOf(known) }));
    }
  }
  upsertConversation(patch);
  emit('ws:convs');
}

export function handleEvent(type, envelope) {
  const data = envelope?.data ?? {};
  switch (type) {
    case 'message.created':
    case 'message.updated':
      if (data.message) onMessage(type, data.message);
      break;
    case 'conversation.updated': {
      const id = data.conversation?.id;
      if (!id) break;
      if (data.removed) {
        ws.convs.delete(id);
        ws.slots.delete(id);
        emit('ws:removed', id);
      } else if (data.unread !== undefined) {
        upsertConversation({ id, unread: data.unread, lastReadMessageId: data.lastReadMessageId });
      } else if (ws.convs.has(id)) {
        upsertConversation({
          ...data.conversation,
          members: data.members,
          memberCount: data.memberCount,
        });
      } else {
        void loadConversation(id).catch(() => undefined);
        break;
      }
      emit('ws:convs');
      break;
    }
    case 'presence.changed':
      if (data.userId)
        setPresence(data.userId, { status: data.status, lastSeenAt: data.lastSeenAt });
      break;
    case 'notification.created':
      refreshNotifications();
      break;
    case 'case.assigned':
      emit('case:assigned', data);
      refreshNotifications();
      break;
    case 'case.updated':
    case 'step.updated':
    case 'queue.updated':
      emit(`rt:${type}`, data);
      break;
    default:
      break;
  }
}

/** Пълно възстановяване след прекъсване (AC-13): списък, известия и отворените разговори. */
export async function resync(openConversationIds) {
  const jobs = [loadConversations(), loadNotifications()];
  for (const id of openConversationIds) jobs.push(catchUp(id));
  await Promise.allSettled(jobs);
}
