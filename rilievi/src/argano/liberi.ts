import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { datiSalvati, type DatiArgano } from './dati.js';
import { searchTextImpianto, type ImpiantoLibero } from './impianto.js';

/**
 * Изчислението за аргано без карта (собственикът, 31 октомври 2026 — „calcolo libero“): уредбата
 * (адрес, матрикула, номер) е в самото изчисление, фирмата — избраната при създаването. Четене в
 * обхвата на човека (чуждо — null, маршрутът дава 404), запис върху отворената версия (`base`),
 * окончателно изтриване; всичко с одит. Кой пише и кой трие във фирмата — решава маршрутът.
 */

const ID = /^[a-z0-9]{20,40}$/;

export interface CalcoloLibero {
  id: string;
  aziendaId: string;
  aziendaName: string;
  impianto: ImpiantoLibero;
  dati: DatiArgano | null;
  updatedAt: Date;
  autore: string | null;
}

/** Изчислението без карта от адреса — в обхвата (`schede:read`); на карта или чуждо — null. */
export async function leggiLibero(scope: Scope, id: unknown): Promise<CalcoloLibero | null> {
  if (typeof id !== 'string' || !ID.test(id)) return null;
  const row = await prisma.calcoloArgano.findFirst({
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

/** Новото изчисление без карта; връща id-то му. */
export async function creaLibero(
  aziendaId: string,
  impianto: ImpiantoLibero,
  dati: DatiArgano,
  actorId: string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const created = await tx.calcoloArgano.create({
      data: {
        aziendaId,
        ...colonne(impianto),
        dati: dati as unknown as Prisma.InputJsonObject,
        updatedById: actorId,
      },
      select: { id: true },
    });
    await writeAudit(
      { actorId, action: 'ARGANO_CALCOLO', aziendaId, targetType: 'calcolo', targetId: created.id },
      tx,
    );
    return created.id;
  });
}

/** Записът върху отворената версия: друг е записал междувременно — 'conflict'; изтрито — 'missing'. */
export async function salvaLibero(
  calcolo: { id: string; aziendaId: string },
  base: string,
  impianto: ImpiantoLibero,
  dati: DatiArgano,
  actorId: string,
): Promise<'ok' | 'conflict' | 'missing'> {
  const versione = new Date(base);
  if (Number.isNaN(versione.getTime())) return 'conflict';
  return prisma.$transaction(async (tx) => {
    const where = { id: calcolo.id, aziendaId: calcolo.aziendaId, schedaId: null };
    const updated = await tx.calcoloArgano.updateMany({
      where: { ...where, updatedAt: versione },
      data: {
        ...colonne(impianto),
        dati: dati as unknown as Prisma.InputJsonObject,
        updatedById: actorId,
      },
    });
    if (updated.count === 0) {
      const esiste = await tx.calcoloArgano.count({ where });
      return esiste > 0 ? 'conflict' : 'missing';
    }
    await writeAudit(
      {
        actorId,
        action: 'ARGANO_CALCOLO',
        aziendaId: calcolo.aziendaId,
        targetType: 'calcolo',
        targetId: calcolo.id,
      },
      tx,
    );
    return 'ok';
  });
}

/** Окончателно изтриване на изчисление без карта; одитът остава (без адреса). */
export async function eliminaLibero(
  calcolo: { id: string; aziendaId: string },
  actorId: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.calcoloArgano.deleteMany({
      where: { id: calcolo.id, aziendaId: calcolo.aziendaId, schedaId: null },
    });
    if (deleted.count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'ARGANO_CALCOLO_DELETE',
        aziendaId: calcolo.aziendaId,
        targetType: 'calcolo',
        targetId: calcolo.id,
      },
      tx,
    );
    return true;
  });
}
