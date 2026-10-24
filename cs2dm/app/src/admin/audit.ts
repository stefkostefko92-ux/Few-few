import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';

/**
 * Одитът на панела (CONTRACT.md §6): всяко писане от сайта → ред в `audit_log` със `source = WEB`.
 * `prev_hash`/`hash` ги смята тригерът в базата (миграцията `20261024120000_init`) — тук никога.
 * Записът е в СЪЩАТА транзакция като действието: няма действие без одит и одит без действие.
 */
export type AuditDb = Prisma.TransactionClient | PrismaClient;

export interface AuditEntry {
  actor: string;
  action: string;
  target?: string | null;
  details?: Record<string, unknown>;
}

export async function audit(db: AuditDb, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorSteamId: entry.actor,
      action: entry.action,
      targetSteamId: entry.target ?? null,
      details: (entry.details ?? {}) as Prisma.InputJsonObject,
      source: 'WEB',
    },
  });
}

const chainRow = z.object({
  id: z.bigint(),
  prevHash: z.string().nullable(),
  hash: z.string().nullable(),
  expected: z.string(),
});

export interface ChainCheck {
  ok: boolean;
  checked: number;
  /** Първият ред, където веригата не съвпада (подправен, изтрит или вмъкнат ред). */
  brokenAt: bigint | null;
}

const BATCH = 5000;

/**
 * Проверка на веригата в самата база: хешът се смята наново със СЪЩИЯ израз като тригера
 * (`details::text` е каноничният текст на jsonb — в JavaScript би се разминал), а връзката
 * prev_hash → hash на предишния ред — тук. Обхожда на партиди по id.
 */
export async function verifyAuditChain(db: PrismaClient): Promise<ChainCheck> {
  let afterId = 0n;
  let previous: string | null = null;
  let checked = 0;
  for (;;) {
    const raw = await db.$queryRaw<unknown[]>`
      SELECT id, prev_hash AS "prevHash", hash,
        encode(digest(
          coalesce(prev_hash, '') || '|' ||
          to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
          coalesce(actor_steam_id, '') || '|' ||
          action || '|' ||
          coalesce(target_steam_id, '') || '|' ||
          details::text || '|' ||
          source::text, 'sha256'), 'hex') AS expected
      FROM audit_log WHERE id > ${afterId} ORDER BY id ASC LIMIT ${BATCH}`;
    const rows = z.array(chainRow).parse(raw);
    for (const row of rows) {
      if (row.prevHash !== previous || row.hash !== row.expected) {
        return { ok: false, checked, brokenAt: row.id };
      }
      previous = row.hash;
      checked += 1;
    }
    if (rows.length < BATCH) return { ok: true, checked, brokenAt: null };
    afterId = rows[rows.length - 1]!.id;
  }
}
