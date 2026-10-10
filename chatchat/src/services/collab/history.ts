import type { Prisma, PrismaClient } from '@prisma/client';
import type { Loaded, Viewer } from './access.js';
import { markConversationNotificationsRead } from './notify.js';
import { publishToUser, type CollabDeps } from './publish.js';
import { fail, ok, type Result } from './result.js';
import { messageView, namesOf } from './views.js';

/**
 * Четене на разговор: страници по курсор (id на съобщение → (createdAt, id)), нишки чрез
 * `replyToId` и курсорът „прочетено до“ (FR-16). Същото подреждане навсякъде: (createdAt, id).
 * Това е и пътят за възстановяване след прекъснат поток: клиентът иска `after=<последно видяно>`.
 */

type Position = { createdAt: Date; id: string };

const before = (p: Position): Prisma.ConversationMessageWhereInput => ({
  OR: [{ createdAt: { lt: p.createdAt } }, { createdAt: p.createdAt, id: { lt: p.id } }],
});
const after = (p: Position): Prisma.ConversationMessageWhereInput => ({
  OR: [{ createdAt: { gt: p.createdAt } }, { createdAt: p.createdAt, id: { gt: p.id } }],
});

export interface PageQuery {
  before?: string | undefined;
  after?: string | undefined;
  threadId?: string | undefined;
  limit: number;
}

export async function listMessages(
  db: PrismaClient,
  loaded: Loaded,
  q: PageQuery,
): Promise<Result<{ messages: ReturnType<typeof messageView>[]; hasMore: boolean }>> {
  const c = loaded.conversation;
  const position = async (id: string) =>
    db.conversationMessage.findFirst({
      where: { id, conversationId: c.id },
      select: { createdAt: true, id: true, replyToId: true },
    });
  const where: Prisma.ConversationMessageWhereInput[] = [{ conversationId: c.id }];
  if (q.threadId) {
    const root = await position(q.threadId);
    if (!root || root.replyToId !== null) return fail(404, 'not_found');
    where.push({ replyToId: root.id });
  } else {
    where.push({ replyToId: null });
  }
  const cursorId = q.after ?? q.before;
  if (cursorId) {
    const cursor = await position(cursorId);
    if (!cursor) return fail(400, 'invalid_input');
    where.push(q.after ? after(cursor) : before(cursor));
  }
  // Нишка и „след курсора“ — напред по времето; иначе най-новите назад.
  const forward = Boolean(q.after) || (Boolean(q.threadId) && !q.before);
  const rows = await db.conversationMessage.findMany({
    where: { AND: where },
    orderBy: forward
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    include: { reactions: true },
  });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  if (!forward) page.reverse();
  const replyCounts = q.threadId
    ? new Map<string, number>()
    : new Map(
        (
          await db.conversationMessage.groupBy({
            by: ['replyToId'],
            where: { replyToId: { in: page.map((m) => m.id) }, deletedAt: null },
            _count: { _all: true },
          })
        ).map((g) => [g.replyToId as string, g._count._all]),
      );
  const names = await namesOf(
    db,
    c.tenantId,
    page.map((m) => m.senderId),
  );
  return ok({
    messages: page.map((m) =>
      messageView(m, names, q.threadId ? {} : { replyCount: replyCounts.get(m.id) ?? 0 }),
    ),
    hasMore,
  });
}

/** Непрочетените на зрителя след курсора му (съобщенията на другите, без изтритите). */
export async function unreadCount(
  db: PrismaClient,
  conversationId: string,
  viewerId: string,
  cursor: Position | null,
): Promise<number> {
  return db.conversationMessage.count({
    where: {
      AND: [
        { conversationId, deletedAt: null },
        { OR: [{ senderId: null }, { senderId: { not: viewerId } }] },
        ...(cursor ? [after(cursor)] : []),
      ],
    },
  });
}

/** Курсорът „прочетено до“ — само напред; чисти известията за разговора. */
export async function markRead(
  deps: CollabDeps,
  viewer: Viewer,
  loaded: Loaded,
  messageId: string,
): Promise<Result<{ unread: number; lastReadMessageId: string | null }>> {
  const c = loaded.conversation;
  const m = loaded.membership;
  if (!m) return fail(403, 'forbidden');
  const message = await deps.db.conversationMessage.findFirst({
    where: { id: messageId, conversationId: c.id },
    select: { id: true, createdAt: true },
  });
  if (!message) return fail(400, 'invalid_input');
  const current: Position | null =
    m.lastReadAt && m.lastReadMessageId
      ? { createdAt: m.lastReadAt, id: m.lastReadMessageId }
      : null;
  const forward =
    !current ||
    message.createdAt > current.createdAt ||
    (message.createdAt.getTime() === current.createdAt.getTime() && message.id > current.id);
  const position = forward ? { createdAt: message.createdAt, id: message.id } : current;
  if (forward) {
    // Условно обновяване: паралелен по-нов курсор не се връща назад.
    await deps.db.conversationMember.updateMany({
      where: {
        conversationId: c.id,
        userId: viewer.id,
        OR: [
          { lastReadAt: null },
          { lastReadAt: { lt: message.createdAt } },
          { lastReadAt: message.createdAt, lastReadMessageId: { lt: message.id } },
        ],
      },
      data: { lastReadMessageId: message.id, lastReadAt: message.createdAt },
    });
  }
  await markConversationNotificationsRead(deps.db, viewer.id, c.id);
  const unread = await unreadCount(deps.db, c.id, viewer.id, position);
  const lastReadMessageId = position?.id ?? null;
  // Другите устройства на същия човек изчистват значката.
  publishToUser(
    deps,
    'conversation.updated',
    { tenantId: c.tenantId, userId: viewer.id, conversationId: c.id },
    viewer.id,
    { conversation: { id: c.id }, unread, lastReadMessageId },
  );
  return ok({ unread, lastReadMessageId });
}
