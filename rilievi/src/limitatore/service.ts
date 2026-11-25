import { Prisma } from '@prisma/client';
import { searchTextImpianto, type ImpiantoLibero } from '../argano/impianto.js';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import type { DatiLimitatore } from './calcolo.js';
import { datiSalvati } from './dati.js';

/**
 * Записаното изчисление за ограничителя — като изчислението за аргано (argano/service.ts и liberi.ts):
 * на карта (едно на карта; фирмата е на картата, а картата се търси пак в транзакцията — не в кошчето)
 * и без карта (уредбата е в самото изчисление, фирмата — избраната при създаването). Четене с недоверие
 * (`datiSalvati`), запис само върху отворената версия (`base` = updatedAt; празно — още няма), окончателно
 * изтриване на изчислението без карта; всичко с одит. Кой пише и кой трие — решава маршрутът.
 */

export interface CalcoloSalvato {
  dati: DatiLimitatore | null;
  updatedAt: Date;
  autore: string | null;
}

export type EsitoSalvataggio = 'ok' | 'conflict' | 'missing';

const json = (dati: DatiLimitatore) => dati as unknown as Prisma.InputJsonObject;

export async function leggiCalcolo(schedaId: string): Promise<CalcoloSalvato | null> {
  const row = await prisma.calcoloLimitatore.findUnique({
    where: { schedaId },
    select: { dati: true, updatedAt: true, updatedBy: { select: { name: true } } },
  });
  return row
    ? { dati: datiSalvati(row.dati), updatedAt: row.updatedAt, autore: row.updatedBy?.name ?? null }
    : null;
}

export async function salvaCalcolo(
  scheda: { id: string; aziendaId: string },
  base: string,
  dati: DatiLimitatore,
  actorId: string,
): Promise<EsitoSalvataggio> {
  try {
    return await prisma.$transaction(async (tx) => {
      const viva = await tx.scheda.findFirst({
        where: { id: scheda.id, aziendaId: scheda.aziendaId, deletedAt: null },
        select: { id: true },
      });
      if (!viva) return 'missing';
      const current = await tx.calcoloLimitatore.findUnique({
        where: { schedaId: scheda.id },
        select: { updatedAt: true },
      });
      if (current) {
        if (base !== current.updatedAt.toISOString()) return 'conflict';
        const updated = await tx.calcoloLimitatore.updateMany({
          where: { schedaId: scheda.id, updatedAt: current.updatedAt },
          data: { dati: json(dati), updatedById: actorId },
        });
        if (updated.count === 0) return 'conflict';
      } else {
        if (base !== '') return 'conflict';
        await tx.calcoloLimitatore.create({
          data: {
            schedaId: scheda.id,
            aziendaId: scheda.aziendaId,
            dati: json(dati),
            updatedById: actorId,
          },
        });
      }
      await writeAudit(
        {
          actorId,
          action: 'LIMITATORE_CALCOLO',
          aziendaId: scheda.aziendaId,
          targetType: 'scheda',
          targetId: scheda.id,
        },
        tx,
      );
      return 'ok';
    });
  } catch (error) {
    // Двама записват първото изчисление едновременно (уникалната карта) — вторият е конфликт.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return 'conflict';
    throw error;
  }
}

const ID = /^[a-z0-9]{20,40}$/;

export interface CalcoloLibero {
  id: string;
  aziendaId: string;
  aziendaName: string;
  impianto: ImpiantoLibero;
  dati: DatiLimitatore | null;
  updatedAt: Date;
  autore: string | null;
}

/** Изчислението без карта от адреса — в обхвата (`schede:read`); на карта или чуждо — null. */
export async function leggiLibero(scope: Scope, id: unknown): Promise<CalcoloLibero | null> {
  if (typeof id !== 'string' || !ID.test(id)) return null;
  const row = await prisma.calcoloLimitatore.findFirst({
    where: { id, schedaId: null, ...aziendaWhere(scope) },
    select: {
      id: true,
      aziendaId: true,
      azienda: { select: { name: true } },
      indirizzo: true,
      matricola: true,
      numeroImpianto: true,
      dati: true,
      updatedAt: true,
      updatedBy: { select: { name: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    aziendaId: row.aziendaId,
    aziendaName: row.azienda.name,
    impianto: {
      indirizzo: row.indirizzo ?? '',
      matricola: row.matricola,
      numeroImpianto: row.numeroImpianto,
    },
    dati: datiSalvati(row.dati),
    updatedAt: row.updatedAt,
    autore: row.updatedBy?.name ?? null,
  };
}

const colonne = (impianto: ImpiantoLibero) => ({
  indirizzo: impianto.indirizzo,
  matricola: impianto.matricola,
  numeroImpianto: impianto.numeroImpianto,
  searchText: searchTextImpianto(impianto),
});

const auditCalcolo = (actorId: string, aziendaId: string, targetId: string) =>
  ({ actorId, action: 'LIMITATORE_CALCOLO', aziendaId, targetType: 'calcolo', targetId }) as const;

/** Новото изчисление без карта; връща id-то му. */
export async function creaLibero(
  aziendaId: string,
  impianto: ImpiantoLibero,
  dati: DatiLimitatore,
  actorId: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.calcoloLimitatore.create({
      data: { aziendaId, ...colonne(impianto), dati: json(dati), updatedById: actorId },
      select: { id: true },
    });
    await writeAudit(auditCalcolo(actorId, aziendaId, created.id), tx);
    return created.id;
  });
}

/** Записът върху отворената версия: друг е записал междувременно — 'conflict'; изтрито — 'missing'. */
export async function salvaLibero(
  calcolo: { id: string; aziendaId: string },
  base: string,
  impianto: ImpiantoLibero,
  dati: DatiLimitatore,
  actorId: string,
): Promise<EsitoSalvataggio> {
  const versione = new Date(base);
  if (Number.isNaN(versione.getTime())) return 'conflict';
  return prisma.$transaction(async (tx) => {
    const where = { id: calcolo.id, aziendaId: calcolo.aziendaId, schedaId: null };
    const updated = await tx.calcoloLimitatore.updateMany({
      where: { ...where, updatedAt: versione },
      data: { ...colonne(impianto), dati: json(dati), updatedById: actorId },
    });
    if (updated.count === 0) {
      const esiste = await tx.calcoloLimitatore.count({ where });
      return esiste > 0 ? 'conflict' : 'missing';
    }
    await writeAudit(auditCalcolo(actorId, calcolo.aziendaId, calcolo.id), tx);
    return 'ok';
  });
}

/** Окончателно изтриване на изчисление без карта; одитът остава (без адреса). */
export async function eliminaLibero(
  calcolo: { id: string; aziendaId: string },
  actorId: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.calcoloLimitatore.deleteMany({
      where: { id: calcolo.id, aziendaId: calcolo.aziendaId, schedaId: null },
    });
    if (deleted.count === 0) return false;
    await writeAudit(
      {
        ...auditCalcolo(actorId, calcolo.aziendaId, calcolo.id),
        action: 'LIMITATORE_CALCOLO_DELETE',
      },
      tx,
    );
    return true;
  });
}
