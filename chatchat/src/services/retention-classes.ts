import { Prisma, type PrismaClient } from '@prisma/client';
import type { AttachmentStore } from '../storage/attachments.js';

/**
 * Класовете на ретенцията за работното пространство (NFR-08, NFR-13 „retention separata per
 * messaggi, presence, allegati e metadati“): всеки със свой срок, всеки по правилото „файлът
 * ПРЕДИ реда“. Съобщенията на дискусиите по случай (CASE) следват случая (services/retention.ts).
 */

const DAY = 24 * 3600 * 1000;
const BATCH = 500;
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

/** Файловете първо; без хранилище — fail-closed (редовете не се трият без файловете си). */
export async function deleteFiles(
  store: AttachmentStore | null,
  keys: readonly string[],
  required: boolean,
): Promise<void> {
  if (keys.length === 0) return;
  if (!store) {
    if (!required) return;
    throw new Error('ATTACHMENTS_DIR липсва — файловете не могат да се изтрият, редовете остават.');
  }
  for (const key of keys) await store.delete(key);
}

async function filesOf(db: PrismaClient, messageIds: readonly string[]) {
  if (messageIds.length === 0) return [];
  return db.attachment.findMany({
    where: { conversationMessageId: { in: [...messageIds] } },
    select: { objectKey: true },
  });
}

export type MessageClass = 'DIRECT' | 'GROUP' | 'CHANNEL';

export interface MessagePurge {
  deleted: number;
  tombstoned: number;
  files: number;
}

/**
 * Съобщенията от вид разговор, по-стари от срока — изтрити (с реакциите, маркерите, файловете).
 * Корен с по-нов отговор става следа (без текст и файлове), за да не се разпадне нишката;
 * следата пада, когато и отговорите изтекат.
 */
export async function purgeMessages(
  db: PrismaClient,
  store: AttachmentStore | null,
  type: MessageClass,
  days: number,
  now: Date,
): Promise<MessagePurge> {
  const cutoff = new Date(now.getTime() - days * DAY);
  const out: MessagePurge = { deleted: 0, tombstoned: 0, files: 0 };
  const old = Prisma.sql`m."createdAt" < ${utc(cutoff)} AND c."type" = ${type}::"ConversationType"`;
  const newerReply = Prisma.sql`EXISTS (SELECT 1 FROM "ConversationMessage" r
     WHERE r."replyToId" = m."id" AND r."createdAt" >= ${utc(cutoff)})`;
  for (;;) {
    const ids = (
      await db.$queryRaw<Array<{ id: string }>>`
        SELECT m."id" FROM "ConversationMessage" m
          JOIN "Conversation" c ON c."id" = m."conversationId"
         WHERE ${old} AND NOT ${newerReply}
         LIMIT ${BATCH}`
    ).map((r) => r.id);
    if (ids.length === 0) break;
    const files = await filesOf(db, ids);
    await deleteFiles(
      store,
      files.map((f) => f.objectKey),
      true,
    );
    out.files += files.length;
    out.deleted += (await db.conversationMessage.deleteMany({ where: { id: { in: ids } } })).count;
  }
  const roots = (
    await db.$queryRaw<Array<{ id: string }>>`
      SELECT m."id" FROM "ConversationMessage" m
        JOIN "Conversation" c ON c."id" = m."conversationId"
       WHERE ${old} AND ${newerReply}
         AND (m."body" <> '' OR EXISTS (SELECT 1 FROM "Attachment" a WHERE a."conversationMessageId" = m."id"))`
  ).map((r) => r.id);
  if (roots.length > 0) {
    const files = await filesOf(db, roots);
    await deleteFiles(
      store,
      files.map((f) => f.objectKey),
      true,
    );
    out.files += files.length;
    await db.attachment.deleteMany({ where: { conversationMessageId: { in: roots } } });
    await db.messageReaction.deleteMany({ where: { messageId: { in: roots } } });
    out.tombstoned = (
      await db.conversationMessage.updateMany({
        where: { id: { in: roots } },
        data: { body: '', deletedAt: now },
      })
    ).count;
  }
  return out;
}

/** Известията (прочетени и не) — координация, не архив. Писмата към тях отпадат (SetNull). */
export async function purgeNotifications(db: PrismaClient, days: number, now: Date) {
  const cutoff = new Date(now.getTime() - days * DAY);
  return (await db.notification.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
}

/**
 * Присъствието: „последно видян“ по-стар от срока. Ред без лична настройка — изтрит; с изключено
 * „последно видян“ — остава САМО настройката (времето се нулира), за да не се загуби изборът.
 */
export async function purgePresence(db: PrismaClient, days: number, now: Date) {
  const cutoff = new Date(now.getTime() - days * DAY);
  const gone = await db.userPresence.deleteMany({
    where: { lastSeenAt: { lt: cutoff }, showLastSeen: true },
  });
  const kept = await db.userPresence.updateMany({
    where: { lastSeenAt: { lt: cutoff, gt: new Date(0) }, showLastSeen: false },
    data: { lastSeenAt: new Date(0), status: 'OFFLINE' },
  });
  return gone.count + kept.count;
}

export interface MetadataPurge {
  emails: number;
  passwordLinks: number;
  tombstones: number;
}

/**
 * Метаданни: приключени редове в имейл outbox-а, използвани/изтекли линкове за парола и следите
 * на изтрити съобщения без отговори (текстът им вече е изчистен; файловете — първо).
 */
export async function purgeMetadata(
  db: PrismaClient,
  store: AttachmentStore | null,
  days: number,
  now: Date,
): Promise<MetadataPurge> {
  const cutoff = new Date(now.getTime() - days * DAY);
  const emails = await db.emailOutbox.deleteMany({
    where: { status: { in: ['SENT', 'FAILED', 'SKIPPED'] }, updatedAt: { lt: cutoff } },
  });
  const passwordLinks = await db.passwordReset.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }],
    },
  });
  const tombstones = await db.conversationMessage.findMany({
    where: { deletedAt: { lt: cutoff }, replies: { none: {} } },
    select: { id: true },
    take: 10_000,
  });
  const ids = tombstones.map((t) => t.id);
  const files = await filesOf(db, ids);
  await deleteFiles(
    store,
    files.map((f) => f.objectKey),
    true,
  );
  const removed = ids.length
    ? (await db.conversationMessage.deleteMany({ where: { id: { in: ids } } })).count
    : 0;
  return { emails: emails.count, passwordLinks: passwordLinks.count, tombstones: removed };
}
