import type { Prisma } from '@prisma/client';
import { prisma } from './db.js';

/**
 * Действията в одита. Пазят се знаци, не изречения — превеждат се при показване (`audit.action.<…>`).
 * Само добавяне: маршрут за промяна или изтриване на ред няма; чисти го единствено срокът (maintenance.ts).
 */
export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_LOCKED',
  'LOGOUT',
  'INVITE_CREATE',
  'INVITE_REVOKE',
  'INVITE_ACCEPT',
  'USER_ROLE',
  'USER_DEACTIVATE',
  'USER_REACTIVATE',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET_LINK',
  'PASSWORD_RESET',
  'OWNER_CREATE',
  'SCHEDA_CREATE',
  'SCHEDA_UPDATE',
  'SCHEDA_DELETE',
  'SCHEDA_RESTORE',
  'SCHEDA_PURGE',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  targetType?: 'user' | 'invite' | 'scheda';
  targetId?: string;
  /** Малки неличностни подробности (роля, брой). Никога пароли, токени, имейли или текст от схема. */
  meta?: Prisma.InputJsonObject;
}

/** `db` — транзакцията на действието: записът и одитът му влизат заедно или никак. */
export async function writeAudit(
  entry: AuditEntry,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ...(entry.meta ? { meta: entry.meta } : {}),
    },
  });
}
