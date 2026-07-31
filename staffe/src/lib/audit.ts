import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './db';

/**
 * Traccia di controllo. Registra chi ha fatto cosa, mai le credenziali.
 *
 * I campi sensibili vengono rimossi PRIMA della scrittura: un log di audit che
 * conserva password o token trasforma una lettura del database in una
 * compromissione totale.
 */
const CAMPI_VIETATI = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'token',
  'jti',
  'secret',
  'authSecret',
]);

export function sanitiseChanges(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value)) {
    return value.map((v) => sanitiseChanges(v)) as Prisma.InputJsonValue;
  }
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CAMPI_VIETATI.has(k)) {
        out[k] = '[rimosso]';
        continue;
      }
      out[k] =
        v instanceof Date
          ? v.toISOString()
          : typeof v === 'object' && v !== null
            ? sanitiseChanges(v)
            : ((v ?? null) as Prisma.InputJsonValue);
    }
    return out;
  }
  return value as Prisma.InputJsonValue;
}

export type AuditInput = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  changes?: unknown;
};

export async function audit(input: AuditInput): Promise<void> {
  // L'audit non deve mai far fallire l'operazione principale: si registra
  // l'errore e si prosegue.
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        changes: input.changes === undefined ? undefined : sanitiseChanges(input.changes),
      },
    });
  } catch (err) {
    console.error('[staffe] scrittura audit fallita:', err);
  }
}
