// Моделът на работното пространство: разговори, съобщения по разговор, известия, присъствие и
// състояние на връзката. Всичко идва от REST и от потока; тук се слива БЕЗ дубликати — по `id` на
// съобщението (AC-12), а локално изпратените (оптимистични) се подменят по `clientMessageId`.

import { t } from '../i18n.js';
import { emit, state } from '../store.js';

export const ws = {
  convs: new Map(), // id -> изглед на разговор (+ unread, lastMessage, lastActivityAt)
  slots: new Map(), // id -> { messages: Map, threads: Map(rootId -> Map), hasMore, loaded }
  notifications: [],
  unreadNotifications: 0,
  presence: new Map(), // userId -> { status, lastSeenAt }
  publicChannels: [],
  nextCursor: null,
  listLoaded: false,
  conn: 'off', // off | connecting | live | polling
  watching: new Set(), // разговорите, които са на екрана сега (основен изглед или разгърнат прозорец)
};

export const time = (v) => (v ? new Date(v).getTime() : 0);

/** Подредба като на сървъра: (createdAt, id). */
export function byPosition(a, b) {
  const d = time(a.createdAt) - time(b.createdAt);
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function slotOf(convId) {
  let s = ws.slots.get(convId);
  if (!s) {
    s = { messages: new Map(), threads: new Map(), hasMore: false, loaded: false };
    ws.slots.set(convId, s);
  }
  return s;
}

export const sortedMessages = (convId) => [...slotOf(convId).messages.values()].sort(byPosition);
export const lastMessageId = (convId) => sortedMessages(convId).at(-1)?.id ?? null;

/**
 * Слива съобщение. Връща 'added' | 'updated' | 'same'. Отговорите (replyToId) отиват в нишката
 * на корена и увеличават брояча му; основният списък съдържа само корени. `counted` — страница
 * на нишката от REST: коренът вече носи `replyCount` от сървъра, броячът не се пипа.
 */
export function upsertMessage(convId, m, { counted = false } = {}) {
  const s = slotOf(convId);
  if (m.replyToId) {
    const thread = s.threads.get(m.replyToId) ?? new Map();
    const known = thread.has(m.id);
    thread.set(m.id, m);
    s.threads.set(m.replyToId, thread);
    const root = s.messages.get(m.replyToId);
    if (!known && !counted && root && !m.deleted) root.replyCount = (root.replyCount ?? 0) + 1;
    emit(`thread:${convId}`, m.replyToId);
    return known ? 'updated' : 'added';
  }
  const prev = s.messages.get(m.id);
  // Потокът не носи replyCount — локалният брояч се пази.
  const merged = prev && m.replyCount === undefined ? { ...m, replyCount: prev.replyCount } : m;
  if (prev && JSON.stringify(prev) === JSON.stringify(merged)) return 'same';
  s.messages.set(m.id, merged);
  return prev ? 'updated' : 'added';
}

/** Незабавна реакция/редакция на съобщение, видимо в основния списък или в нишка. */
export function findMessage(convId, id) {
  const s = slotOf(convId);
  const top = s.messages.get(id);
  if (top) return top;
  for (const thread of s.threads.values()) if (thread.has(id)) return thread.get(id);
  return null;
}

export function upsertConversation(view) {
  const prev = ws.convs.get(view.id);
  const next = { ...prev, ...view };
  // Личните полета, които потокът не носи, не се губят при сливане.
  if (view.unread === undefined && prev) next.unread = prev.unread;
  if (view.lastMessage === undefined && prev) next.lastMessage = prev.lastMessage;
  if (view.lastActivityAt === undefined && prev) next.lastActivityAt = prev.lastActivityAt;
  ws.convs.set(view.id, next);
  return next;
}

export function conversationsByActivity(filter = () => true) {
  return [...ws.convs.values()]
    .filter(filter)
    .sort((a, b) => time(b.lastActivityAt ?? b.createdAt) - time(a.lastActivityAt ?? a.createdAt));
}

export const totalUnread = () => {
  let n = 0;
  for (const c of ws.convs.values())
    if (c.member !== false && c.notificationPref !== 'NONE') n += c.unread ?? 0;
  return n;
};

/** Другият човек в директен разговор / участниците в група — без самия зрител. */
export function othersOf(conv) {
  return (conv.members ?? []).filter((m) => m.id !== state.user?.id);
}

export function titleOf(conv) {
  if (conv.type === 'CASE') {
    const c = state.cases.find((x) => x.id === conv.caseId);
    return t('conv.caseDiscussion', { number: c?.number ?? '' }).trim();
  }
  if (conv.name) return conv.name;
  const names = othersOf(conv).map((m) => m.name);
  if (names.length) return names.join(', ');
  return conv.type === 'DIRECT' ? t('conv.direct') : t('conv.group');
}

export function setConn(value) {
  if (ws.conn === value) return;
  ws.conn = value;
  emit('ws:conn', value);
}

export function setPresence(userId, p) {
  ws.presence.set(userId, p);
  emit('ws:presence', userId);
}

export function resetWorkspace() {
  ws.convs.clear();
  ws.slots.clear();
  ws.notifications = [];
  ws.unreadNotifications = 0;
  ws.presence.clear();
  ws.publicChannels = [];
  ws.nextCursor = null;
  ws.listLoaded = false;
  ws.conn = 'off';
  ws.watching.clear();
}
