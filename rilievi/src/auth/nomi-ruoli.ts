import { Prisma, type Role } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import type { SessionUser } from '../types.js';
import { nomiSalvati, type NomiRuoli } from './permessi.js';

/**
 * Имената на ролите в изгледите: `ruolo(роля, фирма)` — името, записано от фирмата, иначе това от
 * речника (`role.<РОЛЯ>`). Имената на фирмите на човека идват със сесията; MASTER вижда всички фирми,
 * затова за него се четат само фирмите със свои имена (обикновено малко).
 */

export type NomeRuolo = (role: Role, aziendaId?: string | null) => string;

/** Името на ролята във фирмата — от записаните имена или от речника. */
export function nomeRuolo(
  t: (key: string) => string,
  nomi: ReadonlyMap<string, NomiRuoli>,
): NomeRuolo {
  return (role, aziendaId) => {
    const proprio = role !== 'MASTER' && aziendaId ? nomi.get(aziendaId)?.[role] : undefined;
    return proprio ?? t(`role.${role}`);
  };
}

/** Имената, записани от фирмите (само тези, които са ги сменили). */
export async function nomiDelleAziende(ids?: readonly string[]): Promise<Map<string, NomiRuoli>> {
  const rows = await prisma.azienda.findMany({
    where: {
      nomiRuoli: { not: Prisma.DbNull },
      ...(ids ? { id: { in: [...ids] } } : {}),
    },
    select: { id: true, nomiRuoli: true },
  });
  return new Map(rows.map((row) => [row.id, nomiSalvati(row.nomiRuoli)]));
}

/** Имената от сесията — фирмите на човека (за MASTER — никоя). */
export const nomiDellaSessione = (user: SessionUser | null): Map<string, NomiRuoli> =>
  new Map((user?.memberships ?? []).map((m) => [m.aziendaId, m.nomiRuoli ?? {}]));

/**
 * За MASTER — имената на всички фирми, които са ги сменили (`res.locals.ruolo` от сесията вече е
 * сложен в server.ts); грешка в базата — имената от речника, страницата се показва.
 */
export async function ruoliLocals(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.principal?.user.master) {
    try {
      res.locals.ruolo = nomeRuolo(res.locals.t, await nomiDelleAziende());
    } catch (error) {
      logger.warn({ err: errorMessage(error) }, 'имената на ролите не се прочетоха');
    }
  }
  next();
}
