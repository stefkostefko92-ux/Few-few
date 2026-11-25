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

/**
 * Листовете се записват наново — точно каквото е във формата. Ред, който тази версия не може да прочете
 * (записан от по-нова — след връщане на кода назад), формата не го е показала и не го е пратила: той
 * остава, след пратените. Иначе първият запис би изтрил рисунката, която по-новата версия пак ще покаже.
 */
export async function salvaSchizzi(
  tx: Prisma.TransactionClient,
  schedaId: string,
  fogli: readonly Foglio[],
): Promise<void> {
  const rows = await tx.schizzo.findMany({
    where: { schedaId },
    orderBy: { ordine: 'asc' },
    select: { id: true, elementi: true },
  });
  const illeggibili = rows.filter((row) => foglioDa(row.elementi) === null).map((row) => row.id);
  await tx.schizzo.deleteMany({ where: { schedaId, id: { notIn: illeggibili } } });
  // Редът на листа е уникален в картата: нечетимите се отместват настрана, преди да дойдат пратените.
  for (const [i, id] of illeggibili.entries()) {
    await tx.schizzo.update({ where: { id }, data: { ordine: 100_000 + i } });
  }
  if (fogli.length > 0) {
    await tx.schizzo.createMany({
      data: fogli.map((foglio, ordine) => ({ schedaId, ordine, elementi: foglio })),
    });
  }
  for (const [i, id] of illeggibili.entries()) {
    await tx.schizzo.update({ where: { id }, data: { ordine: fogli.length + i } });
  }
  if (illeggibili.length > 0) {
    logger.warn(
      { scheda: schedaId, fogli: illeggibili.length },
      'нечетими листове на скицника — запазени',
    );
  }
}
