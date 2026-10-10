import { Prisma, type PrismaClient } from '@prisma/client';
import { sha256 } from './crypto.js';

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

const GENESIS = '0'.repeat(64);

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
const AUDIT_LOCK = 4330_01;

type Tx = Prisma.TransactionClient;

export async function appendAudit(db: PrismaClient | Tx, input: AuditInput): Promise<void> {
  const write = async (tx: Tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
    const last = await tx.auditEvent.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? GENESIS;
    const at = new Date();
    const detail = input.detail ?? null;
    const hash = sha256(
      [
        prevHash,
        at.toISOString(),
        input.action,
        input.tenantId ?? '',
        input.actorId ?? '',
        input.objectType ?? '',
        input.objectId ?? '',
        canonicalJson(detail),
      ].join('|'),
    );
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

/** Проверка на веригата — за одитора и за теста. Връща id на първото счупено звено или null. */
export async function verifyAuditChain(db: PrismaClient): Promise<number | null> {
  const rows = await db.auditEvent.findMany({ orderBy: { id: 'asc' } });
  let prev = GENESIS;
  for (const row of rows) {
    const expected = sha256(
      [
        prev,
        row.at.toISOString(),
        row.action,
        row.tenantId ?? '',
        row.actorId ?? '',
        row.objectType ?? '',
        row.objectId ?? '',
        canonicalJson(row.detail ?? null),
      ].join('|'),
    );
    if (row.prevHash !== prev || row.hash !== expected) return row.id;
    prev = row.hash;
  }
  return null;
}
