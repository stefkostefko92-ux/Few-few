import type { Prisma } from '@prisma/client';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { PAGE_SIZE, pageOf } from '../schede/list.js';
import { queryTokens } from '../schede/search.js';
import { tipoPosto } from './posti.js';

/**
 * Четенето на „Buono di lavoro“: целият лист с подписите (страницата, PDF-ът, износът), списъкът с
 * търсенето, листовете на картата и на фирмата. Обхватът идва от маршрута — тук не се решава.
 */

const INCLUDE = {
  azienda: {
    select: {
      id: true,
      name: true,
      logoType: true,
      logoWidth: true,
      logoHeight: true,
      logoUpdatedAt: true,
      buonoCodice: true,
      buonoClausola: true,
    },
  },
  scheda: { select: { id: true, matricola: true, numeroImpianto: true, deletedAt: true } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  firme: {
    orderBy: { firmatoAt: 'asc' },
    include: { firmatoDa: { select: { name: true } } },
  },
} satisfies Prisma.BuonoLavoroInclude;

export type BuonoFull = Prisma.BuonoLavoroGetPayload<{ include: typeof INCLUDE }>;

/** Листът в обхвата, или null — няма го или е на друга фирма. */
export function getBuono(scope: Scope, id: string): Promise<BuonoFull | null> {
  return prisma.buonoLavoro.findFirst({ where: { id, ...aziendaWhere(scope) }, include: INCLUDE });
}

/** Целият лист по id — без обхват: само за износа на вече избраната фирма. */
export function buonoPerId(id: string): Promise<BuonoFull | null> {
  return prisma.buonoLavoro.findUnique({ where: { id }, include: INCLUDE });
}

/** Има ли подпис долу — тогава листът е затворен за промяна. */
export const chiuso = (row: { firme: ReadonlyArray<{ posto: string }> }): boolean =>
  row.firme.some((f) => tipoPosto(f.posto) === 'finale');

const LIST_SELECT = {
  id: true,
  numero: true,
  matricola: true,
  ubicazione: true,
  dataConferma: true,
  inizioPrevisto: true,
  createdAt: true,
  aziendaId: true,
  azienda: { select: { name: true } },
  _count: { select: { firme: true } },
} satisfies Prisma.BuonoLavoroSelect;

export type BuonoRow = Prisma.BuonoLavoroGetPayload<{ select: typeof LIST_SELECT }>;

export interface BuoniPage {
  rows: BuonoRow[];
  total: number;
  page: number;
  pages: number;
  tokens: string[];
}

/** Списъкът в обхвата — най-новите отгоре; търсенето — всяка дума някъде в номера, матрикулата, мястото… */
export async function listBuoni(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
  query?: string;
}): Promise<BuoniPage> {
  const page = pageOf(options.page);
  const tokens = queryTokens(options.query ?? '');
  const where: Prisma.BuonoLavoroWhereInput = {
    ...aziendaWhere(options.scope, options.azienda),
    AND: tokens.map((token) => ({ searchText: { contains: token } })),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.buonoLavoro.count({ where }),
    prisma.buonoLavoro.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
}

/** Листовете на картата (най-новите отгоре) в обхвата на човека — за страницата на картата. */
export function buoniDellaScheda(scope: Scope, schedaId: string) {
  return prisma.buonoLavoro.findMany({
    where: { schedaId, ...aziendaWhere(scope) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, numero: true, createdAt: true, _count: { select: { firme: true } } },
    take: 20,
  });
}

/** Листовете на фирмата — само id и денят (износът ги прави един по един). */
export function buoniDi(aziendaId: string) {
  return prisma.buonoLavoro.findMany({
    where: { aziendaId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });
}
