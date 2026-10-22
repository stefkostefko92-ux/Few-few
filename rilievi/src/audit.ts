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
  'USER_EDIT',
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
  'ALLEGATO_UPLOAD',
  'ALLEGATO_UPDATE',
  'ALLEGATO_DELETE',
  'AZIENDA_CREATE',
  'AZIENDA_UPDATE',
  'AZIENDA_LOGO',
  'AZIENDA_DEACTIVATE',
  'AZIENDA_REACTIVATE',
  'AZIENDA_SEZIONI',
  'AZIENDA_SCHIZZI_ON',
  'AZIENDA_SCHIZZI_OFF',
  // Старите записи от времето с една фирма на човек — само за показ, нови не се пишат.
  'USER_AZIENDA',
  'MEMBERSHIP_ADD',
  'MEMBERSHIP_REMOVE',
  'ACCESS_REQUEST',
  'ACCESS_REQUEST_UPDATE',
  'ACCESS_REQUEST_ACCEPT',
  'ACCESS_REQUEST_REJECT',
  'ACCESS_REQUEST_DELETE',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  /**
   * Фирмата, за която е събитието — нейният администратор вижда само тези записи. null (или липса)
   * — събитие на самия портал, видимо само за MASTER.
   */
  aziendaId: string | null;
  targetType?: 'user' | 'invite' | 'scheda' | 'azienda' | 'request';
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
      aziendaId: entry.aziendaId,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ...(entry.meta ? { meta: entry.meta } : {}),
    },
  });
}

/**
 * Събитие за човек (вход, парола, достъп, данни на акаунта): по един запис за всяка негова фирма —
 * администраторът на всяка вижда своето. Човек без фирма (MASTER) — запис на портала.
 */
export async function writeUserAudit(
  entry: Omit<AuditEntry, 'aziendaId'>,
  userId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const rows = await db.membership.findMany({ where: { userId }, select: { aziendaId: true } });
  const aziende = rows.length > 0 ? rows.map((row) => row.aziendaId) : [null];
  for (const aziendaId of aziende) await writeAudit({ ...entry, aziendaId }, db);
}
