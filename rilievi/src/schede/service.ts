import { Prisma, type Scheda } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { aziendaSql, inScope, schedaScope, type Scope } from '../auth/scope.js';
import { escapeLike, queryTokens, searchTextOf } from './search.js';
import type { SchedaData } from './validation.js';

/**
 * Картите. Всяка функция тук получава обхвата на човека (src/auth/scope.ts): фирмата вижда и
 * променя само своите карти, MASTER — всички. Чужда карта е „няма такава“ (404), не „забранено“ —
 * отговорът не казва, че съществува.
 */

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
  aziendaId: true,
  azienda: { select: { name: true } },
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
 * Списъкът или търсенето в обхвата. Всяка дума от заявката трябва да се намери в `searchText`
 * (триграмен GIN индекс). Пълно съвпадение на номера или матрикулата е първо, после съвпадение по
 * начало, после по дата — най-новите отгоре. Параметрите отиват като параметри на заявката, никога в
 * текста ѝ. `azienda` — филтърът на MASTER (за останалите обхватът вече е една фирма).
 */
export async function listSchede(options: {
  scope: Scope;
  azienda?: string | null;
  query?: string;
  page?: unknown;
  trash?: boolean;
}): Promise<SchedaPage> {
  const page = pageOf(options.page);
  const tokens = queryTokens(options.query ?? '');
  const scoped = schedaScope(options.scope, options.azienda);

  if (tokens.length === 0) {
    const where: Prisma.SchedaWhereInput = {
      ...scoped,
      deletedAt: options.trash ? { not: null } : null,
    };
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
  const conditions = [
    options.trash ? Prisma.sql`"deletedAt" IS NOT NULL` : Prisma.sql`"deletedAt" IS NULL`,
    ...tokens.map((token) => Prisma.sql`"searchText" LIKE ${`%${token}%`}`),
  ];
  const companies = aziendaSql(options.scope, options.azienda);
  if (companies === 'none') return { rows: [], total: 0, page, pages: 1, tokens };
  if (companies) conditions.unshift(companies);
  const where = Prisma.join(conditions, ' AND ');
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
  // Пак в обхвата — второ условие, ако заявката отгоре някога се промени.
  const rows = await prisma.scheda.findMany({
    where: { id: { in: ids }, ...scoped },
    select: LIST_SELECT,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
}

const WITH_PEOPLE = {
  misureBottoniere: { orderBy: { fermata: 'asc' } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  deletedBy: { select: { name: true } },
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
} satisfies Prisma.SchedaInclude;

export type SchedaFull = Prisma.SchedaGetPayload<{ include: typeof WITH_PEOPLE }>;

/** Карта по id в обхвата; изтритата — само за обхвата на кошчето (`trashScope`, ролята във фирмата ѝ). */
export async function getScheda(
  scope: Scope,
  id: string,
  trashScope?: Scope,
): Promise<SchedaFull | null> {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  const scheda = await prisma.scheda.findFirst({
    where: { id, ...schedaScope(scope) },
    include: WITH_PEOPLE,
  });
  if (!scheda) return null;
  if (scheda.deletedAt && !(trashScope && inScope(trashScope, scheda.aziendaId))) return null;
  return scheda;
}

/** Колоните на картата (без редовете с мерки — те са отделна таблица) и текстът за търсене. */
function persisted(
  data: SchedaData,
): Omit<Prisma.SchedaUncheckedCreateInput, 'createdById' | 'aziendaId'> {
  const { misureBottoniere: _rows, ordineQuadro, preventivoArgano, ...fields } = data;
  return {
    ...fields,
    // Модулите на доставчиците — JSON или истинско NULL в базата (не JSON null).
    ordineQuadro: ordineQuadro ?? Prisma.DbNull,
    preventivoArgano: preventivoArgano ?? Prisma.DbNull,
    searchText: searchTextOf(fields),
  };
}

/** Нова карта във фирмата `aziendaId` — тази на човека или избраната (и проверена) от MASTER. */
export async function createScheda(
  data: SchedaData,
  actorId: string,
  aziendaId: string,
): Promise<Scheda> {
  return prisma.$transaction(async (tx) => {
    const scheda = await tx.scheda.create({
      data: {
        ...persisted(data),
        aziendaId,
        createdById: actorId,
        updatedById: actorId,
        misureBottoniere: { createMany: { data: data.misureBottoniere } },
      },
    });
    await writeAudit(
      { actorId, action: 'SCHEDA_CREATE', aziendaId, targetType: 'scheda', targetId: scheda.id },
      tx,
    );
    return scheda;
  });
}

/** Фирмата на карта в обхвата (за одита), или null — няма я или е чужда. */
async function aziendaOf(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
): Promise<string | null> {
  const row = await tx.scheda.findFirst({
    where: { id, ...schedaScope(scope) },
    select: { aziendaId: true },
  });
  return row?.aziendaId ?? null;
}

export type UpdateOutcome = 'ok' | 'conflict' | 'missing';

/**
 * Записът е само върху отворената версия: формата праща `base` (= updatedAt при отварянето). Промяна
 * от друг човек междувременно → `conflict`, нищо не се презаписва тихо. Фирмата на картата не се мени.
 */
export async function updateScheda(
  scope: Scope,
  id: string,
  base: string,
  data: SchedaData,
  actorId: string,
): Promise<UpdateOutcome> {
  const baseDate = new Date(base);
  if (Number.isNaN(baseDate.getTime())) return 'conflict';
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return 'missing';
    const updated = await tx.scheda.updateMany({
      where: { id, aziendaId, updatedAt: baseDate, deletedAt: null },
      data: { ...persisted(data), updatedById: actorId },
    });
    if (updated.count === 0) {
      const exists = await tx.scheda.count({ where: { id, aziendaId, deletedAt: null } });
      return exists ? 'conflict' : 'missing';
    }
    // Мерките по спирки се записват наново — точно каквото е във формата, нищо старо не остава.
    await tx.misuraBottoniera.deleteMany({ where: { schedaId: id } });
    if (data.misureBottoniere.length > 0) {
      await tx.misuraBottoniera.createMany({
        data: data.misureBottoniere.map((row) => ({ ...row, schedaId: id })),
      });
    }
    await writeAudit(
      { actorId, action: 'SCHEDA_UPDATE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return 'ok';
  });
}

/** В кошчето — възстановима. */
export async function trashScheda(scope: Scope, id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return false;
    const moved = await tx.scheda.updateMany({
      where: { id, aziendaId, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    if (moved.count === 0) return false;
    await writeAudit(
      { actorId, action: 'SCHEDA_DELETE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return true;
  });
}

export async function restoreScheda(scope: Scope, id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return false;
    const restored = await tx.scheda.updateMany({
      where: { id, aziendaId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, updatedById: actorId },
    });
    if (restored.count === 0) return false;
    await writeAudit(
      { actorId, action: 'SCHEDA_RESTORE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return true;
  });
}

/** Окончателно — само от кошчето, само ADMIN и нагоре (маршрутът го проверява). */
export async function purgeScheda(scope: Scope, id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return false;
    const removed = await tx.scheda.deleteMany({
      where: { id, aziendaId, deletedAt: { not: null } },
    });
    if (removed.count === 0) return false;
    await writeAudit(
      { actorId, action: 'SCHEDA_PURGE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return true;
  });
}
