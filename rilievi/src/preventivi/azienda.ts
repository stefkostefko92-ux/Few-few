import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { textParser } from '../schede/field-parsers.js';
import type { SessionUser } from '../types.js';

/**
 * Офертите на ниво фирма (C1, собственикът: „disattivato di default e attivabile dalle impostazioni
 * master“): включва и изключва ги САМО MASTER (страницата на фирмата). Нищо не се трие: включени наново,
 * офертите, клиентите и ценоразписът са там; износът ги носи винаги. Изключени на фирма, която вече има
 * данни в тях — архив (`preventiviArchivio`): хората с правата ги четат и трият, но не пишат (`scope.ts`;
 * собственикът, 14 ноември 2026 — правата по чл. 15–17 GDPR не спират с функцията); без данни — никой не ги
 * вижда. Условията по подразбиране на новата оферта — от настройките на фирмата (ADMIN), до 2000 знака.
 * Одитът — без текста.
 */

export const MAX_CONDIZIONI = 2000;
export const condizioniSchema = textParser({ kind: 'textarea', maxLength: MAX_CONDIZIONI });

/** false — фирмата я няма. */
export async function setPreventiviAttivi(
  actor: SessionUser,
  aziendaId: string,
  attivi: boolean,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Редът на фирмата — заключен: оферта или клиент не се появяват между проверката и записа.
    const riga = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Azienda" WHERE "id" = ${aziendaId} FOR UPDATE`;
    if (riga.length === 0) return false;
    const archivio = !attivi && (await haDati(tx, aziendaId));
    await tx.azienda.update({
      where: { id: aziendaId },
      data: { preventiviAttivi: attivi, preventiviArchivio: archivio },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_PREVENTIVI',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: attivi ? { attivi } : { attivi, archivio },
      },
      tx,
    );
    return true;
  });
}

/** Фирмата има оферти, клиенти или ценоразпис — изключените оферти стават архив. */
async function haDati(tx: Prisma.TransactionClient, aziendaId: string): Promise<boolean> {
  const where = { aziendaId };
  const [preventivi, clienti, voci] = await Promise.all([
    tx.preventivo.count({ where, take: 1 }),
    tx.cliente.count({ where, take: 1 }),
    tx.voceListino.count({ where, take: 1 }),
  ]);
  return preventivi + clienti + voci > 0;
}

/** Условията по подразбиране (null — без); false — фирмата я няма. */
export async function setCondizioniPredefinite(
  actor: SessionUser,
  aziendaId: string,
  condizioni: string | null,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.azienda.updateMany({
      where: { id: aziendaId },
      data: { preventivoCondizioni: condizioni },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_PREVENTIVI_CONDIZIONI',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { vuote: condizioni === null },
      },
      tx,
    );
    return true;
  });
}
