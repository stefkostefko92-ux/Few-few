import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { chiaveSigillo, firmeGiaUsate, LOCK_FIRME } from '../interventi/conferma.js';
import { colonneDi, datiDi } from './dati.js';
import { chiuso } from './elenco.js';
import { pianoFirme, sigilloFirma, type ErroreFirma, type NuovaFirma } from './firme.js';
import type { BuonoData, FirmeRichieste } from './form.js';

/**
 * „Buono di lavoro“ в базата. Листът се пише само върху отворената версия (`base` = updatedAt) и само
 * докато няма подпис долу (тогава е „chiuso“ — за промяна подписите долу се махат първо, на страницата на
 * листа). Подписите по редовете и проверките влизат и излизат със записа; тези долу — със своя форма.
 * Двата пътя местят `updatedAt` с условие върху него — разминаващите се записи стават 409. Новите подписи
 * се проверяват срещу всички документи на портала под общото заключване (`LOCK_FIRME`). Одитът — в същата
 * транзакция, без съдържанието и без щрихите.
 */

export type EsitoBuono =
  | { esito: 'ok'; id: string }
  | { esito: 'conflict' | 'chiuso' | 'missing' | 'scheda' }
  | { esito: 'firme'; errori: Record<string, ErroreFirma | 'ripetuta'> };

/** Новите подписи: копираните отникъде (всеки документ на портала) се отказват; иначе — с печата. */
async function scriviFirme(
  tx: Prisma.TransactionClient,
  buonoId: string,
  piano: { togli: string[]; aggiungi: NuovaFirma[] },
  actorId: string,
): Promise<Record<string, 'ripetuta'> | null> {
  if (piano.aggiungi.length > 0) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_FIRME})`;
    const usate = await firmeGiaUsate(
      tx,
      piano.aggiungi.map((f) => f.hash),
    );
    const ripetute = piano.aggiungi.filter((f) => usate.has(f.hash));
    if (ripetute.length > 0)
      return Object.fromEntries(ripetute.map((f) => [f.posto, 'ripetuta' as const]));
  }
  if (piano.togli.length > 0)
    await tx.buonoFirma.deleteMany({ where: { buonoId, posto: { in: piano.togli } } });
  if (piano.aggiungi.length > 0) {
    const firmatoAt = new Date();
    const key = chiaveSigillo();
    await tx.buonoFirma.createMany({
      data: piano.aggiungi.map((f) => {
        const base = {
          buonoId,
          posto: f.posto,
          hash: f.hash,
          impronta: f.impronta,
          firmatoAt,
          firmatoDaId: actorId,
        };
        return {
          ...base,
          tratti: f.firma as unknown as Prisma.InputJsonObject,
          sigillo: sigilloFirma(key, base),
        };
      }),
    });
  }
  return null;
}

/** Грешка в средата на транзакцията — всичко се връща, отговорът казва защо. */
class Annulla extends Error {
  constructor(readonly risultato: EsitoBuono) {
    super('buono');
  }
}

async function inTransazione(fn: (tx: Prisma.TransactionClient) => Promise<EsitoBuono>) {
  try {
    return await prisma.$transaction(fn);
  } catch (error) {
    if (error instanceof Annulla) return error.risultato;
    throw error;
  }
}

/**
 * Нов лист; `schedaId` — картата, от която е попълнен (маршрутът я е проверил в обхвата), тук се проверява
 * пак в транзакцията. Подписите по редовете може да дойдат още с първия запис.
 */
export function createBuono(options: {
  data: BuonoData;
  firme: FirmeRichieste;
  actorId: string;
  aziendaId: string;
  schedaId: string | null;
}): Promise<EsitoBuono> {
  const { data, actorId, aziendaId, schedaId } = options;
  const piano = pianoFirme({
    ambito: 'lavoro',
    salvate: [],
    data,
    nuove: options.firme.nuove,
    togli: new Set(),
  });
  if (!piano.ok) return Promise.resolve({ esito: 'firme', errori: piano.errori });
  return inTransazione(async (tx) => {
    if (schedaId) {
      const scheda = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Scheda"
        WHERE "id" = ${schedaId} AND "aziendaId" = ${aziendaId} AND "deletedAt" IS NULL
        FOR SHARE`;
      if (scheda.length === 0) return { esito: 'scheda' };
    }
    const row = await tx.buonoLavoro.create({
      data: { ...colonneDi(data), aziendaId, schedaId, createdById: actorId, updatedById: actorId },
      select: { id: true },
    });
    const ripetute = await scriviFirme(tx, row.id, piano, actorId);
    if (ripetute) throw new Annulla({ esito: 'firme', errori: ripetute });
    await writeAudit(
      {
        actorId,
        action: 'BUONO_CREATE',
        aziendaId,
        targetType: 'buono',
        targetId: row.id,
        meta: { firme: piano.aggiungi.length },
      },
      tx,
    );
    return { esito: 'ok', id: row.id };
  });
}

/** Записът от формата: съдържанието и подписите по редовете и проверките. */
export function updateBuono(options: {
  scope: Scope;
  id: string;
  base: string;
  data: BuonoData;
  firme: FirmeRichieste;
  actorId: string;
}): Promise<EsitoBuono> {
  const { scope, id, data, actorId } = options;
  const baseDate = new Date(options.base);
  return inTransazione(async (tx) => {
    const current = await tx.buonoLavoro.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: {
        aziendaId: true,
        updatedAt: true,
        firme: { select: { posto: true, hash: true, impronta: true } },
      },
    });
    if (!current) return { esito: 'missing' };
    if (chiuso(current)) return { esito: 'chiuso' };
    if (Number.isNaN(baseDate.getTime()) || current.updatedAt.getTime() !== baseDate.getTime())
      return { esito: 'conflict' };
    const piano = pianoFirme({
      ambito: 'lavoro',
      salvate: current.firme,
      data,
      nuove: options.firme.nuove,
      togli: options.firme.togli,
    });
    if (!piano.ok) return { esito: 'firme', errori: piano.errori };
    const updated = await tx.buonoLavoro.updateMany({
      where: { id, aziendaId: current.aziendaId, updatedAt: baseDate },
      data: { ...colonneDi(data), updatedById: actorId },
    });
    if (updated.count === 0) return { esito: 'conflict' };
    const ripetute = await scriviFirme(tx, id, piano, actorId);
    if (ripetute) throw new Annulla({ esito: 'firme', errori: ripetute });
    await writeAudit(
      {
        actorId,
        action: 'BUONO_UPDATE',
        aziendaId: current.aziendaId,
        targetType: 'buono',
        targetId: id,
        meta: { firmeAggiunte: piano.aggiungi.length, firmeTolte: piano.togli.length },
      },
      tx,
    );
    return { esito: 'ok', id };
  });
}

/** Подписите долу (страницата на листа): върху записания лист, който страницата е показала. */
export function firmeFinali(options: {
  scope: Scope;
  id: string;
  base: string;
  firme: FirmeRichieste;
  actorId: string;
}): Promise<EsitoBuono> {
  const { scope, id, actorId } = options;
  const baseDate = new Date(options.base);
  return inTransazione(async (tx) => {
    const current = await tx.buonoLavoro.findFirst({
      where: { id, ...aziendaWhere(scope) },
      include: { firme: { select: { posto: true, hash: true, impronta: true } } },
    });
    if (!current) return { esito: 'missing' };
    if (Number.isNaN(baseDate.getTime()) || current.updatedAt.getTime() !== baseDate.getTime())
      return { esito: 'conflict' };
    const piano = pianoFirme({
      ambito: 'finali',
      salvate: current.firme,
      data: datiDi(current),
      nuove: options.firme.nuove,
      togli: options.firme.togli,
    });
    if (!piano.ok) return { esito: 'firme', errori: piano.errori };
    if (piano.aggiungi.length === 0 && piano.togli.length === 0) return { esito: 'ok', id };
    const updated = await tx.buonoLavoro.updateMany({
      where: { id, aziendaId: current.aziendaId, updatedAt: baseDate },
      data: { updatedById: actorId },
    });
    if (updated.count === 0) return { esito: 'conflict' };
    const ripetute = await scriviFirme(tx, id, piano, actorId);
    if (ripetute) throw new Annulla({ esito: 'firme', errori: ripetute });
    await writeAudit(
      {
        actorId,
        action: 'BUONO_FIRME',
        aziendaId: current.aziendaId,
        targetType: 'buono',
        targetId: id,
        meta: { aggiunte: piano.aggiungi.length, tolte: piano.togli.length },
      },
      tx,
    );
    return { esito: 'ok', id };
  });
}

/** Изтриване — само на лист без нито един подпис (подписаното е доказателство: подписите се махат първо). */
export async function eliminaBuono(
  scope: Scope,
  id: string,
  actorId: string,
): Promise<'ok' | 'firmato' | 'missing'> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ aziendaId: string }>>`
      SELECT "aziendaId" FROM "BuonoLavoro" WHERE "id" = ${id} FOR UPDATE`;
    const row = rows[0];
    const where = aziendaWhere(scope).aziendaId;
    const inScope =
      row &&
      (where === undefined ||
        (typeof where === 'string' ? where === row.aziendaId : where.in.includes(row.aziendaId)));
    if (!row || !inScope) return 'missing';
    if ((await tx.buonoFirma.count({ where: { buonoId: id } })) > 0) return 'firmato';
    await tx.buonoLavoro.delete({ where: { id } });
    await writeAudit(
      {
        actorId,
        action: 'BUONO_DELETE',
        aziendaId: row.aziendaId,
        targetType: 'buono',
        targetId: id,
      },
      tx,
    );
    return 'ok';
  });
}

/** Писмото с PDF-а — в одита без адреса. */
export function registraInvioBuono(actorId: string, row: { id: string; aziendaId: string }) {
  return writeAudit({
    actorId,
    action: 'BUONO_EMAIL',
    aziendaId: row.aziendaId,
    targetType: 'buono',
    targetId: row.id,
  });
}
