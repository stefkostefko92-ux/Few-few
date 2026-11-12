import type { Prisma, StatoPreventivo } from '@prisma/client';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { PAGE_SIZE, pageOf } from '../schede/list.js';
import { queryTokens } from '../schede/search.js';

/**
 * Четенето на офертите: цялата оферта (страницата, PDF-ът, износът), списъкът с търсенето и състоянието,
 * офертите на картата. Само във фирма с включени оферти — и за MASTER (`scope.all`), който иначе би видял
 * офертите на фирма, на която MASTER ги е изключил. Обхватът идва от маршрута.
 */

const ATTIVI = { azienda: { preventiviAttivi: true } } satisfies Prisma.PreventivoWhereInput;

const INCLUDE = {
  azienda: {
    select: {
      id: true,
      name: true,
      logoType: true,
      logoWidth: true,
      logoHeight: true,
      logoUpdatedAt: true,
      datiSocietari: true,
      preventivoCondizioni: true,
    },
  },
  scheda: { select: { id: true, matricola: true, numeroImpianto: true, deletedAt: true } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.PreventivoInclude;

export type PreventivoFull = Prisma.PreventivoGetPayload<{ include: typeof INCLUDE }>;

/** Офертата в обхвата, или null — няма я, на друга фирма е или офертите на фирмата са изключени. */
export function getPreventivo(scope: Scope, id: string): Promise<PreventivoFull | null> {
  return prisma.preventivo.findFirst({
    where: { id, ...aziendaWhere(scope), ...ATTIVI },
    include: INCLUDE,
  });
}

/** Цялата оферта по id — без обхват: само за износа на вече избраната фирма. */
export function preventivoPerId(id: string): Promise<PreventivoFull | null> {
  return prisma.preventivo.findUnique({ where: { id }, include: INCLUDE });
}

const LIST_SELECT = {
  id: true,
  numero: true,
  data: true,
  cliente: true,
  oggetto: true,
  totale: true,
  stato: true,
  aziendaId: true,
  azienda: { select: { name: true } },
} satisfies Prisma.PreventivoSelect;

export type PreventivoRow = Prisma.PreventivoGetPayload<{ select: typeof LIST_SELECT }>;

/** Списъкът: най-новите отгоре; търсенето — всяка дума в номера, клиента, предмета, уредбата, редовете. */
export async function listPreventivi(options: {
  scope: Scope;
  azienda?: string | null;
  stato?: StatoPreventivo | null;
  page?: unknown;
  query?: string;
}) {
  const page = pageOf(options.page);
  const tokens = queryTokens(options.query ?? '');
  const where: Prisma.PreventivoWhereInput = {
    ...aziendaWhere(options.scope, options.azienda),
    ...ATTIVI,
    ...(options.stato ? { stato: options.stato } : {}),
    AND: tokens.map((token) => ({ searchText: { contains: token } })),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.preventivo.count({ where }),
    prisma.preventivo.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ data: 'desc' }, { numero: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
}

/** Офертите на картата (най-новите отгоре) в обхвата — за страницата на картата. */
export function preventiviDellaScheda(scope: Scope, schedaId: string) {
  return prisma.preventivo.findMany({
    where: { schedaId, ...aziendaWhere(scope), ...ATTIVI },
    orderBy: [{ data: 'desc' }, { numero: 'desc' }],
    select: { id: true, numero: true, data: true, stato: true, totale: true },
    take: 20,
  });
}

/** Офертите на фирмата — само id (износът ги прави една по една), включени или не. */
export function preventiviDi(aziendaId: string) {
  return prisma.preventivo.findMany({
    where: { aziendaId },
    orderBy: { numero: 'asc' },
    select: { id: true, numero: true },
  });
}
