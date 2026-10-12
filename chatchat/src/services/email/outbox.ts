import { Prisma, type EmailKind, type PrismaClient } from '@prisma/client';
import type { Principal } from '../../auth/sessions.js';
import { withTenant } from '../../db/tenant-context.js';
import { findCaseFor } from '../cases.js';
import { conversationAccessSql, loadConversationFor, type Viewer } from '../collab/access.js';
import { DEFAULT_PREFERENCES } from '../collab/notification-prefs.js';
import { isErased } from '../users.js';
import type { Mailer } from './mailer.js';
import { backoffMs, localTime, quietUntil } from './schedule.js';
import { renderEmail, type EmailData } from './templates.js';

/**
 * Изпращачът на outbox-а (асинхронно, без Redis): взима зрелите редове с `FOR UPDATE SKIP LOCKED`
 * (два процеса не взимат един ред), наема ги за 2 мин. (срив по средата → редът се взима отново),
 * праща и записва изхода. Идемпотентност: `dedupeKey` (известие/дайджест за деня) при запис +
 * `Idempotency-Key` = id на реда към Brevo при повтор.
 * Всичко се проверява В МОМЕНТА на изпращане, не при запис: акаунтът е активен, имейлите са
 * включени, известието още е непрочетено, достъпът до разговора/случая още го има, предпочитанието
 * по разговора още е ALL (MENTIONS — само за споменаване); тихи часове → отлагане до края им.
 * В лога — само id, вид и код; никога адрес, име или текст.
 */

export interface EmailDeps {
  /** Ролята на приложението (под RLS): проверките и записът на изхода — в контекста на клиента. */
  db: PrismaClient;
  /**
   * Системната роля (BYPASSRLS) — САМО за взимането на зрелите редове и за дайджестите през всички
   * клиенти (NFR-03, src/config-db.ts).
   */
  system: PrismaClient;
  mailer: Mailer;
  logger: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
  /** https://chatchat.carbonstealth.eu — за връзката в писмото. */
  baseUrl: string;
  maxAttempts: number;
  digestHour: number;
}

const LEASE_MS = 2 * 60 * 1000;
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

interface Claimed {
  id: string;
  tenantId: string;
  userId: string;
  kind: EmailKind;
  notificationId: string | null;
  attempts: number;
}

async function claim(db: PrismaClient, now: Date, limit: number): Promise<Claimed[]> {
  return db.$queryRaw<Claimed[]>`
    UPDATE "EmailOutbox" SET "status" = 'SENDING', "attempts" = "attempts" + 1,
           "lockedUntil" = ${utc(new Date(now.getTime() + LEASE_MS))}, "updatedAt" = ${utc(now)}
     WHERE "id" IN (
       SELECT "id" FROM "EmailOutbox"
        WHERE ("status" = 'PENDING' AND "notBefore" <= ${utc(now)})
           OR ("status" = 'SENDING' AND "lockedUntil" < ${utc(now)})
        ORDER BY "notBefore" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING "id", "tenantId", "userId", "kind", "notificationId", "attempts"`;
}

type Outcome =
  | { status: 'SENT' }
  | { status: 'SKIPPED'; code: string }
  | { status: 'DEFER'; until: Date }
  | { status: 'RETRY' | 'FAILED'; code: string };

export interface OutboxReport {
  claimed: number;
  sent: number;
  skipped: number;
  deferred: number;
  retried: number;
  failed: number;
}

async function deliverAndFinish(deps: EmailDeps, row: Claimed, now: Date): Promise<Outcome> {
  let outcome: Outcome;
  try {
    outcome = await deliver(deps, row, now);
  } catch (err) {
    outcome = { status: 'RETRY', code: err instanceof Error ? err.name : 'error' };
  }
  if (outcome.status === 'RETRY' && row.attempts >= deps.maxAttempts) {
    outcome = { status: 'FAILED', code: outcome.code };
  }
  await finish(deps.db, row, outcome, now);
  return outcome;
}

export async function processOutbox(
  deps: EmailDeps,
  now = new Date(),
  limit = 20,
): Promise<OutboxReport> {
  const rows = await claim(deps.system, now, limit);
  const report: OutboxReport = {
    claimed: rows.length,
    sent: 0,
    skipped: 0,
    deferred: 0,
    retried: 0,
    failed: 0,
  };
  for (const row of rows) {
    // Всяко писмо — в контекста на клиента си: проверките на достъпа и изходът са под RLS.
    const outcome = await withTenant(row.tenantId, () => deliverAndFinish(deps, row, now));
    if (outcome.status === 'SENT') report.sent += 1;
    else if (outcome.status === 'SKIPPED') report.skipped += 1;
    else if (outcome.status === 'DEFER') report.deferred += 1;
    else if (outcome.status === 'RETRY') report.retried += 1;
    else report.failed += 1;
    if (outcome.status === 'FAILED' || outcome.status === 'RETRY') {
      deps.logger.warn(
        { outboxId: row.id, kind: row.kind, code: outcome.code, attempts: row.attempts },
        'имейл известието не тръгна',
      );
    }
  }
  return report;
}

async function finish(db: PrismaClient, row: Claimed, o: Outcome, now: Date): Promise<void> {
  const base = { lockedUntil: null };
  const data =
    o.status === 'SENT'
      ? { ...base, status: 'SENT' as const, sentAt: now, lastError: null }
      : o.status === 'SKIPPED'
        ? { ...base, status: 'SKIPPED' as const, lastError: o.code }
        : o.status === 'DEFER'
          ? // Тихите часове не са опит — броячът се връща.
            { ...base, status: 'PENDING' as const, notBefore: o.until, attempts: row.attempts - 1 }
          : o.status === 'RETRY'
            ? {
                ...base,
                status: 'PENDING' as const,
                notBefore: new Date(now.getTime() + backoffMs(row.attempts)),
                lastError: o.code,
              }
            : { ...base, status: 'FAILED' as const, lastError: o.code };
  await db.emailOutbox.update({ where: { id: row.id }, data });
}

async function deliver(deps: EmailDeps, row: Claimed, now: Date): Promise<Outcome> {
  const { db } = deps;
  const user = await db.user.findFirst({
    where: { id: row.userId, tenantId: row.tenantId },
    include: { notificationSettings: true },
  });
  if (!user || !user.active || (user.expiresAt && user.expiresAt <= now) || isErased(user)) {
    return { status: 'SKIPPED', code: 'inactive' };
  }
  const prefs = user.notificationSettings ?? DEFAULT_PREFERENCES;
  if (!prefs.emailEnabled) return { status: 'SKIPPED', code: 'disabled' };
  const until = quietUntil(now, prefs.timeZone, { start: prefs.quietStart, end: prefs.quietEnd });
  if (until) return { status: 'DEFER', until };

  const viewer: Viewer = {
    id: user.id,
    tenantId: user.tenantId,
    companyId: user.companyId,
    role: user.role,
    kind: user.kind,
  };
  const data = await contentFor(deps, row, viewer, user.locale);
  if ('skip' in data) return { status: 'SKIPPED', code: data.skip };
  const content = renderEmail(user.locale, data);
  const result = await deps.mailer.send({
    to: user.email,
    ...content,
    idempotencyKey: row.id,
    tag: row.kind,
  });
  if (result.ok) return { status: 'SENT' };
  return { status: result.retry ? 'RETRY' : 'FAILED', code: result.code };
}

async function contentFor(
  deps: EmailDeps,
  row: Claimed,
  viewer: Viewer,
  locale: string,
): Promise<EmailData | { skip: string }> {
  const { db } = deps;
  const base = deps.baseUrl.replace(/\/+$/, '');
  if (row.kind === 'DIGEST') {
    const counts = await unreadCounts(db, viewer);
    if (counts.messages + counts.notifications === 0) return { skip: 'nothing' };
    return { kind: 'DIGEST', ...counts, link: `${base}/` };
  }
  const n = row.notificationId
    ? await db.notification.findFirst({
        where: { id: row.notificationId, userId: viewer.id, tenantId: viewer.tenantId },
      })
    : null;
  if (!n || n.readAt) return { skip: 'read' };
  if (row.kind === 'MESSAGE' || row.kind === 'MENTION') {
    const loaded = await loadConversationFor(db, viewer, n.objectId);
    const pref = loaded?.membership?.notificationPref;
    if (!loaded || !pref) return { skip: 'no_access' };
    if (pref === 'NONE' || (row.kind === 'MESSAGE' && pref !== 'ALL')) return { skip: 'muted' };
    const c = loaded.conversation;
    return {
      kind: row.kind,
      place: { type: c.type, name: c.name },
      link: `${base}/#c=${encodeURIComponent(c.id)}`,
    };
  }
  // Възложен/спешен случай: същото правило за достъп като навсякъде (findCaseFor).
  const principal: Principal = {
    user: { ...viewer, name: '', locale },
    session: { id: 'email', csrfToken: '' },
    mfa: { enabled: false, passed: true, required: false },
  };
  const c = await findCaseFor(db, principal, n.objectId);
  if (!c) return { skip: 'no_access' };
  return {
    kind: row.kind,
    caseNumber: c.number,
    link: `${base}/#case=${encodeURIComponent(c.id)}`,
  };
}

/** Непрочетеното за дайджеста: съобщения (по курсора, в разговори с известия) и известия. */
async function unreadCounts(db: PrismaClient, viewer: Viewer) {
  const [row] = await db.$queryRaw<Array<{ messages: number; conversations: number }>>`
    SELECT COUNT(*)::int AS messages, COUNT(DISTINCT c."id")::int AS conversations
      FROM "Conversation" c
      JOIN "ConversationMember" mb
        ON mb."conversationId" = c."id" AND mb."userId" = ${viewer.id}
       AND mb."notificationPref" <> 'NONE'
      JOIN "ConversationMessage" u ON u."conversationId" = c."id"
     WHERE ${conversationAccessSql(viewer)}
       AND u."deletedAt" IS NULL
       AND (u."senderId" IS NULL OR u."senderId" <> ${viewer.id})
       AND (mb."lastReadAt" IS NULL
            OR (u."createdAt", u."id") > (mb."lastReadAt", COALESCE(mb."lastReadMessageId", '')))`;
  const notifications = await db.notification.count({
    where: { userId: viewer.id, tenantId: viewer.tenantId, readAt: null },
  });
  return {
    messages: row?.messages ?? 0,
    conversations: row?.conversations ?? 0,
    notifications,
  };
}

/**
 * Дневният дайджест (§12.3): за всеки с DAILY — един ред на местен ден, след часа на дайджеста.
 * Ключът `digest:<човек>:<дата>` прави повторното извикване (и втори процес) безвредно.
 */
export async function scheduleDigests(deps: EmailDeps, now = new Date()): Promise<number> {
  // През всички клиенти — системната роля (редовете носят своя клиент).
  const subscribers = await deps.system.notificationSettings.findMany({
    where: { digest: 'DAILY', emailEnabled: true },
    select: { userId: true, tenantId: true, timeZone: true },
    take: 10_000,
  });
  const due = subscribers.flatMap((s) => {
    const local = localTime(now, s.timeZone);
    if (local.minutes < deps.digestHour * 60) return [];
    return [
      {
        tenantId: s.tenantId,
        userId: s.userId,
        kind: 'DIGEST' as const,
        dedupeKey: `digest:${s.userId}:${local.date}`,
        notBefore: now,
      },
    ];
  });
  if (due.length === 0) return 0;
  return (await deps.system.emailOutbox.createMany({ data: due, skipDuplicates: true })).count;
}
