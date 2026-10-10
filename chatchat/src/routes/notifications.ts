import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { apiError, requireCapability, requireCsrf, requireUser } from '../auth/guards.js';
import {
  conversationPreferences,
  decodeNotificationCursor,
  notificationPage,
  preferencesOf,
  preferencesView,
  PreferencesInput,
  updatePreferences,
} from '../services/collab/notification-prefs.js';
import { Id, perUserLimit, viewerOf } from './collab-common.js';

/**
 * Известията на човека (FR-18, §14.1 GET /notifications — „notifiche e preferenze per utente“):
 * непрочетените първо, курсор, брой, личните предпочитания (имейл, дайджест, тихи часове) и
 * тези по разговор; маркиране като прочетени; промяна на личните предпочитания.
 */

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(300).optional(),
});
const ReadInput = z.union([
  z.object({ ids: z.array(Id).min(1).max(200) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

export function notificationsRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const use = requireCapability('conversation:use');
  const prefsLimit = perUserLimit(60 * 1000, 30, 'notification-prefs');
  const emailAvailable = () => Boolean(deps.mail);

  router.get('/notifications', use, async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const cursor = q.data.cursor ? decodeNotificationCursor(q.data.cursor) : null;
      if (q.data.cursor && !cursor) return apiError(res, 400, 'invalid_cursor');
      const viewer = viewerOf(req);
      const [page, unreadCount, prefs, conversations] = await Promise.all([
        notificationPage(deps.db, viewer, cursor, q.data.limit),
        deps.db.notification.count({
          where: { userId: viewer.id, tenantId: viewer.tenantId, readAt: null },
        }),
        preferencesOf(deps.db, viewer.id),
        conversationPreferences(deps.db, viewer),
      ]);
      res.json({
        unreadCount,
        ...page,
        preferences: { ...preferencesView(prefs, emailAvailable()), conversations },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/notifications/preferences', use, prefsLimit, async (req, res, next) => {
    try {
      const body = PreferencesInput.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const viewer = viewerOf(req);
      const prefs = await updatePreferences(deps.db, viewer, body.data);
      res.json({ preferences: preferencesView(prefs, emailAvailable()) });
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
