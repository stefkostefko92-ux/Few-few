import 'server-only';
// The installations' list (the dashboard /app/impianti, the top bar's search, a Rilievi home figure's installations),
// always within the company of the signed-in user. Apart from queries.ts so that each stays short.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ALL_ROWS, likeEscape } from '@/lib/dashboard';
import type { TipoIntervento } from '@/lib/lift/intervento';
import { tipoDaUltimi } from './calcolo-base';

/** The engine versions a lift design's records were saved with (records.ts, `outdated`). */
export const LIFT_VERSIONS = { engineVersion: true, calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true } } } as const;

/** The list's filters: archived or active, the words searched (dashboard.ts searchWords; in the name, address,
 *  municipality, plant number, or — for whoever sees the surveys ('rilievi:view') — a linked survey's matricola or
 *  number), the installations of a type of intervention or of a Rilievi home figure (`ids`). */
function projectsWhere(user: SessionUser, archived: boolean, q: readonly string[], ids?: readonly string[]) {
  const has = (w: string) => ({ contains: likeEscape(w), mode: 'insensitive' as const });
  const surveys = can(user, 'rilievi:view');
  const words = q.map((w) => ({ OR: [{ name: has(w) }, { address: has(w) }, { city: has(w) }, { plantNumber: has(w) },
    ...(surveys ? [{ schede: { some: { deletedAt: null, OR: [{ matricola: has(w) }, { numeroImpianto: has(w) }] } } }] : [])] }));
  return { companyId: user.companyId, archivedAt: archived ? { not: null } : null, ...(words.length ? { AND: words } : {}), ...(ids ? { id: { in: [...ids] } } : {}) };
}

const PROJECT_ROW_SELECT = {
  id: true, name: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true, archivedAt: true,
  _count: { select: { calculations: true } },
  calculations: {
    orderBy: { createdAt: 'desc' }, take: 1,
    select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true, engineVersion: true, shaftDesign: { select: { engineVersion: true } } },
  },
  // a whole project's result is its latest lift design's (the test's verdict, its parts only)
  liftDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true, ...LIFT_VERSIONS } },
} as const;

/** The company's installations, latest change first: the first `take` of the view (dashboard: its recent ones). */
export function listProjects(user: SessionUser, archived: boolean, q: readonly string[] = [], take = ALL_ROWS, ids?: readonly string[]) {
  return prisma.project.findMany({ where: projectsWhere(user, archived, q, ids), orderBy: { updatedAt: 'desc' }, take, select: PROJECT_ROW_SELECT });
}

/** How many installations the view has (the list shows the first of them). */
export function countProjects(user: SessionUser, archived: boolean, q: readonly string[] = [], ids?: readonly string[]) {
  return prisma.project.count({ where: projectsWhere(user, archived, q, ids) });
}

interface TipoRow {
  id: string;
  sId: string | null;
  sTipo: TipoIntervento | null;
  sContext: string | null;
  sCollaudo: unknown;
  aId: string | null;
  aTipo: TipoIntervento | null;
  aContext: string | null;
  aCollaudo: unknown;
}

/** The type of intervention of each installation of the company, archived or active (round 45, never stored on the
 *  installation): its latest step-2 calculation's, else its latest calculation's of any provenance (a whole project
 *  before round 45), read by its shape when declared before none; null — «Da definire». One query: each installation's
 *  two latest calculations through the [projectId, createdAt] index (LATERAL … LIMIT 1); mapped in TypeScript only
 *  (calcolo-base.ts tipoDaUltimi). */
export async function tipiImpianti(user: SessionUser, archived: boolean): Promise<Map<string, TipoIntervento | null>> {
  const rows = await prisma.$queryRaw<TipoRow[]>`
    SELECT p."id", s."id" AS "sId", s."intervento" AS "sTipo", s."inputs"->>'context' AS "sContext", s."collaudo" AS "sCollaudo",
      a."id" AS "aId", a."intervento" AS "aTipo", a."inputs"->>'context' AS "aContext", a."collaudo" AS "aCollaudo"
    FROM "Project" p
    LEFT JOIN LATERAL (
      SELECT c."id", c."intervento", c."inputs", c."collaudo" FROM "Calculation" c
      WHERE c."projectId" = p."id" AND c."shaftDesignId" IS NULL AND NOT EXISTS (SELECT 1 FROM "LiftDesign" l WHERE l."calculationId" = c."id")
      ORDER BY c."createdAt" DESC LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT c."id", c."intervento", c."inputs", c."collaudo" FROM "Calculation" c WHERE c."projectId" = p."id" ORDER BY c."createdAt" DESC LIMIT 1
    ) a ON true
    WHERE p."companyId" = ${user.companyId} AND ${archived ? Prisma.sql`p."archivedAt" IS NOT NULL` : Prisma.sql`p."archivedAt" IS NULL`}`;
  return new Map(rows.map((r) => [r.id, tipoDaUltimi(r.sId ? { intervento: r.sTipo, context: r.sContext, collaudo: r.sCollaudo } : null,
    r.aId ? { intervento: r.aTipo, context: r.aContext, collaudo: r.aCollaudo } : null)]));
}

/** One installation of the company as a row of the list (the dashboard's preview); null when it is not the company's. */
export function getProjectRow(user: SessionUser, id: string) {
  return prisma.project.findFirst({ where: { id, companyId: user.companyId }, select: PROJECT_ROW_SELECT });
}
