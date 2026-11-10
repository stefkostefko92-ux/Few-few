import type { Prisma, Role } from '@prisma/client';
import type { MembershipView } from '../types.js';
import { nomiSalvati, permessiSalvati } from './permessi.js';

/**
 * Какво се чете от базата за членствата на човек — фирмата трябва за името, за това дали е активна и за
 * правата и имената на ролите в нея.
 */
export const MEMBERSHIP_SELECT = {
  aziendaId: true,
  role: true,
  azienda: { select: { name: true, deactivatedAt: true, permessiRuoli: true, nomiRuoli: true } },
} as const;

interface MembershipRow {
  aziendaId: string;
  role: Role;
  azienda: {
    name: string;
    deactivatedAt: Date | null;
    permessiRuoli?: Prisma.JsonValue;
    nomiRuoli?: Prisma.JsonValue;
  };
}

/**
 * Активните членства (деактивирана фирма спира само себе си — човекът продължава в другите си фирми),
 * подредени по името на фирмата.
 */
export function activeMemberships(rows: readonly MembershipRow[]): MembershipView[] {
  return rows
    .filter((row) => row.azienda.deactivatedAt === null)
    .map((row) => ({
      aziendaId: row.aziendaId,
      aziendaName: row.azienda.name,
      role: row.role,
      permessi: permessiSalvati(row.azienda.permessiRuoli),
      nomiRuoli: nomiSalvati(row.azienda.nomiRuoli),
    }))
    .sort((a, b) => a.aziendaName.localeCompare(b.aziendaName, 'it'));
}
