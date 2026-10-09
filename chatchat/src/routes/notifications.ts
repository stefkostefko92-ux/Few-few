import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { apiError, requireCapability, requireCsrf, requireUser } from '../auth/guards.js';
import { notificationView } from '../services/collab/notify.js';
import { Id, viewerOf } from './collab-common.js';

/** Известията на човека (FR-18): непрочетените първо, брой; маркиране като прочетени. */

const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
const ReadInput = z.union([
  z.object({ ids: z.array(Id).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export function notificationsRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const use = requireCapability('conversation:use');

  router.get('/notifications', use, async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const where = { userId: viewer.id, tenantId: viewer.tenantId };
      const [rows, unreadCount] = await Promise.all([
        deps.db.notification.findMany({
          where,
          orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
          take: q.data.limit,
        }),
        deps.db.notification.count({ where: { ...where, readAt: null } }),
      ]);
      res.json({ unreadCount, notifications: rows.map(notificationView) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/read', use, async (req, res, next) => {
    try {
      const body = ReadInput.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      // Само собствените известия — чужд id просто не съвпада.
      const result = await deps.db.notification.updateMany({
        where: {
          userId: viewer.id,
          tenantId: viewer.tenantId,
          readAt: null,
          ...('ids' in body.data ? { id: { in: body.data.ids } } : {}),
        },
        data: { readAt: new Date() },
      });
      const unreadCount = await deps.db.notification.count({
        where: { userId: viewer.id, tenantId: viewer.tenantId, readAt: null },
      });
      res.json({ updated: result.count, unreadCount });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
