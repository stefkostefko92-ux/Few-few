import type { Prisma } from '@prisma/client';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { pageOf } from '../schede/list.js';
import { queryTokens } from '../schede/search.js';

/**
 * Страницата „Calcolo argano“ (собственикът, 31 октомври 2026): записаните изчисления — на карта и без
 * карта — в обхвата на човека, най-новите отгоре; търсенето на изчисленията без карта (картите се търсят
 * с търсачката на „Schede“) и кои от намерените карти вече имат изчисление. Изчисление на карта в
 * кошчето не се показва.
 */

export const PAGINA = 25;
/** Най-много толкова изчисления без карта под търсенето — останалото се стеснява с още дума. */
export const MAX_LIBERI = 8;

export interface RigaCalcolo {
  id: string;
  href: string;
  conScheda: boolean;
  indirizzo: string | null;
  matricola: string | null;
  numeroImpianto: string | null;
  updatedAt: Date;
  autore: string | null;
  aziendaName: string;
}

const SELECT = {
  id: true,
  schedaId: true,
  indirizzo: true,
  matricola: true,
  numeroImpianto: true,
  updatedAt: true,
  updatedBy: { select: { name: true } },
  azienda: { select: { name: true } },
  scheda: { select: { indirizzo: true, matricola: true, numeroImpianto: true } },
} satisfies Prisma.CalcoloArganoSelect;

type Row = Prisma.CalcoloArganoGetPayload<{ select: typeof SELECT }>;

function riga(row: Row): RigaCalcolo {
  const fonte = row.scheda ?? row;
  return {
    id: row.id,
    href: row.schedaId ? `/schede/${row.schedaId}/calcolo-argano` : `/calcolo-argano/${row.id}`,
    conScheda: row.schedaId !== null,
    indirizzo: fonte.indirizzo,
    matricola: fonte.matricola,
    numeroImpianto: fonte.numeroImpianto,
    updatedAt: row.updatedAt,
    autore: row.updatedBy?.name ?? null,
    aziendaName: row.azienda.name,
  };
}

/** Видимо изчисление: без карта, или на карта извън кошчето. */
const VISIBILE: Prisma.CalcoloArganoWhereInput = {
  OR: [{ schedaId: null }, { scheda: { deletedAt: null } }],
};

/** Записаните изчисления, по страници. `azienda` — филтърът (фирма извън обхвата — празно). */
export async function elencoCalcoli(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
}): Promise<{ rows: RigaCalcolo[]; total: number; page: number; pages: number }> {
  const page = pageOf(options.page);
  const where = { ...aziendaWhere(options.scope, options.azienda), ...VISIBILE };
  const [total, rows] = await prisma.$transaction([
    prisma.calcoloArgano.count({ where }),
    prisma.calcoloArgano.findMany({
      where,
      select: SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGINA,
      take: PAGINA,
    }),
  ]);
  return { rows: rows.map(riga), total, page, pages: Math.max(1, Math.ceil(total / PAGINA)) };
}

/**
 * Изчисленията без карта, в които се намира всяка дума (адрес, матрикула, номер — нормализирани като в
 * картите). Думите са само букви и цифри (`queryTokens`), затова LIKE шаблонът няма специални знаци.
 */
export async function cercaLiberi(
  scope: Scope,
  query: string,
): Promise<{ rows: RigaCalcolo[]; total: number }> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { rows: [], total: 0 };
  const where: Prisma.CalcoloArganoWhereInput = {
    ...aziendaWhere(scope),
    schedaId: null,
    AND: tokens.map((token) => ({ searchText: { contains: token } })),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.calcoloArgano.count({ where }),
    prisma.calcoloArgano.findMany({
      where,
      select: SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: MAX_LIBERI,
    }),
  ]);
  return { rows: rows.map(riga), total };
}

/** Кои от картите вече имат изчисление и кога е записано. */
export async function calcoliDelleSchede(schedaIds: string[]): Promise<Map<string, Date>> {
  if (schedaIds.length === 0) return new Map();
  const rows = await prisma.calcoloArgano.findMany({
    where: { schedaId: { in: schedaIds } },
    select: { schedaId: true, updatedAt: true },
  });
  return new Map(rows.flatMap((r) => (r.schedaId ? [[r.schedaId, r.updatedAt] as const] : [])));
}
