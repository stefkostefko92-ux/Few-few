import type { Prisma } from '@prisma/client';
import { auditHmac } from './auth/keys.js';
import { GENESIS, sha256 } from './ledger/chain.js';

/** Ключът на заключването, което подрежда записите на одита (един писател наведнъж). */
const AUDIT_LOCK = 4_340_001;

export interface AuditInput {
  actorId: string | null;
  organizationId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Без лични данни: идентификатори, кодове, суми — не имена, имейли, адреси. */
  details?: Record<string, string | number | boolean | null | string[]>;
}

/**
 * Записва в одита като звено от веригата: хешът е върху предишния хеш + съдържанието, а HMAC-ът с ключ
 * само на сървъра прави пренаписването видимо. Вика се ВЪТРЕ в транзакцията на действието — ако то се
 * провали, и записът изчезва.
 */
export async function audit(db: Prisma.TransactionClient, entry: AuditInput): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`;
  const last = await db.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
  const prevHash = last?.hash ?? GENESIS;
  const at = new Date();
  const body = JSON.stringify({
    at: at.toISOString(),
    actorId: entry.actorId,
    organizationId: entry.organizationId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    details: entry.details ?? null,
  });
  const hash = auditHmac(sha256(`${prevHash}\n${body}`));
  await db.auditLog.create({
    data: {
      at,
      actorId: entry.actorId,
      organizationId: entry.organizationId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      details: entry.details ?? undefined,
      prevHash,
      hash,
    },
  });
}
