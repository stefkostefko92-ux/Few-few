import type { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { PAGE_SIZE, pageOf } from '../schede/list.js';
import type { CartelloData } from './form.js';

/**
 * Табелите „Avviso di fermo impianto“ в базата: запис (с проверка, че никой не я е сменил междувременно),
 * изтриване, списък по фирма. Одитът е в същата транзакция; текстът на табелата в него не влиза.
 */

const INCLUDE = {
  azienda: {
    select: { id: true, name: true, logoType: true, datiSocietari: true, cartelloModello: true },
  },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.CartelloInclude;

export type CartelloFull = Prisma.CartelloGetPayload<{ include: typeof INCLUDE }>;

const LIST_SELECT = {
  id: true,
  data: true,
  indirizzo: true,
  citta: true,
  ubicazione: true,
  aziendaId: true,
  azienda: { select: { name: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.CartelloSelect;

export type CartelloRow = Prisma.CartelloGetPayload<{ select: typeof LIST_SELECT }>;

export async function createCartello(
  data: CartelloData,
  actorId: string,
  aziendaId: string,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.cartello.create({
      data: { ...data, aziendaId, createdById: actorId, updatedById: actorId },
      select: { id: true },
    });
    await writeAudit(
      { actorId, action: 'CARTELLO_CREATE', aziendaId, targetType: 'cartello', targetId: row.id },
      tx,
    );
    return row;
  });
}

/** Табелата в обхвата, или null — няма я или е на друга фирма. */
export function getCartello(scope: Scope, id: string): Promise<CartelloFull | null> {
  return prisma.cartello.findFirst({ where: { id, ...aziendaWhere(scope) }, include: INCLUDE });
}

export type EsitoCartello = 'ok' | 'conflict' | 'missing';

/** Записва се само ако е същата, която човекът е отворил (`base` = updatedAt тогава). */
export async function updateCartello(
  scope: Scope,
  id: string,
  base: string,
  data: CartelloData,
  actorId: string,
): Promise<EsitoCartello> {
  const baseDate = new Date(base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.cartello.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: { aziendaId: true },
    });
    if (!current) return 'missing';
    if (Number.isNaN(baseDate.getTime())) return 'conflict';
    const updated = await tx.cartello.updateMany({
      where: { id, aziendaId: current.aziendaId, updatedAt: baseDate },
      data: { ...data, updatedById: actorId },
    });
    if (updated.count === 0) return 'conflict';
    await writeAudit(
      {
        actorId,
        action: 'CARTELLO_UPDATE',
        aziendaId: current.aziendaId,
        targetType: 'cartello',
        targetId: id,
      },
      tx,
    );
    return 'ok';
  });
}

/** Изтрива табелата в обхвата; false — няма я. */
export async function deleteCartello(scope: Scope, id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.cartello.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: { aziendaId: true },
    });
    if (!current) return false;
    const deleted = await tx.cartello.deleteMany({ where: { id, aziendaId: current.aziendaId } });
    if (deleted.count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'CARTELLO_DELETE',
        aziendaId: current.aziendaId,
        targetType: 'cartello',
        targetId: id,
      },
      tx,
    );
    return true;
  });
}

export interface CartelliPage {
  rows: CartelloRow[];
  total: number;
  page: number;
  pages: number;
}

/** Списъкът в обхвата — най-новите отгоре. */
export async function listCartelli(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
}): Promise<CartelliPage> {
  const page = pageOf(options.page);
  const where = aziendaWhere(options.scope, options.azienda);
  const [total, rows] = await prisma.$transaction([
    prisma.cartello.count({ where }),
    prisma.cartello.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
