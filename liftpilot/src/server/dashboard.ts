import 'server-only';
// The dashboard's reads, scoped to the signed-in user's company like every read (queries.ts): the counts of its
// records for the tiles, and the plan of the latest installation's shaft for the preview — drawn by the running engine
// from what was entered, the same view as the shaft design's page.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { previews } from '@/lib/tavole/views';
import { layout } from '@/shaft';

const DAY_MS = 86_400_000;
/** The tiles' recent window [days]. */
export const RECENT_DAYS = 30;

export interface RecordCounts {
  /** drawing sets issued (first issues: revision 0) and their revisions, all time, archived installations included */
  sets: number;
  revisions: number;
  /** calculations saved (each save of an installation's form saves one) and installations created in the window */
  recentCalcs: number;
  recentProjects: number;
}

export async function recordCounts(user: SessionUser, now: Date = new Date()): Promise<RecordCounts> {
  const companyId = user.companyId, since = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
  const [sets, revisions, recentCalcs, recentProjects] = await Promise.all([
    prisma.drawingSet.count({ where: { companyId, revision: 0 } }),
    prisma.drawingSet.count({ where: { companyId, revision: { gt: 0 } } }),
    prisma.calculation.count({ where: { companyId, createdAt: { gte: since } } }),
    prisma.project.count({ where: { companyId, createdAt: { gte: since } } }),
  ]);
  return { sets, revisions, recentCalcs, recentProjects };
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
