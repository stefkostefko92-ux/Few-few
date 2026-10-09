import type { PrismaClient } from '@prisma/client';
import type { AttachmentStore } from '../storage/attachments.js';

/**
 * Ретенцията (GDPR чл. 5(1)(e)) като функция — CLI-то (`npm run retention`) я вика дневно,
 * тестовете — директно. Файловете се трият ПРЕДИ реда в базата: ред без файл е безвреден
 * (свалянето дава 404), файл без ред е забравен завинаги.
 */

export interface RetentionOptions {
  sessionDays: number;
  /** null → затворените случаи не се трият (решение на администратора на данните). */
  caseDays: number | null;
  now?: Date;
}

export interface RetentionReport {
  sessions: number;
  cases: number;
  caseFiles: number;
  orphans: number;
  quarantined: number;
}

const DAY = 24 * 3600 * 1000;
/** Качен, но непривързан файл (или PDF, който не е станал документ) живее до 24 ч. */
const ORPHAN_MS = DAY;
/** INFECTED/FAILED редовете остават 7 дни за проверка (файлът вече е изтрит). */
const QUARANTINE_MS = 7 * DAY;
const BATCH = 100;

async function deleteFiles(
  store: AttachmentStore | null,
  keys: readonly string[],
  required: boolean,
): Promise<void> {
  if (keys.length === 0) return;
  if (!store) {
    if (!required) return;
    // Fail-closed: без хранилище не трием редовете — иначе файловете остават без следа.
    throw new Error('ATTACHMENTS_DIR липсва — файловете не могат да се изтрият, редовете остават.');
  }
  for (const key of keys) await store.delete(key);
}

export async function runRetention(
  db: PrismaClient,
  store: AttachmentStore | null,
  opts: RetentionOptions,
): Promise<RetentionReport> {
  const now = (opts.now ?? new Date()).getTime();
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

  // Сираци: снимка/лог, които не са стигнали до съобщение; PDF, от който не е станал документ
  // (документът пази sha256 на оригинала като checksum — по него се познава).
  const orphanBefore = new Date(now - ORPHAN_MS);
  const loose = await db.attachment.findMany({
    where: {
      createdAt: { lt: orphanBefore },
      scanStatus: { in: ['PENDING', 'CLEAN'] },
      caseMessageId: null,
      conversationMessageId: null,
    },
    select: { id: true, tenantId: true, kind: true, sha256: true, objectKey: true },
  });
  const pdfs = loose.filter((a) => a.kind === 'DOCUMENT');
  const used = new Set(
    (
      await db.document.findMany({
        where: { checksum: { in: pdfs.map((a) => a.sha256) } },
        select: { tenantId: true, checksum: true },
      })
    ).map((d) => `${d.tenantId}|${d.checksum}`),
  );
  const orphans = loose.filter(
    (a) => a.kind !== 'DOCUMENT' || !used.has(`${a.tenantId}|${a.sha256}`),
  );
  await deleteFiles(
    store,
    orphans.map((a) => a.objectKey),
    true,
  );
  await db.attachment.deleteMany({ where: { id: { in: orphans.map((a) => a.id) } } });

  // Карантина: INFECTED/FAILED след 7 дни — файлът е изтрит при сканирането, тук само за всеки случай.
  const quarantine = await db.attachment.findMany({
    where: {
      createdAt: { lt: new Date(now - QUARANTINE_MS) },
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
  };
}
