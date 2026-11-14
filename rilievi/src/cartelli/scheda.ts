import type { Scheda } from '@prisma/client';
import { aziendaWhere, schedaScope, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { listSchede, type SchedaRow } from '../schede/list.js';
import type { CartelloPrecedente } from './da-scheda.js';

/**
 * Табелата и картата на уредбата в базата: коя карта може да попълни табела (вижда я човекът, пише табели
 * в нейната фирма, не е в кошчето), търсенето ѝ от формата, последната табела на същата уредба (паметта
 * на поправеното) и табелите на картата за страницата ѝ. Обхватът идва от маршрута — тук не се решава.
 */

const ID = /^[a-z0-9]{20,40}$/;

/** Цялата карта (условията на полетата четат и други колони), или null — няма я, чужда е, в кошчето е. */
export function schedaPerCartello(scope: Scope, id: unknown): Promise<Scheda | null> {
  if (typeof id !== 'string' || !ID.test(id)) return Promise.resolve(null);
  return prisma.scheda.findFirst({ where: { id, deletedAt: null, ...schedaScope(scope) } });
}

/** Каквото човекът е писал на последната табела на уредбата — адрес, град, място. */
export function ultimoCartello(schedaId: string): Promise<CartelloPrecedente | null> {
  return prisma.cartello.findFirst({
    where: { schedaId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { indirizzo: true, citta: true, ubicazione: true },
  });
}

/** Най-много толкова карти под търсенето във формата — останалото се стеснява с още дума. */
export const MAX_RISULTATI = 8;

/** Търсенето на карта от формата на табелата — същата търсачка като в „Schede“ (матрикула, №, адрес…). */
export async function cercaSchede(
  scope: Scope,
  query: string,
): Promise<{ rows: SchedaRow[]; total: number; tokens: string[] }> {
  const page = await listSchede({ scope, query });
  return { rows: page.rows.slice(0, MAX_RISULTATI), total: page.total, tokens: page.tokens };
}

/** Табелите на картата (най-новите отгоре) в обхвата на човека — за страницата на картата. */
export function cartelliDellaScheda(scope: Scope, schedaId: string) {
  return prisma.cartello.findMany({
    where: { schedaId, ...aziendaWhere(scope) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, data: true, ubicazione: true },
    take: 20,
  });
}
