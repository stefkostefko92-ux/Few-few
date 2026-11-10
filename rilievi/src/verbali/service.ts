import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { PAGE_SIZE, pageOf } from '../schede/list.js';
import type { VerbaleData } from './form.js';

/**
 * Протоколите „Verbale di chiusura cantiere“ в базата: нов (от картата — проверена пак в транзакцията —
 * или без карта), запис на черновата (само ако никой не я е сменил междувременно), списък по фирма и
 * протоколите на една карта. Черновата не носи подписи: те влизат само с потвърждението (conferma.ts),
 * след което протоколът не се пипа. Одитът е в същата транзакция; текстът на протокола в него не влиза.
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
    },
  },
  scheda: {
    select: { id: true, matricola: true, numeroImpianto: true, deletedAt: true },
  },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  confermatoBy: { select: { name: true } },
} satisfies Prisma.VerbaleInclude;

export type VerbaleFull = Prisma.VerbaleGetPayload<{ include: typeof INCLUDE }>;

const LIST_SELECT = {
  id: true,
  data: true,
  indirizzo: true,
  buono: true,
  confermatoAt: true,
  aziendaId: true,
  azienda: { select: { name: true } },
} satisfies Prisma.VerbaleSelect;

export type VerbaleRow = Prisma.VerbaleGetPayload<{ select: typeof LIST_SELECT }>;

function persisted(data: VerbaleData) {
  return {
    data: data.data,
    indirizzo: data.indirizzo,
    buono: data.buono,
    voci: data.voci as Prisma.InputJsonObject,
    positivo: data.positivo,
  };
}

/**
 * Нов протокол; `schedaId` — картата, от която е попълнен (маршрутът я е проверил в обхвата). Тук се
 * проверява пак в транзакцията: същата фирма и не в кошчето, иначе нищо не се записва (null).
 */
export async function createVerbale(
  data: VerbaleData,
  actorId: string,
  aziendaId: string,
  schedaId: string | null,
): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    if (schedaId) {
      const scheda = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Scheda"
        WHERE "id" = ${schedaId} AND "aziendaId" = ${aziendaId} AND "deletedAt" IS NULL
        FOR SHARE`;
      if (scheda.length === 0) return null;
    }
    const row = await tx.verbale.create({
      data: {
        ...persisted(data),
        aziendaId,
        schedaId,
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    await writeAudit(
      { actorId, action: 'VERBALE_CREATE', aziendaId, targetType: 'verbale', targetId: row.id },
      tx,
    );
    return row;
  });
}

/** Протоколът в обхвата, или null — няма го или е на друга фирма. */
export function getVerbale(scope: Scope, id: string): Promise<VerbaleFull | null> {
  return prisma.verbale.findFirst({ where: { id, ...aziendaWhere(scope) }, include: INCLUDE });
}

export type EsitoModifica = 'ok' | 'conflict' | 'chiuso' | 'missing';

/** Черновата се записва само ако е същата, която човекът е отворил (`base` = updatedAt тогава). */
export async function updateVerbale(
  scope: Scope,
  id: string,
  base: string,
  data: VerbaleData,
  actorId: string,
): Promise<EsitoModifica> {
  const baseDate = new Date(base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.verbale.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: { aziendaId: true, confermatoAt: true },
    });
    if (!current) return 'missing';
    if (current.confermatoAt) return 'chiuso';
    if (Number.isNaN(baseDate.getTime())) return 'conflict';
    const updated = await tx.verbale.updateMany({
      where: { id, aziendaId: current.aziendaId, confermatoAt: null, updatedAt: baseDate },
      data: { ...persisted(data), updatedById: actorId },
    });
    if (updated.count === 0) {
      const stillOpen = await tx.verbale.count({ where: { id, confermatoAt: null } });
      return stillOpen ? 'conflict' : 'chiuso';
    }
    await writeAudit(
      {
        actorId,
        action: 'VERBALE_UPDATE',
        aziendaId: current.aziendaId,
        targetType: 'verbale',
        targetId: id,
      },
      tx,
    );
    return 'ok';
  });
}

export interface VerbaliPage {
  rows: VerbaleRow[];
  total: number;
  page: number;
  pages: number;
}

/** Списъкът в обхвата — най-новите отгоре. */
export async function listVerbali(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
}): Promise<VerbaliPage> {
  const page = pageOf(options.page);
  const where = aziendaWhere(options.scope, options.azienda);
  const [total, rows] = await prisma.$transaction([
    prisma.verbale.count({ where }),
    prisma.verbale.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Протоколите на картата (най-новите отгоре) в обхвата на човека — за страницата на картата. */
export function verbaliDellaScheda(scope: Scope, schedaId: string) {
  return prisma.verbale.findMany({
    where: { schedaId, ...aziendaWhere(scope) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, data: true, buono: true, confermatoAt: true },
    take: 20,
  });
}
