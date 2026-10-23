import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { aziendaSql, schedaScope, type Scope } from '../auth/scope.js';
import { escapeLike, queryTokens } from './search.js';

/**
 * Списъкът и търсенето на картите в обхвата на човека (src/auth/scope.ts) — отделно от записа
 * (service.ts).
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
