import type { Prisma } from '@prisma/client';
import { MAX_LIBERI, PAGINA, type RigaCalcolo } from '../argano/elenco.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { pageOf } from '../schede/list.js';
import { queryTokens } from '../schede/search.js';

/**
 * Страницата „Calcolo limitatore“ — като „Calcolo argano“ (argano/elenco.ts): записаните изчисления (на
 * карта и без карта) в обхвата на човека, най-новите отгоре; търсенето на изчисленията без карта (картите
 * се търсят с търсачката на „Schede“) и кои от намерените карти вече имат изчисление. Изчисление на карта
 * в кошчето не се показва.
 */

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
} satisfies Prisma.CalcoloLimitatoreSelect;

type Row = Prisma.CalcoloLimitatoreGetPayload<{ select: typeof SELECT }>;

function riga(row: Row): RigaCalcolo {
  const fonte = row.scheda ?? row;
  return {
    id: row.id,
    href: row.schedaId
      ? `/schede/${row.schedaId}/calcolo-limitatore`
      : `/calcolo-limitatore/${row.id}`,
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
const VISIBILE: Prisma.CalcoloLimitatoreWhereInput = {
  OR: [{ schedaId: null }, { scheda: { deletedAt: null } }],
};

const ORDINE = [{ updatedAt: 'desc' }, { id: 'desc' }] as const;

/** Записаните изчисления, по страници. `azienda` — филтърът (фирма извън обхвата — празно). */
export async function elencoCalcoli(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
}): Promise<{ rows: RigaCalcolo[]; total: number; page: number; pages: number }> {
  const page = pageOf(options.page);
  const where = { ...aziendaWhere(options.scope, options.azienda), ...VISIBILE };
  const [total, rows] = await prisma.$transaction([
    prisma.calcoloLimitatore.count({ where }),
    prisma.calcoloLimitatore.findMany({
      where,
      select: SELECT,
      orderBy: [...ORDINE],
      skip: (page - 1) * PAGINA,
      take: PAGINA,
    }),
  ]);
  return { rows: rows.map(riga), total, page, pages: Math.max(1, Math.ceil(total / PAGINA)) };
}

/** Изчисленията без карта, в които се намира всяка дума (думите са само букви и цифри). */
export async function cercaLiberi(
  scope: Scope,
  query: string,
): Promise<{ rows: RigaCalcolo[]; total: number }> {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return { rows: [], total: 0 };
  const where: Prisma.CalcoloLimitatoreWhereInput = {
    ...aziendaWhere(scope),
    schedaId: null,
    AND: tokens.map((token) => ({ searchText: { contains: token } })),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.calcoloLimitatore.count({ where }),
    prisma.calcoloLimitatore.findMany({
      where,
      select: SELECT,
      orderBy: [...ORDINE],
      take: MAX_LIBERI,
    }),
  ]);
  return { rows: rows.map(riga), total };
}

/** Кои от картите вече имат изчисление и кога е записано. */
export async function calcoliDelleSchede(schedaIds: string[]): Promise<Map<string, Date>> {
  if (schedaIds.length === 0) return new Map();
  const rows = await prisma.calcoloLimitatore.findMany({
    where: { schedaId: { in: schedaIds } },
    select: { schedaId: true, updatedAt: true },
  });
  return new Map(rows.flatMap((r) => (r.schedaId ? [[r.schedaId, r.updatedAt] as const] : [])));
}
