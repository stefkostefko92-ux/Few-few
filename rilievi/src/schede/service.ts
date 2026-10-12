import { Prisma, type Scheda } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { escapeLike, queryTokens, searchTextOf } from './search.js';
import type { SchedaData } from './validation.js';

export const PAGE_SIZE = 25;

/** Колоните за списъка и резултатите от търсенето — без бележките. */
const LIST_SELECT = {
  id: true,
  data: true,
  indirizzo: true,
  marca: true,
  matricola: true,
  numeroImpianto: true,
  portataKg: true,
  capienzaPersone: true,
  fermate: true,
  tipoImpianto: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.SchedaSelect;

export type SchedaRow = Prisma.SchedaGetPayload<{ select: typeof LIST_SELECT }>;

export interface SchedaPage {
  rows: SchedaRow[];
  total: number;
  page: number;
  pages: number;
  tokens: string[];
}

function pageOf(raw: unknown): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/**
 * Списъкът или търсенето. Всяка дума от заявката трябва да се намери в `searchText` (триграмен GIN
 * индекс). Пълно съвпадение на номера или матрикулата е първо, после съвпадение по начало, после по
 * дата — най-новите отгоре. Параметрите отиват като параметри на заявката, никога в текста ѝ.
 */
export async function listSchede(options: {
  query?: string;
  page?: unknown;
  trash?: boolean;
}): Promise<SchedaPage> {
  const page = pageOf(options.page);
  const tokens = queryTokens(options.query ?? '');
  const deleted = options.trash
    ? Prisma.sql`"deletedAt" IS NOT NULL`
    : Prisma.sql`"deletedAt" IS NULL`;

  if (tokens.length === 0) {
    const where: Prisma.SchedaWhereInput = options.trash
      ? { deletedAt: { not: null } }
      : { deletedAt: null };
    const [total, rows] = await prisma.$transaction([
      prisma.scheda.count({ where }),
      prisma.scheda.findMany({
        where,
        select: LIST_SELECT,
        orderBy: options.trash
          ? [{ deletedAt: 'desc' }]
          : [{ data: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
  }

  const exact = (options.query ?? '').trim().slice(0, 100);
  const prefix = `${escapeLike(exact)}%`;
  const where = Prisma.join(
    [deleted, ...tokens.map((token) => Prisma.sql`"searchText" LIKE ${`%${token}%`}`)],
    ' AND ',
  );
  const [counted, found] = await Promise.all([
    prisma.$queryRaw<Array<{ n: number }>>`SELECT COUNT(*)::int AS n FROM "Scheda" WHERE ${where}`,
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Scheda" WHERE ${where}
      ORDER BY
        CASE
          WHEN "numeroImpianto" = ${exact} OR "matricola" = ${exact} THEN 0
          WHEN "numeroImpianto" LIKE ${prefix} OR "matricola" LIKE ${prefix} THEN 1
          ELSE 2
        END,
        "data" DESC, "createdAt" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
  ]);
  const total = counted[0]?.n ?? 0;
  const ids = found.map((row) => row.id);
  const rows = await prisma.scheda.findMany({ where: { id: { in: ids } }, select: LIST_SELECT });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
}

const WITH_PEOPLE = {
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  deletedBy: { select: { name: true } },
} satisfies Prisma.SchedaInclude;

export type SchedaFull = Prisma.SchedaGetPayload<{ include: typeof WITH_PEOPLE }>;

/** Схема по id; изтритата — само ако е поискана изрично (кошчето). */
export async function getScheda(id: string, includeDeleted = false): Promise<SchedaFull | null> {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  const scheda = await prisma.scheda.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!scheda || (scheda.deletedAt && !includeDeleted)) return null;
  return scheda;
}

function persisted(data: SchedaData): Omit<Prisma.SchedaUncheckedCreateInput, 'createdById'> {
  return { ...data, searchText: searchTextOf(data) };
}

export async function createScheda(data: SchedaData, actorId: string): Promise<Scheda> {
  return prisma.$transaction(async (tx) => {
    const scheda = await tx.scheda.create({
      data: { ...persisted(data), createdById: actorId, updatedById: actorId },
    });
    await writeAudit(
      { actorId, action: 'SCHEDA_CREATE', targetType: 'scheda', targetId: scheda.id },
      tx,
    );
    return scheda;
  });
}

export type UpdateOutcome = 'ok' | 'conflict' | 'missing';

/**
 * Записът е само върху отворената версия: формата праща `base` (= updatedAt при отварянето). Промяна
 * от друг човек междувременно → `conflict`, нищо не се презаписва тихо.
 */
export async function updateScheda(
  id: string,
  base: string,
  data: SchedaData,
  actorId: string,
): Promise<UpdateOutcome> {
  const baseDate = new Date(base);
  if (Number.isNaN(baseDate.getTime())) return 'conflict';
  return prisma.$transaction(async (tx) => {
    const updated = await tx.scheda.updateMany({
      where: { id, updatedAt: baseDate, deletedAt: null },
      data: { ...persisted(data), updatedById: actorId },
    });
    if (updated.count === 0) {
      const exists = await tx.scheda.count({ where: { id, deletedAt: null } });
      return exists ? 'conflict' : 'missing';
    }
    await writeAudit({ actorId, action: 'SCHEDA_UPDATE', targetType: 'scheda', targetId: id }, tx);
    return 'ok';
  });
}

/** В кошчето — възстановима. */
export async function trashScheda(id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.scheda.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    if (moved.count === 0) return false;
    await writeAudit({ actorId, action: 'SCHEDA_DELETE', targetType: 'scheda', targetId: id }, tx);
    return true;
  });
}

export async function restoreScheda(id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const restored = await tx.scheda.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, updatedById: actorId },
    });
    if (restored.count === 0) return false;
    await writeAudit({ actorId, action: 'SCHEDA_RESTORE', targetType: 'scheda', targetId: id }, tx);
    return true;
  });
}

/** Окончателно — само от кошчето, само ADMIN и нагоре (маршрутът го проверява). */
export async function purgeScheda(id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const removed = await tx.scheda.deleteMany({ where: { id, deletedAt: { not: null } } });
    if (removed.count === 0) return false;
    await writeAudit({ actorId, action: 'SCHEDA_PURGE', targetType: 'scheda', targetId: id }, tx);
    return true;
  });
}
