import type { Prisma, PrismaClient } from '@prisma/client';
import type { Loaded, Viewer } from './access.js';
import { marksFor } from './marks.js';
import { markConversationNotificationsRead } from './notify.js';
import { publishToUser, type CollabDeps } from './publish.js';
import { fail, ok, type Result } from './result.js';
import { MESSAGE_INCLUDE, messageView, namesOf, type MessageRow } from './views.js';

/**
 * Четене на разговор: страници по курсор (id на съобщение → (createdAt, id)), нишки чрез
 * `replyToId` и курсорът „прочетено до“ (FR-16). Същото подреждане навсякъде: (createdAt, id).
 * Това е и пътят за възстановяване след прекъснат поток: клиентът иска `after=<последно видяно>`.
 * `around=<id>` — страница около съобщение (отваряне от търсенето/връзка „в контекст“).
 */

type Position = { createdAt: Date; id: string };

const before = (p: Position): Prisma.ConversationMessageWhereInput => ({
  OR: [{ createdAt: { lt: p.createdAt } }, { createdAt: p.createdAt, id: { lt: p.id } }],
});
const after = (p: Position): Prisma.ConversationMessageWhereInput => ({
  OR: [{ createdAt: { gt: p.createdAt } }, { createdAt: p.createdAt, id: { gt: p.id } }],
});
const ASC = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
const DESC = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

export interface PageQuery {
  before?: string | undefined;
  after?: string | undefined;
  around?: string | undefined;
  threadId?: string | undefined;
  limit: number;
}

type View = ReturnType<typeof messageView>;

/** Изгледите на страницата: имена, брой отговори (за корените) и личните маркери на зрителя. */
async function pageViews(
  db: PrismaClient,
  tenantId: string,
  viewerId: string | null,
  page: MessageRow[],
  withReplies: boolean,
): Promise<View[]> {
  const ids = page.map((m) => m.id);
  const [replyGroups, names, marks] = await Promise.all([
    withReplies
      ? db.conversationMessage.groupBy({
          by: ['replyToId'],
          where: { replyToId: { in: ids }, deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    namesOf(
      db,
      tenantId,
      page.map((m) => m.senderId),
    ),
    viewerId ? marksFor(db, viewerId, ids) : Promise.resolve(new Map()),
  ]);
  const replies = new Map(replyGroups.map((g) => [g.replyToId as string, g._count._all]));
  return page.map((m) =>
    messageView(m, names, {
      ...(withReplies ? { replyCount: replies.get(m.id) ?? 0 } : {}),
      ...(viewerId ? { marks: marks.get(m.id) ?? [] } : {}),
    }),
  );
}

export async function listMessages(
  db: PrismaClient,
  loaded: Loaded,
  q: PageQuery,
  viewerId: string | null = null,
): Promise<Result<{ messages: View[]; hasMore: boolean; hasNewer?: boolean; anchorId?: string }>> {
  const c = loaded.conversation;
  const position = async (id: string) =>
    db.conversationMessage.findFirst({
      where: { id, conversationId: c.id },
      select: { createdAt: true, id: true, replyToId: true },
    });
  if (q.around) {
    const target = await position(q.around);
    if (!target) return fail(400, 'invalid_input');
    // Отговор в нишка → страницата е около корена му (нишката се отваря отделно).
    const anchor = target.replyToId ? await position(target.replyToId) : target;
    if (!anchor) return fail(400, 'invalid_input');
    return aroundPage(db, loaded, anchor, q.limit, viewerId);
  }
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
    orderBy: forward ? ASC : DESC,
    take: q.limit + 1,
    include: MESSAGE_INCLUDE,
  });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  if (!forward) page.reverse();
  return ok({
    messages: await pageViews(db, c.tenantId, viewerId, page, !q.threadId),
    hasMore,
  });
}

/** Страница около корен: по-старите (до половината), самият той и по-новите. */
async function aroundPage(
  db: PrismaClient,
  loaded: Loaded,
  anchor: Position,
  limit: number,
  viewerId: string | null,
) {
  const c = loaded.conversation;
  const half = Math.max(1, Math.floor(limit / 2));
  const roots = { conversationId: c.id, replyToId: null };
  const [older, newer] = await Promise.all([
    db.conversationMessage.findMany({
      where: { AND: [roots, before(anchor)] },
      orderBy: DESC,
      take: half + 1,
      include: MESSAGE_INCLUDE,
    }),
    db.conversationMessage.findMany({
      where: { AND: [roots, { OR: [{ id: anchor.id }, after(anchor)] }] },
      orderBy: ASC,
      take: limit - half + 1,
      include: MESSAGE_INCLUDE,
    }),
  ]);
  const page = [...older.slice(0, half).reverse(), ...newer.slice(0, limit - half)];
  return ok({
    messages: await pageViews(db, c.tenantId, viewerId, page, true),
    hasMore: older.length > half,
    hasNewer: newer.length > limit - half,
    anchorId: anchor.id,
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

/** Другите устройства на същия човек сменят значката (курсорът е личен). */
function announceCursor(
  deps: CollabDeps,
  viewer: Viewer,
  c: { id: string; tenantId: string },
  unread: number,
  lastReadMessageId: string | null,
): void {
  publishToUser(
    deps,
    'conversation.updated',
    { tenantId: c.tenantId, userId: viewer.id, conversationId: c.id },
    viewer.id,
    { conversation: { id: c.id }, unread, lastReadMessageId },
  );
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
  announceCursor(deps, viewer, c, unread, lastReadMessageId);
  return ok({ unread, lastReadMessageId });
}

/**
 * „Отбележи като непрочетено“ (§12.1): курсорът отива точно ПРЕДИ съобщението (на предишното в
 * разговора, вкл. отговорите — курсорът е общ), така че то и всичко след него са непрочетени.
 * Единственото място, където курсорът се връща назад — изрично действие на самия човек.
 */
export async function markUnread(
  deps: CollabDeps,
  viewer: Viewer,
  loaded: Loaded,
  messageId: string,
): Promise<Result<{ unread: number; lastReadMessageId: string | null }>> {
  const c = loaded.conversation;
  if (!loaded.membership) return fail(403, 'forbidden');
  const message = await deps.db.conversationMessage.findFirst({
    where: { id: messageId, conversationId: c.id },
    select: { id: true, createdAt: true },
  });
  if (!message) return fail(400, 'invalid_input');
  const previous = await deps.db.conversationMessage.findFirst({
    where: { AND: [{ conversationId: c.id }, before(message)] },
    orderBy: DESC,
    select: { id: true, createdAt: true },
  });
  await deps.db.conversationMember.update({
    where: { conversationId_userId: { conversationId: c.id, userId: viewer.id } },
    data: { lastReadMessageId: previous?.id ?? null, lastReadAt: previous?.createdAt ?? null },
  });
  const unread = await unreadCount(deps.db, c.id, viewer.id, previous);
  const lastReadMessageId = previous?.id ?? null;
  announceCursor(deps, viewer, c, unread, lastReadMessageId);
  return ok({ unread, lastReadMessageId });
}
