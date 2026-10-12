import 'server-only';
// The survey sheets' reads, always within the company of the signed-in user (companyId from the session): another
// company's sheet is "not found" (404), never "forbidden" — the answer does not say it exists. Ported from rilievi's
// src/schede/service.ts (listSchede, getScheda); rilievi's MASTER view of every company does not exist here.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { schedaIdSchema } from '@/lib/rilievi/inputs';
import { escapeLike, queryTokens } from '@/lib/rilievi/search';

export const PAGE_SIZE = 25;

/** The columns of the list and of the search results — without the notes. */
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
  /** the query's words (search.ts queryTokens) — for highlight() */
  tokens: string[];
}

/**
 * The company's list or search. Every word of the query must be found in `searchText` (trigram GIN index). An exact
 * match of the number or the matricola comes first, then a match at the start, then by date — the newest first. The
 * values go as parameters of the query, never into its text. `trash`: the sheets in the trash, the latest deleted first.
 */
export async function listSchede(options: { companyId: string; query?: string; page?: number; trash?: boolean }): Promise<SchedaPage> {
  const page = options.page && Number.isInteger(options.page) && options.page >= 1 && options.page <= 10_000 ? options.page : 1;
  const tokens = queryTokens(options.query ?? '');
  const { companyId } = options;

  if (tokens.length === 0) {
    const where: Prisma.SchedaWhereInput = { companyId, deletedAt: options.trash ? { not: null } : null };
    const [total, rows] = await prisma.$transaction([
      prisma.scheda.count({ where }),
      prisma.scheda.findMany({
        where,
        select: LIST_SELECT,
        orderBy: options.trash ? [{ deletedAt: 'desc' }] : [{ data: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
  }

  const exact = (options.query ?? '').trim().slice(0, 100);
  const prefix = `${escapeLike(exact)}%`;
  const where = Prisma.join(
    [
      Prisma.sql`"companyId" = ${companyId}`,
      options.trash ? Prisma.sql`"deletedAt" IS NOT NULL` : Prisma.sql`"deletedAt" IS NULL`,
      ...tokens.map((token) => Prisma.sql`"searchText" LIKE ${`%${token}%`}`),
    ],
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
  // within the company again — a second condition, should the query above ever change
  const rows = await prisma.scheda.findMany({ where: { id: { in: ids }, companyId }, select: LIST_SELECT });
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), tokens };
}

const WITH_PEOPLE = {
  misureBottoniere: { orderBy: { fermata: 'asc' } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  deletedBy: { select: { name: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.SchedaInclude;

export type SchedaFull = Prisma.SchedaGetPayload<{ include: typeof WITH_PEOPLE }>;

/** A sheet of the company by id; a trashed one only when asked for explicitly (whoever manages the trash). */
export async function getScheda(companyId: string, id: string, includeDeleted = false): Promise<SchedaFull | null> {
  if (!schedaIdSchema.safeParse(id).success) return null;
  const scheda = await prisma.scheda.findFirst({ where: { id, companyId }, include: WITH_PEOPLE });
  if (!scheda || (scheda.deletedAt && !includeDeleted)) return null;
  return scheda;
}

/** The company's logo of the drawing sets (Company.logo) for the sheet's PDF, or null. */
export async function companyLogo(companyId: string): Promise<{ data: Uint8Array; mime: string; width: number; height: number } | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { logo: { select: { data: true, mime: true, width: true, height: true } } } });
  return company?.logo ?? null;
}

/** The names of the company's sheets for the activity log (`entity: 'Scheda'`): their title data, trashed ones too. */
export function schedeForAudit(companyId: string, ids: readonly string[]) {
  return prisma.scheda.findMany({ where: { id: { in: [...ids] }, companyId }, select: { id: true, numeroImpianto: true, matricola: true, indirizzo: true, deletedAt: true } });
}
