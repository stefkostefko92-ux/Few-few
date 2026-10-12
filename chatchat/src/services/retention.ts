import type { PrismaClient } from '@prisma/client';
import type { AttachmentStore } from '../storage/attachments.js';
import { pruneAudit, type AuditPruneReport } from './audit-retention.js';
import {
  deleteFiles,
  purgeMessages,
  purgeMetadata,
  purgeNotifications,
  purgePresence,
  purgeProposals,
  type MessageClass,
  type MessagePurge,
  type MetadataPurge,
} from './retention-classes.js';

/**
 * Ретенцията (GDPR чл. 5(1)(e), NFR-08, NFR-13) като функция — CLI-то (`npm run retention`) я вика
 * дневно, тестовете — директно. Всеки клас данни има свой срок (src/config.ts → RETENTION_*);
 * незададен срок (null/липсва) → класът не се пипа. Файловете се трият ПРЕДИ реда в базата: ред
 * без файл е безвреден (свалянето дава 404), файл без ред е забравен завинаги.
 */

export interface RetentionOptions {
  sessionDays: number;
  /** null → затворените случаи не се трият (решение на администратора на данните). */
  caseDays: number | null;
  /** Съобщенията по вид разговор; null/липсва → не се трият. */
  directDays?: number | null;
  groupDays?: number | null;
  channelDays?: number | null;
  notificationDays?: number | null;
  presenceDays?: number | null;
  metadataDays?: number | null;
  /** Затворените предложения към знанието; null/липсва → не се трият. */
  proposalDays?: number | null;
  /** Одитът (по подразбиране в CLI-то 10 г.) — с контролна точка, веригата не се чупи. */
  auditDays?: number | null;
  auditArchiveDir?: string | null;
  /** Непривързан файл живее толкова часа (по подразбиране 24). */
  orphanHours?: number;
  /** INFECTED/FAILED редовете — толкова дни (по подразбиране 7). */
  quarantineDays?: number;
  now?: Date;
}

export interface RetentionReport {
  sessions: number;
  cases: number;
  caseFiles: number;
  orphans: number;
  quarantined: number;
  messages: Record<'direct' | 'group' | 'channel', MessagePurge | null>;
  notifications: number | null;
  presence: number | null;
  metadata: MetadataPurge | null;
  proposals: number | null;
  audit: AuditPruneReport | null;
}

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const BATCH = 100;

const given = (v: number | null | undefined): v is number => typeof v === 'number';

export async function runRetention(
  db: PrismaClient,
  store: AttachmentStore | null,
  opts: RetentionOptions,
): Promise<RetentionReport> {
  const nowDate = opts.now ?? new Date();
  const now = nowDate.getTime();
  const sessionCutoff = new Date(now - opts.sessionDays * DAY);
  const sessions = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
  });

  // Случаите — със съобщенията, тикета, хронологията и файловете (и на разговора на случая).
  let cases = 0;
  let caseFiles = 0;
  if (opts.caseDays !== null) {
    const closedBefore = new Date(now - opts.caseDays * DAY);
    const doomed = { status: 'RESOLVED' as const, closedAt: { lt: closedBefore } };
    for (;;) {
      const batch = await db.case.findMany({ where: doomed, select: { id: true }, take: BATCH });
      if (batch.length === 0) break;
      const ids = batch.map((c) => c.id);
      const files = await db.attachment.findMany({
        where: {
          OR: [
            { caseId: { in: ids } },
            { conversation: { caseId: { in: ids } } },
            { conversationMessage: { conversation: { caseId: { in: ids } } } },
          ],
        },
        select: { objectKey: true },
      });
      await deleteFiles(
        store,
        files.map((f) => f.objectKey),
        true,
      );
      caseFiles += files.length;
      const deleted = (await db.case.deleteMany({ where: { id: { in: ids }, ...doomed } })).count;
      cases += deleted;
      if (deleted === 0) break;
    }
  }

  // Съобщенията по вид разговор (NFR-13) — всеки със свой срок.
  const classes: Array<
    [keyof RetentionReport['messages'], MessageClass, number | null | undefined]
  > = [
    ['direct', 'DIRECT', opts.directDays],
    ['group', 'GROUP', opts.groupDays],
    ['channel', 'CHANNEL', opts.channelDays],
  ];
  const messages: RetentionReport['messages'] = { direct: null, group: null, channel: null };
  for (const [key, type, days] of classes) {
    if (given(days)) messages[key] = await purgeMessages(db, store, type, days, nowDate);
  }

  // Сираци: снимка/лог/файл от разговор, които не са стигнали до съобщение; PDF за базата
  // знания, от който не е станал документ (документът пази sha256 на оригинала като checksum).
  const orphanBefore = new Date(now - (opts.orphanHours ?? 24) * HOUR);
  const loose = await db.attachment.findMany({
    where: {
      createdAt: { lt: orphanBefore },
      scanStatus: { in: ['PENDING', 'CLEAN'] },
      caseMessageId: null,
      conversationMessageId: null,
    },
    select: {
      id: true,
      tenantId: true,
      kind: true,
      sha256: true,
      objectKey: true,
      conversationId: true,
    },
  });
  const pdfs = loose.filter((a) => a.kind === 'DOCUMENT' && a.conversationId === null);
  const used = new Set(
    (
      await db.document.findMany({
        where: { checksum: { in: pdfs.map((a) => a.sha256) } },
        select: { tenantId: true, checksum: true },
      })
    ).map((d) => `${d.tenantId}|${d.checksum}`),
  );
  const orphans = loose.filter(
    (a) =>
      a.kind !== 'DOCUMENT' || a.conversationId !== null || !used.has(`${a.tenantId}|${a.sha256}`),
  );
  await deleteFiles(
    store,
    orphans.map((a) => a.objectKey),
    true,
  );
  await db.attachment.deleteMany({ where: { id: { in: orphans.map((a) => a.id) } } });

  // Карантина: INFECTED/FAILED — файлът е изтрит при сканирането, тук само за всеки случай.
  const quarantine = await db.attachment.findMany({
    where: {
      createdAt: { lt: new Date(now - (opts.quarantineDays ?? 7) * DAY) },
      scanStatus: { in: ['INFECTED', 'FAILED'] },
    },
    select: { id: true, objectKey: true },
  });
  await deleteFiles(
    store,
    quarantine.map((a) => a.objectKey),
    false,
  );
  await db.attachment.deleteMany({ where: { id: { in: quarantine.map((a) => a.id) } } });

  return {
    sessions: sessions.count,
    cases,
    caseFiles,
    orphans: orphans.length,
    quarantined: quarantine.length,
    messages,
    notifications: given(opts.notificationDays)
      ? await purgeNotifications(db, opts.notificationDays, nowDate)
      : null,
    presence: given(opts.presenceDays) ? await purgePresence(db, opts.presenceDays, nowDate) : null,
    metadata: given(opts.metadataDays)
      ? await purgeMetadata(db, store, opts.metadataDays, nowDate)
      : null,
    proposals: given(opts.proposalDays)
      ? await purgeProposals(db, opts.proposalDays, nowDate)
      : null,
    audit: given(opts.auditDays)
      ? await pruneAudit(db, {
          cutoff: new Date(now - opts.auditDays * DAY),
          archiveDir: opts.auditArchiveDir || null,
        })
      : null,
  };
}
