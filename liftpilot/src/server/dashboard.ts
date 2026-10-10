import 'server-only';
// The dashboard's reads, scoped to the signed-in user's company like every read (queries.ts): the counts of its active
// installations and of their records for the tiles, and the plan of the latest installation's shaft for the preview —
// drawn by the running engine from what was entered, the same view as the shaft design's page.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { projectStats, type ProjectStats } from '@/lib/dashboard';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { previews } from '@/lib/tavole/views';
import { layout } from '@/shaft';
import { outdated } from './records';

const DAY_MS = 86_400_000;
/** The tiles' recent window [days]. */
export const RECENT_DAYS = 30;

/** Every figure is of the active installations, like the tile beside it («active»): an archived one counts nowhere. */
export interface RecordCounts {
  /** drawing sets issued (first issues: revision 0) and their revisions, all time */
  sets: number;
  revisions: number;
  /** calculations saved (each save of an installation's form saves one) and installations created in the window */
  recentCalcs: number;
  recentProjects: number;
}

export async function recordCounts(user: SessionUser, now: Date = new Date()): Promise<RecordCounts> {
  const companyId = user.companyId, since = new Date(now.getTime() - RECENT_DAYS * DAY_MS), project = { archivedAt: null };
  const [sets, revisions, recentCalcs, recentProjects] = await Promise.all([
    prisma.drawingSet.count({ where: { companyId, project, revision: 0 } }),
    prisma.drawingSet.count({ where: { companyId, project, revision: { gt: 0 } } }),
    prisma.calculation.count({ where: { companyId, project, createdAt: { gte: since } } }),
    prisma.project.count({ where: { companyId, archivedAt: null, createdAt: { gte: since } } }),
  ]);
  return { sets, revisions, recentCalcs, recentProjects };
}

/** Every active installation with only what its latest result needs (module, verdict, engine versions), latest change
 *  first: the tiles count all of them — not the first rows of a list — and the preview takes the first with a result. */
export async function activeResults(user: SessionUser): Promise<{ stats: ProjectStats; latestId: string | null }> {
  const v = { select: { engineVersion: true } } as const;
  const rows = await prisma.project.findMany({
    where: { companyId: user.companyId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, kind: true,
      calculations: { orderBy: { createdAt: 'desc' }, take: 1, select: { verdict: true, engineVersion: true, shaftDesign: v } },
      liftDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { verdict: true, engineVersion: true, calculation: v, shaftDesign: v } },
    },
  });
  const results = rows.map((p) => {
    const design = p.liftDesigns[0], calc = p.calculations[0];
    const last = design ?? calc;
    return { kind: p.kind, latest: last ? { verdict: last.verdict, old: design ? outdated.lift(design) : calc ? outdated.calc(calc) : false } : null };
  });
  const first = results.findIndex((r) => r.latest);
  return { stats: projectStats(results), latestId: first < 0 ? null : rows[first].id };
}

export type PlanView = ReturnType<typeof previews>['plan'];

export interface LatestPlan {
  shaftDesignId: string;
  plan: PlanView;
  /** shaft and car [mm], for the drawing's accessible name */
  W: number;
  D: number;
  A: number;
  B: number;
}

/** The plan at the main floor of a lift design's shaft; null when its stored input no longer reads or does not lay out. */
export async function latestPlan(user: SessionUser, liftDesignId: string): Promise<LatestPlan | null> {
  const d = await prisma.liftDesign.findFirst({
    where: { id: liftDesignId, companyId: user.companyId },
    select: { shaftDesign: { select: { id: true, inputs: true } } },
  });
  const inputs = d ? shaftInputsReadSchema.safeParse(d.shaftDesign.inputs) : null;
  if (!d || !inputs?.success) return null;
  try {
    const L = layout(inputs.data);
    return { shaftDesignId: d.shaftDesign.id, plan: previews(L).plan, W: L.inputs.W, D: L.inputs.D, A: L.A, B: L.B };
  } catch {
    // a record the running engine cannot lay out keeps its own page (shaft design); the preview just shows its data
    return null;
  }
}
