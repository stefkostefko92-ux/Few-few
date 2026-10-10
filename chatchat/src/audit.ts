import { Prisma, type PrismaClient } from '@prisma/client';
import { sha256 } from './crypto.js';
import { auditPrevHash } from './db/discovery.js';

/**
 * Неизменим одит (§15.1, FR-12): всяко събитие носи хеша на предишното — подправка или изтрит
 * ред чупи веригата. Записът е под advisory lock, за да няма две събития с един и същ prevHash.
 * В detail НИКОГА съдържание на разговор, пароли или токени — само идентификатори и кодове.
 */

export interface AuditInput {
  tenantId: string | null;
  actorId: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  detail?: Record<string, unknown>;
}

export const GENESIS = '0'.repeat(64);

/** JSON с подредени ключове: jsonb в Postgres пренарежда ключовете, хешът не бива да зависи от това. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
export const AUDIT_LOCK = 4330_01;

/** Хешът на събитие — едно място за запис, проверка и ретенцията (контролните точки). */
export function eventHash(
  prevHash: string,
  e: {
    at: Date;
    action: string;
    tenantId: string | null;
    actorId: string | null;
    objectType: string | null;
    objectId: string | null;
    detail: unknown;
  },
): string {
  return sha256(
    [
      prevHash,
      e.at.toISOString(),
      e.action,
      e.tenantId ?? '',
      e.actorId ?? '',
      e.objectType ?? '',
      e.objectId ?? '',
      canonicalJson(e.detail ?? null),
    ].join('|'),
  );
}

type Tx = Prisma.TransactionClient;

export async function appendAudit(db: PrismaClient | Tx, input: AuditInput): Promise<void> {
  const write = async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
    // Веригата е ОБЩА за всички клиенти, а под RLS приложението вижда само своите събития —
    // предишният хеш идва от тясната функция (последното събитие или, след ретенция, котвата от
    // последната контролна точка; нищо → GENESIS). Само хеш, без съдържание.
    const prevHash = (await auditPrevHash(tx)) ?? GENESIS;
    const at = new Date();
    const detail = input.detail ?? null;
    const hash = eventHash(prevHash, {
      at,
      action: input.action,
      tenantId: input.tenantId,
      actorId: input.actorId,
      objectType: input.objectType ?? null,
      objectId: input.objectId ?? null,
      detail,
    });
    await tx.auditEvent.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: input.action,
        objectType: input.objectType ?? null,
        objectId: input.objectId ?? null,
        detail: detail === null ? Prisma.JsonNull : (detail as Prisma.InputJsonValue),
        at,
        prevHash,
        hash,
      },
    });
  };
  if ('$transaction' in db) await db.$transaction(write);
  else await write(db);
}

/**
 * Проверка на веригата — за одитора и за теста. Връща id на първото счупено звено или null.
 * След ретенция (services/audit-retention.ts) най-старите събития ги няма: котвата е хешът на
 * последното изтрито, пазен в последната контролна точка (AuditCheckpoint) — веригата не е счупена.
 */
export async function verifyAuditChain(db: PrismaClient): Promise<number | null> {
  const rows = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
  const anchor = await db.auditCheckpoint.findFirst({ orderBy: { throughId: 'desc' } });
  let prev = anchor && (rows[0]?.id ?? Infinity) > anchor.throughId ? anchor.throughHash : GENESIS;
  for (const row of rows) {
    const expected = eventHash(prev, row);
    if (row.prevHash !== prev || row.hash !== expected) return row.id;
    prev = row.hash;
  }
  return null;
}
