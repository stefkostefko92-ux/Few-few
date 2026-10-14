import 'server-only';
// The installations' list (the dashboard /app/impianti, the top bar's search, a Rilievi home figure's installations),
// always within the company of the signed-in user. Apart from queries.ts so that each stays short.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ALL_ROWS, likeEscape } from '@/lib/dashboard';
import type { ProjectKind } from '@/lib/schemas';

/** The engine versions a lift design's records were saved with (records.ts, `outdated`). */
export const LIFT_VERSIONS = { engineVersion: true, calculation: { select: { engineVersion: true } }, shaftDesign: { select: { engineVersion: true } } } as const;

/** The list's filters: archived or active, a module, the words searched (dashboard.ts searchWords; in the name, address,
 *  municipality, plant number, or — for whoever sees the surveys ('rilievi:view') — a linked survey's matricola or
 *  number), a Rilievi home figure's installations (`ids`). */
function projectsWhere(user: SessionUser, archived: boolean, kind: ProjectKind | null, q: readonly string[], ids?: readonly string[]) {
  const has = (w: string) => ({ contains: likeEscape(w), mode: 'insensitive' as const });
  const surveys = can(user, 'rilievi:view');
  const words = q.map((w) => ({ OR: [{ name: has(w) }, { address: has(w) }, { city: has(w) }, { plantNumber: has(w) },
    ...(surveys ? [{ schede: { some: { deletedAt: null, OR: [{ matricola: has(w) }, { numeroImpianto: has(w) }] } } }] : [])] }));
  return { companyId: user.companyId, archivedAt: archived ? { not: null } : null, ...(kind ? { kind } : {}), ...(words.length ? { AND: words } : {}), ...(ids ? { id: { in: [...ids] } } : {}) };
}

const PROJECT_ROW_SELECT = {
  id: true, kind: true, name: true, address: true, city: true, province: true, plantNumber: true, updatedAt: true, archivedAt: true,
  _count: { select: { calculations: true } },
  calculations: {
    orderBy: { createdAt: 'desc' }, take: 1,
    select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true, engineVersion: true, shaftDesign: { select: { engineVersion: true } } },
  },
  // a whole project's result is its latest lift design's (the test's verdict, its parts only)
  liftDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, verdict: true, failCount: true, warnCount: true, createdAt: true, summary: true, ...LIFT_VERSIONS } },
} as const;

/** The company's installations, latest change first: the first `take` of the view (dashboard: its recent ones). */
export function listProjects(user: SessionUser, archived: boolean, kind: ProjectKind | null = null, q: readonly string[] = [], take = ALL_ROWS, ids?: readonly string[]) {
  return prisma.project.findMany({ where: projectsWhere(user, archived, kind, q, ids), orderBy: { updatedAt: 'desc' }, take, select: PROJECT_ROW_SELECT });
}

/** How many installations the view has (the list shows the first of them). */
export function countProjects(user: SessionUser, archived: boolean, kind: ProjectKind | null = null, q: readonly string[] = [], ids?: readonly string[]) {
  return prisma.project.count({ where: projectsWhere(user, archived, kind, q, ids) });
}

/** One installation of the company as a row of the list (the dashboard's preview); null when it is not the company's. */
export function getProjectRow(user: SessionUser, id: string) {
  return prisma.project.findFirst({ where: { id, companyId: user.companyId }, select: PROJECT_ROW_SELECT });
}
