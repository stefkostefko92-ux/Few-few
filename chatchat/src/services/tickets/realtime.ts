import type { Role } from '@prisma/client';
import { can, ROLES } from '../../auth/rbac.js';
import type { Authorizer } from '../../realtime/hub.js';
import { isStaff, loadViewers, type Viewer } from '../collab/access.js';
import type { CollabDeps } from '../collab/publish.js';

/**
 * Събитията в реално време на работния поток (FR-09, FR-19, §11.2) през същия хъб: кандидатите
 * се изчисляват в опашката, а правото се проверява ОТНОВО при изпращане (`authorize`) — по
 * текущите роля/активност и по ТЕКУЩИЯ създател/поел на случая. Данните са само идентификатори и
 * статуси; съдържанието се чете през REST. Порталът никога не получава `queue.updated`.
 */

type Data = Record<string, unknown>;

/** Ролите, които виждат всички случаи на клиента (триаж) — кандидатите за събития по случай. */
const READ_ALL_ROLES: readonly Role[] = ROLES.filter((r) => can(r, 'case:readAll'));

function fire(deps: CollabDeps, type: string, run: Promise<number>): void {
  run.catch((err: unknown) =>
    deps.logger.warn(
      { type, errName: err instanceof Error ? err.name : 'unknown' },
      'събитие в реално време не беше изпратено',
    ),
  );
}

async function staffIds(deps: CollabDeps, tenantId: string): Promise<string[]> {
  const rows = await deps.db.user.findMany({
    where: { tenantId, active: true, kind: 'INTERNAL', role: { in: [...READ_ALL_ROLES] } },
    select: { id: true },
    take: 500,
  });
  return rows.map((r) => r.id);
}

/** Вижда ли зрителят случая СЕГА: персонал с `case:readAll`, създателят или поелият. */
export function seesCase(
  v: Viewer,
  c: { createdById: string; assignedToId: string | null },
): boolean {
  if (!can(v.role, 'conversation:use')) return false;
  if (isStaff(v) && can(v.role, 'case:readAll')) return true;
  return v.id === c.createdById || v.id === c.assignedToId;
}

/** Събитие по случай (`case.updated`, `step.updated`) — само до хората, които виждат случая. */
export function publishCaseEvent(
  deps: CollabDeps,
  type: 'case.updated' | 'step.updated',
  target: { caseId: string; tenantId: string },
  actorId: string | null,
  build: (viewer: Viewer) => Data | null,
): void {
  if (deps.hub.size() === 0) return;
  const current = () =>
    deps.db.case.findFirst({
      where: { id: target.caseId, tenantId: target.tenantId },
      select: { createdById: true, assignedToId: true },
    });
  const recipients = async () => {
    const c = await current();
    if (!c) return [];
    const ids = [c.createdById, c.assignedToId, ...(await staffIds(deps, target.tenantId))];
    return ids.filter((id): id is string => id !== null);
  };
  const authorize: Authorizer = async (userIds) => {
    const out = new Map<string, Data>();
    const c = await current();
    if (!c) return out;
    const viewers = await loadViewers(deps.db, userIds, target.tenantId);
    for (const [id, v] of viewers) {
      if (!seesCase(v, c)) continue;
      const data = build(v);
      if (data) out.set(id, data);
    }
    return out;
  };
  fire(
    deps,
    type,
    deps.hub.publish({ type, tenantId: target.tenantId, actorId }, recipients, authorize),
  );
}

/** Опашката на персонала (`queue.updated`): само вътрешни хора с `case:readAll`; без съдържание. */
export function publishQueueEvent(
  deps: CollabDeps,
  tenantId: string,
  actorId: string | null,
  data: { ticketId: string; caseId: string; status: string; queue: string },
): void {
  if (deps.hub.size() === 0) return;
  const authorize: Authorizer = async (userIds) => {
    const viewers = await loadViewers(deps.db, userIds, tenantId);
    const out = new Map<string, Data>();
    for (const [id, v] of viewers) {
      if (isStaff(v) && can(v.role, 'case:readAll') && can(v.role, 'conversation:use')) {
        out.set(id, { ...data });
      }
    }
    return out;
  };
  fire(
    deps,
    'queue.updated',
    deps.hub.publish(
      { type: 'queue.updated', tenantId, actorId },
      () => staffIds(deps, tenantId),
      authorize,
    ),
  );
}
