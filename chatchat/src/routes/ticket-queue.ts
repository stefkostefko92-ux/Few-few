import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { apiError, principalOf, requireCapability, requireUser } from '../auth/guards.js';
import { assignableStaff, ticketQueue } from '../services/tickets/queue.js';

/**
 * Опашката на персонала (FR-09, FR-19): само четене. Списъкът — `case:readAll` (триаж);
 * кандидатите за назначаване — `case:assign`. Без CSRF (само GET).
 */

const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'CLOSED'] as const;

const QueueQuery = z.object({
  view: z.enum(['unassigned', 'mine', 'all']).default('unassigned'),
  status: z
    .string()
    .max(80)
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(STATUSES)).max(STATUSES.length)),
  queue: z.enum(['SUPPORT', 'ENGINEERING']).optional(),
  sort: z.enum(['age', 'updated']).default('age'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(40).optional(),
});

const PeopleQuery = z.object({ q: z.string().trim().max(80).default('') });

export function ticketQueueRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/tickets', requireCapability('case:readAll'), async (req, res, next) => {
    try {
      const q = QueueQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      // Порталът няма `case:readAll`; второ ниво: само вътрешни хора виждат опашката.
      if (p.user.kind !== 'INTERNAL') return apiError(res, 403, 'forbidden');
      res.json(await ticketQueue(deps.db, p, q.data));
    } catch (err) {
      next(err);
    }
  });

  router.get('/tickets/assignees', requireCapability('case:assign'), async (req, res, next) => {
    try {
      const q = PeopleQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      res.json({ people: await assignableStaff(deps.db, principalOf(req), q.data.q) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
