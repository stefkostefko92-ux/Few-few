import { Prisma, type MessageMarkKind, type PrismaClient } from '@prisma/client';
import { conversationAccessSql, type Viewer } from './access.js';
import { decodeCursor, encodeCursor } from './list.js';
import { fail, ok, type Result } from './result.js';
import type { loadMessageFor } from './messages.js';

/**
 * Лични маркери на съобщение (§12.1 „marca come da fare“, „aggiungi ai preferiti“): TODO и
 * STARRED. Вижда ги само човекът; списъкът „Da fare“/„Preferiti“ минава през същите правила за
 * достъп като всичко друго (`conversationAccessSql`) — изгубен достъп до разговора или изтрито
 * съобщение = маркерът просто не се показва (редът остава до изтриването на съобщението).
 */

export const MARK_KINDS = ['TODO', 'STARRED'] as const satisfies readonly MessageMarkKind[];

type Target = NonNullable<Awaited<ReturnType<typeof loadMessageFor>>>;

export async function setMark(
  db: PrismaClient,
  viewer: Viewer,
  target: Target,
  kind: MessageMarkKind,
  on: boolean,
): Promise<Result<{ marks: MessageMarkKind[] }>> {
  const { message } = target;
  if (on && message.deletedAt) return fail(409, 'message_deleted');
  if (on) {
    await db.messageMark.createMany({
      data: [{ messageId: message.id, userId: viewer.id, kind, tenantId: viewer.tenantId }],
      skipDuplicates: true,
    });
  } else {
    await db.messageMark.deleteMany({ where: { messageId: message.id, userId: viewer.id, kind } });
  }
  return ok({ marks: (await marksFor(db, viewer.id, [message.id])).get(message.id) ?? [] });
}

/** Маркерите на зрителя за страница съобщения (за изгледа на разговора). */
export async function marksFor(
  db: PrismaClient,
  userId: string,
  messageIds: readonly string[],
): Promise<Map<string, MessageMarkKind[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db.messageMark.findMany({
    where: { userId, messageId: { in: [...messageIds] } },
    orderBy: { kind: 'asc' },
    select: { messageId: true, kind: true },
  });
  const out = new Map<string, MessageMarkKind[]>();
  for (const r of rows) out.set(r.messageId, [...(out.get(r.messageId) ?? []), r.kind]);
  return out;
}

interface MarkedRow {
  message_id: string;
  marked_at: Date;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  reply_to_id: string | null;
  created_at: Date;
  kind: string;
}

const PREVIEW = 200;
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

/** „Da fare“ / „Preferiti“: маркираните съобщения, до които зрителят още има достъп. */
export async function listMarked(
  db: PrismaClient,
  viewer: Viewer,
  q: { kind: MessageMarkKind; cursor: string | null; limit: number },
): Promise<Result<{ items: unknown[]; nextCursor: string | null }>> {
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cursor) return fail(400, 'invalid_cursor');
  const rows = await db.$queryRaw<MarkedRow[]>`
    SELECT mk."messageId" AS message_id, mk."createdAt" AS marked_at,
           m."conversationId" AS conversation_id, m."senderId" AS sender_id, m."body",
           m."replyToId" AS reply_to_id, m."createdAt" AS created_at, m."kind"::text AS kind
      FROM "MessageMark" mk
      JOIN "ConversationMessage" m ON m."id" = mk."messageId"
      JOIN "Conversation" c ON c."id" = m."conversationId"
     WHERE mk."userId" = ${viewer.id}
       AND mk."tenantId" = ${viewer.tenantId}
       AND mk."kind" = ${q.kind}::"MessageMarkKind"
       AND m."deletedAt" IS NULL
       AND ${conversationAccessSql(viewer)}
       ${cursor ? Prisma.sql`AND (mk."createdAt", mk."messageId") < (${utc(cursor.at)}, ${cursor.id})` : Prisma.empty}
     ORDER BY mk."createdAt" DESC, mk."messageId" DESC
     LIMIT ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);
  const ids = [...new Set(page.map((r) => r.conversation_id))];
  const senders = [...new Set(page.map((r) => r.sender_id).filter((x): x is string => !!x))];
  const [conversations, people] = await Promise.all([
    db.conversation.findMany({
      where: { id: { in: ids }, tenantId: viewer.tenantId },
      select: { id: true, type: true, name: true, caseId: true },
    }),
    db.user.findMany({
      where: { id: { in: senders }, tenantId: viewer.tenantId },
      select: { id: true, name: true },
    }),
  ]);
  const convOf = new Map(conversations.map((c) => [c.id, c]));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const last = page.at(-1);
  return ok({
    items: page.map((r) => ({
      messageId: r.message_id,
      kind: r.kind,
      markedAt: r.marked_at,
      conversation: convOf.get(r.conversation_id) ?? { id: r.conversation_id },
      replyToId: r.reply_to_id,
      sender: r.sender_id ? { id: r.sender_id, name: nameOf.get(r.sender_id) ?? null } : null,
      preview: r.body.slice(0, PREVIEW),
      createdAt: r.created_at,
    })),
    nextCursor:
      rows.length > q.limit && last ? encodeCursor(last.marked_at, last.message_id) : null,
  });
}
