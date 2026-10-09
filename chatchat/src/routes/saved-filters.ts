import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCsrf, requireUser } from '../auth/guards.js';
import { can } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import { FILTER_SCOPES, parseFilter, type FilterScope } from '../services/filters.js';

/**
 * Запазени филтри (FR-23): лични или споделени в клиента. Филтърът се валидира срещу позволените
 * полета на обхвата (`services/filters.ts`) — в базата не влиза нищо друго. Споделените виждат
 * само вътрешните хора: порталният техник има свои филтри, не вижда имената на вътрешните.
 */

const Scope = z.enum(FILTER_SCOPES);
const ListQuery = z.object({ scope: Scope }).strict();
const CreateFilter = z
  .object({
    scope: Scope,
    name: z.string().trim().min(1).max(80),
    filter: z.record(z.string(), z.unknown()),
    shared: z.boolean().default(false),
  })
  .strict();
const Id = z.string().min(1).max(40);

/** Таван на личните филтри на човек в един обхват. */
const MAX_PER_SCOPE = 50;

function scopeAllowed(p: Principal, scope: FilterScope): boolean {
  return scope !== 'USERS' || can(p.user.role, 'users:manage');
}

function view(
  p: Principal,
  f: {
    id: string;
    userId: string;
    scope: string;
    name: string;
    filter: unknown;
    shared: boolean;
    createdAt: Date;
  },
) {
  return {
    id: f.id,
    scope: f.scope,
    name: f.name,
    filter: f.filter,
    shared: f.shared,
    mine: f.userId === p.user.id,
    createdAt: f.createdAt,
  };
}

export function savedFiltersRouter(deps: AppDeps): Router {
  const router = Router();
  const guard = [requireUser, requireCsrf(deps.publicOrigin)];

  router.get('/saved-filters', ...guard, async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      if (!scopeAllowed(p, q.data.scope)) return apiError(res, 403, 'forbidden');
      const rows = await deps.db.savedFilter.findMany({
        where: {
          tenantId: p.user.tenantId,
          scope: q.data.scope,
          OR: [{ userId: p.user.id }, ...(p.user.kind === 'INTERNAL' ? [{ shared: true }] : [])],
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      res.json({ filters: rows.map((f) => view(p, f)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/saved-filters', ...guard, async (req, res, next) => {
    try {
      const body = CreateFilter.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const { scope, name, shared } = body.data;
      if (!scopeAllowed(p, scope)) return apiError(res, 403, 'forbidden');
      if (shared && p.user.kind !== 'INTERNAL') return apiError(res, 403, 'forbidden');
      const filter = parseFilter(scope, body.data.filter);
      if (!filter.ok) return apiError(res, 400, 'invalid_filter');
      const own = await deps.db.savedFilter.count({ where: { userId: p.user.id, scope } });
      if (own >= MAX_PER_SCOPE) return apiError(res, 409, 'too_many_filters');
      const created = await deps.db.savedFilter.create({
        data: {
          tenantId: p.user.tenantId,
          userId: p.user.id,
          scope,
          name,
          filter: filter.filter as object,
          shared,
        },
      });
      res.status(201).json({ filter: view(p, created) });
    } catch (err) {
      next(err);
    }
  });

  // Трие собственикът; споделен филтър — и администраторът на потребителите. Иначе „няма такъв“.
  router.delete('/saved-filters/:id', ...guard, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const row = await deps.db.savedFilter.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
      });
      const allowed =
        row !== null &&
        (row.userId === p.user.id || (row.shared && can(p.user.role, 'users:manage')));
      if (!row || !allowed) return apiError(res, 404, 'not_found');
      await deps.db.savedFilter.delete({ where: { id: row.id } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
