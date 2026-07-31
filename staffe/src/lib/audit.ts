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

/**
 * Conservazione della traccia di controllo, in giorni.
 *
 * La traccia serve alla sicurezza, non è un archivio perpetuo: contiene chi ha
 * fatto cosa e quando, cioè dati sull'attività di persone identificate. Tenerla
 * per sempre viola il principio di limitazione della conservazione
 * (art. 5(1)(e) GDPR) e nessun documento la salva se il codice non la cancella
 * mai. Il valore è la scelta del titolare del trattamento: qui c'è un predefinito
 * ragionevole, sovrascrivibile da `AUDIT_RETENTION_GIORNI`.
 *
 * ATTENZIONE — questo NON tocca i documenti gestionali (ordini, movimenti,
 * ricevimenti): quelli hanno un obbligo di conservazione civilistico di dieci
 * anni (art. 2220 c.c.) e vivono nelle proprie tabelle.
 */
export const AUDIT_RETENTION_GIORNI_DEFAULT = 730; // due anni

export function retentionGiorni(): number {
  const raw = Number.parseInt(process.env.AUDIT_RETENTION_GIORNI ?? '', 10);
  // Un valore assurdo (zero, negativo, non numerico) non deve cancellare tutto:
  // si ricade sul predefinito, con un minimo di 30 giorni.
  if (!Number.isFinite(raw) || raw < 30) return AUDIT_RETENTION_GIORNI_DEFAULT;
  return raw;
}

/** Elimina le righe di audit più vecchie della soglia. Restituisce quante. */
export async function pruneAuditLog(giorni = retentionGiorni()): Promise<number> {
  const limite = new Date(Date.now() - giorni * 86_400_000);
  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: limite } },
  });
  return count;
}
