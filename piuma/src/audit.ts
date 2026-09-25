import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export type ActorType = 'HUMAN' | 'AGENT' | 'SYSTEM';

export interface AuditActor {
  type: ActorType;
  id: string | null;
  label: string;
  ip?: string | null;
}

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
}

/**
 * jsonb в PostgreSQL НЕ пази реда на ключовете — затова хешираме канонична форма
 * (ключове сортирани рекурсивно), еднаква при запис и при проверка.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256')
    .update(
      parts.map((part) => (part === null || part === undefined ? '' : String(part))).join('|'),
    )
    .digest('hex');
}

/**
 * Tamper-evident верига: hash = SHA-256(prevHash | at | actor | action | target | detail | ip).
 * Записите се пишат последователно в транзакция, за да е стабилен `prevHash`.
 */
export async function audit(actor: AuditActor, entry: AuditEntry): Promise<void> {
  const detailJson = entry.detail ? canonicalJson(entry.detail) : null;
  await prisma.$transaction(async (tx) => {
    // Един писач наведнъж: без ключалката два паралелни записа четат същия prevHash и веригата се разклонява.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7241001)`;
    const last = await tx.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const prevHash = last?.hash ?? '';
    const at = new Date();
    const hash = digest([
      prevHash,
      at.toISOString(),
      actor.type,
      actor.id,
      entry.action,
      entry.targetType,
      entry.targetId,
      detailJson,
      actor.ip,
    ]);
    await tx.auditLog.create({
      data: {
        at,
        actorType: actor.type,
        actorId: actor.id,
        actorLabel: actor.label,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        detail: detailJson ? (JSON.parse(detailJson) as Prisma.InputJsonValue) : undefined,
        ip: actor.ip ?? null,
        prevHash,
        hash,
      },
    });
  });
}

export async function verifyAuditChain(): Promise<{
  ok: boolean;
  brokenAt: number | null;
  count: number;
}> {
  const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  let prevHash = '';
  for (const row of rows) {
    const detailJson =
      row.detail === null || row.detail === undefined ? null : canonicalJson(row.detail);
    const expected = digest([
      prevHash,
      row.at.toISOString(),
      row.actorType,
      row.actorId,
      row.action,
      row.targetType,
      row.targetId,
      detailJson,
      row.ip,
    ]);
    if (row.prevHash !== prevHash || row.hash !== expected) {
      return { ok: false, brokenAt: row.id, count: rows.length };
    }
    prevHash = row.hash;
  }
  return { ok: true, brokenAt: null, count: rows.length };
}
