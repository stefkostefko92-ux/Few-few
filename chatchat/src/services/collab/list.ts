import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { can } from '../../auth/rbac.js';
import { isStaff, type Viewer } from './access.js';
import { conversationView, namesOf, previewOf, type MemberInfo } from './views.js';

/**
 * Лявата лента (FR-15): разговорите, в които зрителят е член, по последна активност, с брой
 * непрочетени ПО КУРСОРА (съобщенията на другите след `lastRead*`), звезда и последно съобщение.
 * Курсорна пагинация по (активност, id) — стабилна, без OFFSET. Филтрите по вид повтарят
 * `memberConversationWhere` (access.ts): порталът — само портални DIRECT/GROUP; без
 * `case:readAll` — без вътрешни дискусии по случаи.
 */

const Cursor = z.object({ t: z.iso.datetime(), id: z.string().min(1).max(40) });

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: at.toISOString(), id })).toString('base64url');
}

export function decodeCursor(raw: string): { at: Date; id: string } | null {
  try {
    const parsed = Cursor.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed.success ? { at: new Date(parsed.data.t), id: parsed.data.id } : null;
  } catch {
    return null;
  }
}

/** Date като timestamp(3) в UTC — независимо от часовата зона на сесията в Postgres. */
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

interface Row {
  id: string;
  activity: Date;
  unread: number;
  last_message_id: string | null;
}

export async function listMemberConversations(
  db: PrismaClient,
  viewer: Viewer,
  opts: { cursor: { at: Date; id: string } | null; limit: number },
) {
  const kindFilter = !isStaff(viewer)
    ? Prisma.sql`AND c."portal" = TRUE AND c."type" IN ('DIRECT', 'GROUP')`
    : can(viewer.role, 'case:readAll')
      ? Prisma.empty
      : Prisma.sql`AND c."type" <> 'CASE'`;
  const cursorFilter = opts.cursor
    ? Prisma.sql`AND (COALESCE(lm."createdAt", c."createdAt"), c."id") < (${utc(opts.cursor.at)}, ${opts.cursor.id})`
    : Prisma.empty;
  const rows = await db.$queryRaw<Row[]>`
    SELECT c."id",
           COALESCE(lm."createdAt", c."createdAt") AS activity,
           lm."id" AS last_message_id,
           (SELECT COUNT(*)::int FROM "ConversationMessage" u
             WHERE u."conversationId" = c."id"
               AND u."deletedAt" IS NULL
               AND (u."senderId" IS NULL OR u."senderId" <> ${viewer.id})
               AND (m."lastReadAt" IS NULL
                    OR (u."createdAt", u."id") > (m."lastReadAt", COALESCE(m."lastReadMessageId", '')))
           ) AS unread
      FROM "Conversation" c
      JOIN "ConversationMember" m ON m."conversationId" = c."id" AND m."userId" = ${viewer.id}
      LEFT JOIN LATERAL (
        SELECT x."id", x."createdAt" FROM "ConversationMessage" x
         WHERE x."conversationId" = c."id"
         ORDER BY x."createdAt" DESC, x."id" DESC
         LIMIT 1
      ) lm ON TRUE
     WHERE c."tenantId" = ${viewer.tenantId}
       ${kindFilter}
       ${cursorFilter}
     ORDER BY activity DESC, c."id" DESC
     LIMIT ${opts.limit + 1}`;
  const page = rows.slice(0, opts.limit);
  const ids = page.map((r) => r.id);
  const [conversations, memberships, lastMessages, counts, people] = await Promise.all([
    db.conversation.findMany({ where: { id: { in: ids } } }),
    db.conversationMember.findMany({ where: { conversationId: { in: ids }, userId: viewer.id } }),
    db.conversationMessage.findMany({
      where: { id: { in: page.map((r) => r.last_message_id).filter((x): x is string => !!x) } },
    }),
    db.conversationMember.groupBy({
      by: ['conversationId'],
      where: { conversationId: { in: ids } },
      _count: { _all: true },
    }),
    // DIRECT/GROUP показват хората; каналите и случаите — само броя.
    db.conversationMember.findMany({
      where: { conversationId: { in: ids }, conversation: { type: { in: ['DIRECT', 'GROUP'] } } },
      orderBy: { joinedAt: 'asc' },
      select: {
        conversationId: true,
        role: true,
        user: { select: { id: true, name: true, kind: true } },
      },
    }),
  ]);
  const byId = new Map(conversations.map((c) => [c.id, c]));
  const membershipOf = new Map(memberships.map((m) => [m.conversationId, m]));
  const lastOf = new Map(lastMessages.map((m) => [m.conversationId, m]));
  const countOf = new Map(counts.map((g) => [g.conversationId, g._count._all]));
  const peopleOf = new Map<string, MemberInfo[]>();
  for (const p of people) {
    const list = peopleOf.get(p.conversationId) ?? [];
    if (list.length < 50)
      list.push({ id: p.user.id, name: p.user.name, kind: p.user.kind, role: p.role });
    peopleOf.set(p.conversationId, list);
  }
  const names = await namesOf(
    db,
    viewer.tenantId,
    lastMessages.map((m) => m.senderId),
  );
  const items = page.flatMap((r) => {
    const c = byId.get(r.id);
    if (!c) return [];
    return [
      conversationView(c, membershipOf.get(r.id) ?? null, {
        ...(peopleOf.has(r.id) ? { members: peopleOf.get(r.id) } : {}),
        memberCount: countOf.get(r.id) ?? 0,
        unread: r.unread,
        lastMessage: previewOf(lastOf.get(r.id) ?? null, names),
        lastActivityAt: r.activity,
      }),
    ];
  });
  const last = page.at(-1);
  return {
    conversations: items,
    nextCursor: rows.length > opts.limit && last ? encodeCursor(last.activity, last.id) : null,
  };
}

/** PUBLIC каналите, в които персоналът още не е член — за „Разгледай канали“. */
export async function listPublicChannels(db: PrismaClient, viewer: Viewer) {
  if (!isStaff(viewer)) return [];
  const channels = await db.conversation.findMany({
    where: {
      tenantId: viewer.tenantId,
      type: 'CHANNEL',
      visibility: 'PUBLIC',
      portal: false,
      archivedAt: null,
      members: { none: { userId: viewer.id } },
    },
    orderBy: { name: 'asc' },
    take: 200,
    include: { _count: { select: { members: true } } },
  });
  return channels.map(({ _count, ...c }) =>
    conversationView(c, null, { memberCount: _count.members }),
  );
}
