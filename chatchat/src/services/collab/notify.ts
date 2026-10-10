import type { NotificationPref, Prisma, PrismaClient } from '@prisma/client';
import { enqueueNotificationEmail } from '../email/enqueue.js';
import { publishToUser, type CollabDeps } from './publish.js';
import { isUrgentCase } from './urgency.js';

/**
 * Известия (FR-18). Създават се при ново съобщение (по `notificationPref`: ALL / MENTIONS чрез
 * @име / NONE), поемане на случай, нов AI отговор в собствен случай и промяна по тикет.
 * Дедупликация по (потребител, eventType, objectId) сред НЕПРОЧЕТЕНИТЕ: второто съобщение в
 * същия разговор не трупа ново известие, а увеличава брояча на старото.
 * В payload няма съдържание на съобщения — само идентификатори, имена и броячи; текстът се
 * чете през REST с проверка на достъпа.
 * Поемане на СПЕШЕН случай (urgency.ts) става отделен вид — `case.urgent`, с приоритет „urgent“
 * (§12.3 „distinguere assegnazione urgente“). Ново (не слято) известие пуска и имейл (outbox в
 * същата транзакция), ако имейлите са включени.
 */

export type NotificationEvent =
  | 'message.created'
  | 'message.mention'
  | 'case.assigned'
  | 'case.urgent'
  | 'case.ai_answer'
  | 'ticket.changed';

/** Видовете с приоритет „спешно“ (UI ги показва отделно; писмото тръгва без забавяне). */
export const URGENT_EVENTS: ReadonlySet<string> = new Set(['case.urgent']);

export interface NotificationInput {
  tenantId: string;
  userId: string;
  eventType: NotificationEvent;
  objectType: 'conversation' | 'case' | 'ticket';
  objectId: string;
  payload: Record<string, unknown>;
}

/** Ключът на дедупликацията. */
export const dedupeKey = (n: Pick<NotificationInput, 'userId' | 'eventType' | 'objectId'>) =>
  `${n.userId}|${n.eventType}|${n.objectId}`;

/** Сливане с непрочетено известие за същото: последните данни + брояч на повторенията. */
export function mergePayload(
  previous: Prisma.JsonValue,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const prev =
    previous !== null && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  const count = typeof prev.count === 'number' && prev.count >= 1 ? prev.count : 1;
  return { ...next, count: count + 1 };
}

/**
 * @име в текста → кои членове са споменати. При „@Owner Uno“ и член „Owner“ печели по-дългото
 * съвпадение; след името трябва граница (не буква/цифра), иначе „@Ann“ би хванало „@Anna“.
 */
export function mentionedUserIds(
  text: string,
  members: ReadonlyArray<{ id: string; name: string }>,
): Set<string> {
  const lower = text.toLocaleLowerCase();
  const names = members
    .map((m) => ({ id: m.id, name: m.name.trim().toLocaleLowerCase() }))
    .filter((m) => m.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const out = new Set<string>();
  for (let i = lower.indexOf('@'); i !== -1; i = lower.indexOf('@', i + 1)) {
    for (const m of names) {
      if (!lower.startsWith(m.name, i + 1)) continue;
      const after = lower.slice(i + 1 + m.name.length, i + 2 + m.name.length);
      if (after && /[\p{L}\p{N}_]/u.test(after)) continue;
      out.add(m.id);
      break;
    }
  }
  return out;
}

/** Кой какво известие получава за ново съобщение — по предпочитанието му в разговора. */
export function messageRecipients(
  members: ReadonlyArray<{ userId: string; notificationPref: NotificationPref }>,
  senderId: string,
  mentioned: ReadonlySet<string>,
): Array<{ userId: string; eventType: 'message.created' | 'message.mention' }> {
  const out: Array<{ userId: string; eventType: 'message.created' | 'message.mention' }> = [];
  for (const m of members) {
    if (m.userId === senderId || m.notificationPref === 'NONE') continue;
    if (mentioned.has(m.userId)) out.push({ userId: m.userId, eventType: 'message.mention' });
    else if (m.notificationPref === 'ALL') {
      out.push({ userId: m.userId, eventType: 'message.created' });
    }
  }
  return out;
}

export function notificationView(n: {
  id: string;
  eventType: string;
  objectType: string;
  objectId: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
  readAt: Date | null;
}) {
  return {
    id: n.id,
    eventType: n.eventType,
    priority: URGENT_EVENTS.has(n.eventType) ? ('urgent' as const) : ('normal' as const),
    objectType: n.objectType,
    objectId: n.objectId,
    payload: n.payload,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}

/** Поемането на спешен случай е отделен вид известие (същият получател и обект). */
async function withPriority(
  db: PrismaClient,
  items: readonly NotificationInput[],
): Promise<NotificationInput[]> {
  const urgent = new Map<string, boolean>();
  const out: NotificationInput[] = [];
  for (const item of items) {
    if (item.eventType !== 'case.assigned') {
      out.push(item);
      continue;
    }
    if (!urgent.has(item.objectId))
      urgent.set(item.objectId, await isUrgentCase(db, item.objectId));
    out.push(urgent.get(item.objectId) ? { ...item, eventType: 'case.urgent' } : item);
  }
  return out;
}

/**
 * Записва известията в една транзакция. Заключването е по ключа на дедупликацията и в
 * подреден ред — паралелни съобщения не дават две непрочетени известия и не се заклещват.
 */
export async function notify(
  deps: CollabDeps,
  items: readonly NotificationInput[],
  actorId: string | null,
): Promise<void> {
  if (items.length === 0) return;
  try {
    await writeNotifications(deps, items, actorId);
  } catch (err) {
    // Известието е вторично: основното действие (съобщение, тикет, AI отговор) вече е записано.
    deps.logger.warn(
      { errName: err instanceof Error ? err.name : 'unknown', count: items.length },
      'известията не бяха записани',
    );
  }
}

async function writeNotifications(
  deps: CollabDeps,
  items: readonly NotificationInput[],
  actorId: string | null,
): Promise<void> {
  const unique = new Map<string, NotificationInput>();
  for (const item of await withPriority(deps.db, items)) unique.set(dedupeKey(item), item);
  const ordered = [...unique.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const written = await deps.db.$transaction(async (tx) => {
    const out = [];
    for (const [key, item] of ordered) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 4330))`;
      const existing = await tx.notification.findFirst({
        where: {
          userId: item.userId,
          eventType: item.eventType,
          objectId: item.objectId,
          readAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
      const row = existing
        ? await tx.notification.update({
            where: { id: existing.id },
            data: {
              payload: mergePayload(existing.payload, item.payload) as Prisma.InputJsonValue,
              createdAt: new Date(),
            },
          })
        : await tx.notification.create({
            data: {
              tenantId: item.tenantId,
              userId: item.userId,
              eventType: item.eventType,
              objectType: item.objectType,
              objectId: item.objectId,
              payload: { ...item.payload, count: 1 } as Prisma.InputJsonValue,
            },
          });
      if (!existing && deps.mail) await enqueueNotificationEmail(tx, deps.mail, row);
      out.push({ row, deduplicated: existing !== null });
    }
    return out;
  });
  for (const { row, deduplicated } of written) {
    publishToUser(
      deps,
      'notification.created',
      {
        tenantId: row.tenantId,
        userId: row.userId,
        ...(row.objectType === 'conversation' ? { conversationId: row.objectId } : {}),
      },
      actorId,
      { notification: notificationView(row), deduplicated },
    );
  }
}

/** Прочетеният разговор маха и известията за него (значката се изчиства на всички устройства). */
export async function markConversationNotificationsRead(
  db: PrismaClient,
  userId: string,
  conversationId: string,
): Promise<void> {
  await db.notification.updateMany({
    where: {
      userId,
      objectType: 'conversation',
      objectId: conversationId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}

/** Хората по случая, които трябва да научат за събитието — създателят и поелият, без автора. */
export function caseAudience(
  c: { createdById: string; assignedToId: string | null },
  actorId: string | null,
): string[] {
  return [...new Set([c.createdById, c.assignedToId])].filter(
    (id): id is string => id !== null && id !== actorId,
  );
}

/** Промяна по тикет (създаване, статус) — за създателя и поелия случая (FR-18). */
export async function notifyTicketChange(
  deps: CollabDeps,
  c: {
    id: string;
    number: string;
    tenantId: string;
    createdById: string;
    assignedToId: string | null;
  },
  ticket: { id: string; number: string; status: string },
  actorId: string,
): Promise<void> {
  await notify(
    deps,
    caseAudience(c, actorId).map((userId) => ({
      tenantId: c.tenantId,
      userId,
      eventType: 'ticket.changed' as const,
      objectType: 'ticket' as const,
      objectId: ticket.id,
      payload: { caseId: c.id, caseNumber: c.number, number: ticket.number, status: ticket.status },
    })),
    actorId,
  );
}
