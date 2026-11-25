import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import type { SessionUser } from '../types.js';
import type { DatiViolazione } from './violazioni-form.js';

/**
 * Регистърът на нарушенията на сигурността на личните данни (чл. 33(5) GDPR; собственикът, 12 ноември
 * 2026 — точка A6): всяко нарушение се записва, и неуведоменото. Пише само MASTER; редове не се трият
 * (доказателство пред надзорния орган). Одитът — без текста, само кой и кой ред.
 */
export function elencoViolazioni() {
  return prisma.violazione.findMany({
    orderBy: { rilevataAt: 'desc' },
    select: {
      id: true,
      rilevataAt: true,
      titolo: true,
      ruolo: true,
      rischio: true,
      titolariAvvisatiAt: true,
      autoritaNotificataAt: true,
      interessatiAvvisatiAt: true,
      chiusaAt: true,
    },
  });
}

export function leggiViolazioneSalvata(id: string) {
  return prisma.violazione.findUnique({
    where: { id },
    include: { autore: { select: { name: true } } },
  });
}

export async function creaViolazione(autore: SessionUser, dati: DatiViolazione): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const riga = await tx.violazione.create({
      data: { ...dati, autoreId: autore.id },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId: autore.id,
        action: 'VIOLAZIONE_CREATE',
        aziendaId: null,
        targetType: 'violazione',
        targetId: riga.id,
        meta: { rischio: dati.rischio, ruolo: dati.ruolo },
      },
      tx,
    );
    return riga.id;
  });
}

/** Записва новото състояние на реда; false — няма такъв. */
export async function aggiornaViolazione(
  autore: SessionUser,
  id: string,
  dati: DatiViolazione,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.violazione.updateMany({ where: { id }, data: dati });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId: autore.id,
        action: 'VIOLAZIONE_UPDATE',
        aziendaId: null,
        targetType: 'violazione',
        targetId: id,
        meta: { rischio: dati.rischio, chiusa: dati.chiusaAt !== null },
      },
      tx,
    );
    return true;
  });
}
