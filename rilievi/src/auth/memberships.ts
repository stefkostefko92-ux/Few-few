import type { Role } from '@prisma/client';
import type { MembershipView } from '../types.js';

/** Какво се чете от базата за членствата на човек — фирмата трябва и за името, и за това дали е активна. */
export const MEMBERSHIP_SELECT = {
  aziendaId: true,
  role: true,
  azienda: { select: { name: true, deactivatedAt: true } },
} as const;

interface MembershipRow {
  aziendaId: string;
  role: Role;
  azienda: { name: string; deactivatedAt: Date | null };
}

/**
 * Активните членства (деактивирана фирма спира само себе си — човекът продължава в другите си фирми),
 * подредени по името на фирмата.
 */
export function activeMemberships(rows: readonly MembershipRow[]): MembershipView[] {
  return rows
    .filter((row) => row.azienda.deactivatedAt === null)
    .map((row) => ({ aziendaId: row.aziendaId, aziendaName: row.azienda.name, role: row.role }))
    .sort((a, b) => a.aziendaName.localeCompare(b.aziendaName, 'it'));
}
