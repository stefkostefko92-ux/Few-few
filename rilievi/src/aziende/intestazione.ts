import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import type { ModelloId } from '../cartelli/modelli.js';
import type { AziendaCartello } from '../cartelli/pdf.js';
import { prisma } from '../db.js';
import type { SessionUser } from '../types.js';
import { intestazioneDi, type DatiSocietari } from './dati.js';
import { aziendaLogo } from './service.js';

/**
 * Записът от настройките на фирмата за табелата „Avviso di fermo impianto“: данните ѝ (главата на
 * табелата) и избраният шаблон. Пише администраторът ѝ или MASTER (`aziende:settings`, проверено в
 * маршрута); одитът е в същата транзакция и не носи самите данни. false — фирмата я няма.
 */

export async function setDatiSocietari(
  actor: SessionUser,
  aziendaId: string,
  dati: DatiSocietari,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.azienda.updateMany({
      where: { id: aziendaId },
      data: { datiSocietari: dati satisfies Prisma.InputJsonObject },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_DATI',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
      },
      tx,
    );
    return true;
  });
}

export async function setCartelloModello(
  actor: SessionUser,
  aziendaId: string,
  modello: ModelloId,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.azienda.updateMany({
      where: { id: aziendaId },
      data: { cartelloModello: modello },
    });
    if (updated.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'AZIENDA_CARTELLO',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { modello },
      },
      tx,
    );
    return true;
  });
}

/** Главата на табелата — логото и данните на фирмата, както са сега (за PDF-а и за картинката му). */
export async function testataDi(azienda: {
  id: string;
  name: string;
  logoType: string | null;
  datiSocietari: unknown;
}): Promise<AziendaCartello> {
  const logo = azienda.logoType ? await aziendaLogo(azienda.id) : null;
  return {
    intestazione: intestazioneDi(azienda.name, azienda.datiSocietari),
    logo: logo?.data ?? null,
  };
}
