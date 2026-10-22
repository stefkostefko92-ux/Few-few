import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { foglioDa, type Foglio } from './model.js';

/**
 * Листовете на скицника. Четат ги маршрутите на вече взета в обхвата карта; пишат се само от записа на
 * картата (src/schede/service.ts), в нейната транзакция.
 */

/** Листовете на картата в реда им — проверени и при четене: ред, който не е лист, не се показва. */
export async function fogliDi(schedaId: string): Promise<Foglio[]> {
  const rows = await prisma.schizzo.findMany({
    where: { schedaId },
    orderBy: { ordine: 'asc' },
    select: { id: true, elementi: true },
  });
  return rows.flatMap((row) => {
    const foglio = foglioDa(row.elementi);
    if (!foglio) logger.warn({ schizzo: row.id }, 'лист от скицника не е във вида си — пропуснат');
    return foglio ? [foglio] : [];
  });
}

/** Листовете се записват наново — точно каквото е във формата, нищо старо не остава. */
export async function salvaSchizzi(
  tx: Prisma.TransactionClient,
  schedaId: string,
  fogli: readonly Foglio[],
): Promise<void> {
  await tx.schizzo.deleteMany({ where: { schedaId } });
  if (fogli.length > 0) {
    await tx.schizzo.createMany({
      data: fogli.map((foglio, ordine) => ({ schedaId, ordine, elementi: foglio })),
    });
  }
}
