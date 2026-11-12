import type { Prisma, Role } from '@prisma/client';
import { GIORNI_PRIMA_DELL_ELIMINAZIONE } from '../aziende/cambio-tempi.js';
import { DAY } from '../time.js';
import type { MembershipView, SessionUser } from '../types.js';
import { nomiSalvati, permessiSalvati } from './permessi.js';

/**
 * Какво се чете от базата за членствата на човек — фирмата трябва за името, за това дали е активна и за
 * правата и имената на ролите в нея.
 */
export const MEMBERSHIP_SELECT = {
  aziendaId: true,
  role: true,
  azienda: {
    select: {
      name: true,
      deactivatedAt: true,
      permessiRuoli: true,
      nomiRuoli: true,
      condizioniVersione: true,
    },
  },
} as const;

interface MembershipRow {
  aziendaId: string;
  role: Role;
  azienda: {
    name: string;
    deactivatedAt: Date | null;
    permessiRuoli?: Prisma.JsonValue;
    nomiRuoli?: Prisma.JsonValue;
    condizioniVersione?: string | null;
  };
}

/**
 * Активните членства (деактивирана фирма спира само себе си — човекът продължава в другите си фирми),
 * подредени по името на фирмата. ADMIN на деактивирана фирма остава в нея с `soloEsportazione` до
 * изтриването ѝ (90 дни — чл. 17.3 на условията, чл. 25(2)(g) Data Act): само за да свали данните.
 */
export function activeMemberships(
  rows: readonly MembershipRow[],
  now: number = Date.now(),
): MembershipView[] {
  const finestra = GIORNI_PRIMA_DELL_ELIMINAZIONE * DAY;
  return rows
    .filter(
      (row) =>
        row.azienda.deactivatedAt === null ||
        (row.role === 'ADMIN' && now - row.azienda.deactivatedAt.getTime() <= finestra),
    )
    .map((row) => ({
      aziendaId: row.aziendaId,
      aziendaName: row.azienda.name,
      role: row.role,
      permessi: permessiSalvati(row.azienda.permessiRuoli),
      nomiRuoli: nomiSalvati(row.azienda.nomiRuoli),
      condizioniVersione: row.azienda.condizioniVersione ?? null,
      ...(row.azienda.deactivatedAt === null ? {} : { soloEsportazione: true as const }),
    }))
    .sort((a, b) => a.aziendaName.localeCompare(b.aziendaName, 'it'));
}

/** Всичките фирми на човека са свършили — порталът му показва само износа (auth/guards.ts). */
export function soloEsportazione(user: Pick<SessionUser, 'master' | 'memberships'>): boolean {
  return (
    !user.master &&
    user.memberships.length > 0 &&
    user.memberships.every((m) => m.soloEsportazione === true)
  );
}
