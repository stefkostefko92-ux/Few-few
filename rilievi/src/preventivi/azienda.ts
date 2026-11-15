import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { textParser } from '../schede/field-parsers.js';
import type { SessionUser } from '../types.js';

/**
 * Офертите на ниво фирма (C1, собственикът: „disattivato di default e attivabile dalle impostazioni
 * master“): включва и изключва ги САМО MASTER (страницата на фирмата). Изключени — никой във фирмата не ги
 * вижда (`scope.ts`), но нищо не се трие: включени наново, офертите и ценоразписът са там; износът ги носи
 * винаги. Условията по подразбиране на новата оферта — от настройките на фирмата (ADMIN), до 2000 знака.
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
    const updated = await tx.azienda.updateMany({
      where: { id: aziendaId },
      data: { preventiviAttivi: attivi },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_PREVENTIVI',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { attivi },
      },
      tx,
    );
    return true;
  });
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
