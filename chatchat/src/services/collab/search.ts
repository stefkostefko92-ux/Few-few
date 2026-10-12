import { Prisma, type PrismaClient } from '@prisma/client';
import { can, caseAudiences } from '../../auth/rbac.js';
import { authorFor, type MessageAuthor } from '../case-views.js';
import { conversationAccessSql, type Viewer } from './access.js';
import { decodeCursor, encodeCursor } from './list.js';
import { searchTerms, snippetOf, toTsQuery, type SnippetPart } from './search-text.js';

/**
 * Търсене в историята (FR-16, §12.1 „Cronologia e audit“): пълнотекстово, на сървъра, в
 * съобщенията на разговорите И на случаите — само в това, което зрителят има право да вижда:
 * - разговори: `conversationAccessSql` (огледалото на правилата в access.ts — ЕДИНСТВЕНОТО място);
 *   изтритите не се намират;
 * - случаи: огледалото на `caseWhereFor` (свои/възложени, или всички с `case:readAll`); AI отговор —
 *   само ако читателят покрива аудиториите му (в портален случай — само PORTAL, AC-18), иначе
 *   не се намира изобщо (дори попадението би издало съдържание).
 * Подредба: най-новите първо, курсор по (createdAt, id) — стабилна, без OFFSET. Откъсът е части
 * текст (без HTML); авторът в случай — по правилото на читателя (порталът вижда роля, не име).
 * Под RLS PostgreSQL не ползва GIN индекса за `@@` — кандидатите по индекса дават тесните функции
 * `chatchat_search_*_messages` (само id-та на клиента от контекста, миграцията 20261011100100);
 * правилата за достъп и самото съвпадение се проверяват тук, под RLS.
 */

export interface SearchQuery {
  q: string;
  cursor: string | null;
  limit: number;
}

interface Row {
  source: 'conversation' | 'case';
  id: string;
  parent_id: string;
  created_at: Date;
  author_id: string | null;
  body: string;
  reply_to_id: string | null;
  kind: string;
}

/** Date като timestamp(3) в UTC — независимо от часовата зона на сесията в Postgres. */
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

/** Огледалото на `caseWhereFor` (services/cases.ts) за случай с псевдоним `k`. */
function caseScopeSql(v: Viewer): Prisma.Sql {
  if (can(v.role, 'case:readAll')) return Prisma.sql`k."tenantId" = ${v.tenantId}`;
  return Prisma.sql`(k."tenantId" = ${v.tenantId}
    AND (k."createdById" = ${v.id} OR k."assignedToId" = ${v.id}))`;
}

/** AI отговор се намира само ако читателят покрива аудиториите му (`coversAudiences`). */
function audienceSql(v: Viewer): Prisma.Sql {
  const portal = [...caseAudiences(v.role, true)];
  const own = [...caseAudiences(v.role, false)];
  return Prisma.sql`(m."kind" <> 'AI'
    OR (k."portal" = TRUE AND m."audiences" <@ ${portal}::"Audience"[])
    OR (k."portal" = FALSE AND m."audiences" <@ ${own}::"Audience"[]))`;
}

export type SearchFailure = 'invalid_query' | 'invalid_cursor';

export async function searchMessages(db: PrismaClient, viewer: Viewer, query: SearchQuery) {
  const terms = searchTerms(query.q);
  const tsq = toTsQuery(terms);
  if (!tsq) return { ok: false as const, code: 'invalid_query' as SearchFailure };
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor)
    return { ok: false as const, code: 'invalid_cursor' as SearchFailure };

  const tsQuery = Prisma.sql`to_tsquery('chatchat_search', ${tsq})`;
  const match = Prisma.sql`m."tsv" @@ ${tsQuery}`;
  const after = cursor
    ? Prisma.sql`WHERE (x.created_at, x.id) < (${utc(cursor.at)}, ${cursor.id})`
    : Prisma.empty;
  const rows = await db.$queryRaw<Row[]>`
    SELECT * FROM (
      SELECT 'conversation' AS source, m."id", m."conversationId" AS parent_id,
             m."createdAt" AS created_at, m."senderId" AS author_id, m."body",
             m."replyToId" AS reply_to_id, m."kind"::text AS kind
        FROM "ConversationMessage" m
        JOIN "Conversation" c ON c."id" = m."conversationId"
       WHERE m."id" IN (SELECT chatchat_search_conversation_messages(${tsQuery}))
         AND ${conversationAccessSql(viewer)} AND m."deletedAt" IS NULL AND ${match}
      UNION ALL
      SELECT 'case' AS source, m."id", m."caseId" AS parent_id, m."createdAt" AS created_at,
             m."authorId" AS author_id, m."body", NULL AS reply_to_id, m."kind"::text AS kind
        FROM "CaseMessage" m
        JOIN "Case" k ON k."id" = m."caseId"
       WHERE m."id" IN (SELECT chatchat_search_case_messages(${tsQuery}))
         AND ${caseScopeSql(viewer)} AND ${audienceSql(viewer)} AND ${match}
    ) x
    ${after}
    ORDER BY x.created_at DESC, x.id DESC
    LIMIT ${query.limit + 1}`;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    ok: true as const,
    value: {
      results: await views(db, viewer, page, terms),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.created_at, last.id) : null,
    },
  };
}

async function views(db: PrismaClient, viewer: Viewer, page: Row[], terms: string[]) {
  const conversationIds = [
    ...new Set(page.filter((r) => r.source === 'conversation').map((r) => r.parent_id)),
  ];
  const caseIds = [...new Set(page.filter((r) => r.source === 'case').map((r) => r.parent_id))];
  const authorIds = [...new Set(page.map((r) => r.author_id).filter((x): x is string => !!x))];
  const [conversations, cases, authors] = await Promise.all([
    db.conversation.findMany({
      where: { id: { in: conversationIds }, tenantId: viewer.tenantId },
      select: { id: true, type: true, name: true, caseId: true, portal: true },
    }),
    db.case.findMany({
      where: { id: { in: caseIds }, tenantId: viewer.tenantId },
      select: { id: true, number: true },
    }),
    db.user.findMany({
      where: { id: { in: authorIds }, tenantId: viewer.tenantId },
      select: { id: true, name: true, role: true, kind: true },
    }),
  ]);
  const conversationOf = new Map(conversations.map((c) => [c.id, c]));
  const caseOf = new Map(cases.map((c) => [c.id, c]));
  const authorOf = new Map<string, MessageAuthor>(authors.map((a) => [a.id, a]));
  return page.map((r) => {
    const snippet: SnippetPart[] = snippetOf(r.body, terms);
    if (r.source === 'conversation') {
      const author = r.author_id ? authorOf.get(r.author_id) : undefined;
      return {
        source: 'conversation' as const,
        id: r.id,
        kind: r.kind,
        conversation: conversationOf.get(r.parent_id) ?? { id: r.parent_id },
        replyToId: r.reply_to_id,
        sender: r.author_id ? { id: r.author_id, name: author?.name ?? null } : null,
        createdAt: r.created_at,
        snippet,
      };
    }
    const c = caseOf.get(r.parent_id);
    return {
      source: 'case' as const,
      id: r.id,
      kind: r.kind,
      caseId: r.parent_id,
      caseNumber: c?.number ?? null,
      ...authorFor(viewer, r.author_id ? authorOf.get(r.author_id) : undefined),
      createdAt: r.created_at,
      snippet,
    };
  });
}
