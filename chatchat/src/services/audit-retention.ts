import type { AuditEvent, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { appendAudit, AUDIT_LOCK, canonicalJson, eventHash, GENESIS } from '../audit.js';

/**
 * Ретенцията на одита (NFR-08) БЕЗ да се чупи веригата. Решение: изтрива се само НАЙ-СТАРОТО
 * непрекъснато парче (префикс по id), и то след като:
 * 1. парчето е проверено (от предишната котва до последното изтрито) — счупена верига не се
 *    трие (доказателството за подправка остава);
 * 2. по желание е записан архив (JSONL, файл 600, sha256 в контролната точка) — офлайн проверим;
 * 3. е записана контролна точка (AuditCheckpoint): последното изтрито id + хешът му (котвата),
 *    предишната котва, брой, периодът, sha256 на архива;
 * 4. събитие `audit.checkpoint` с тези данни е добавено ВЪВ веригата (след триенето) — самата
 *    точка е свидетелствана от веригата.
 * Всичко е в една транзакция под заключването на одита: паралелен запис чака, не се разминава.
 * `verifyAuditChain` започва от котвата. Таван на изпълнение — останалото е за следващата нощ.
 */

const MAX_PER_RUN = 50_000;
const PAGE = 5_000;

export interface AuditPruneReport {
  deleted: number;
  checkpointId: number | null;
  archiveSha256: string | null;
}

export class AuditChainBroken extends Error {
  constructor(readonly eventId: number) {
    super(`Одитната верига е счупена при събитие ${eventId} — ретенцията на одита е спряна.`);
  }
}

const line = (e: AuditEvent) =>
  `${canonicalJson({
    id: e.id,
    tenantId: e.tenantId,
    actorId: e.actorId,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId,
    detail: e.detail,
    at: e.at.toISOString(),
    prevHash: e.prevHash,
    hash: e.hash,
  })}\n`;

export async function pruneAudit(
  db: PrismaClient,
  opts: { cutoff: Date; archiveDir: string | null },
): Promise<AuditPruneReport> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
      const old = await tx.auditEvent.findMany({
        where: { at: { lt: opts.cutoff } },
        orderBy: { id: 'asc' },
        take: MAX_PER_RUN,
        select: { id: true },
      });
      const through = old.at(-1);
      if (!through) return { deleted: 0, checkpointId: null, archiveSha256: null };
      const anchor = await tx.auditCheckpoint.findFirst({ orderBy: { throughId: 'desc' } });
      const fromHash = anchor?.throughHash ?? GENESIS;

      // Проверка + архив на парчето, на страници (без цялото в паметта).
      const archive = opts.archiveDir ? await openArchive(opts.archiveDir, through.id) : null;
      const digest = createHash('sha256');
      let prev = fromHash;
      let count = 0;
      let firstAt: Date | null = null;
      let lastAt: Date | null = null;
      let lastHash = fromHash;
      try {
        for (let after = 0; ;) {
          const rows = await tx.auditEvent.findMany({
            where: { id: { gt: after, lte: through.id } },
            orderBy: { id: 'asc' },
            take: PAGE,
          });
          if (rows.length === 0) break;
          for (const row of rows) {
            if (row.prevHash !== prev || row.hash !== eventHash(prev, row)) {
              throw new AuditChainBroken(row.id);
            }
            prev = row.hash;
            lastHash = row.hash;
            firstAt ??= row.at;
            lastAt = row.at;
            count += 1;
            if (archive) {
              const text = line(row);
              digest.update(text);
              await archive.handle.write(text);
            }
          }
          after = rows.at(-1)?.id ?? after;
        }
        if (archive) {
          await archive.handle.sync();
          await archive.handle.close();
        }
      } catch (err) {
        if (archive) {
          await archive.handle.close().catch(() => undefined);
          await rm(archive.path, { force: true });
        }
        throw err;
      }
      const archiveSha256 = archive ? digest.digest('hex') : null;
      const checkpoint = await tx.auditCheckpoint.create({
        data: {
          throughId: through.id,
          throughHash: lastHash,
          fromHash,
          count,
          firstAt: firstAt ?? opts.cutoff,
          lastAt: lastAt ?? opts.cutoff,
          archiveSha256,
        },
      });
      const deleted = await tx.auditEvent.deleteMany({ where: { id: { lte: through.id } } });
      await appendAudit(tx, {
        tenantId: null,
        actorId: null,
        action: 'audit.checkpoint',
        objectType: 'audit_checkpoint',
        objectId: String(checkpoint.id),
        detail: { throughId: through.id, throughHash: lastHash, fromHash, count, archiveSha256 },
      });
      return { deleted: deleted.count, checkpointId: checkpoint.id, archiveSha256 };
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 },
  );
}

async function openArchive(dir: string, throughId: number) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `audit-through-${throughId}-${Date.now()}.jsonl`);
  // wx: никога презаписване на съществуващ архив; 600 — само собственикът на процеса.
  const handle = await open(path, 'wx', 0o600);
  return { path, handle };
}
