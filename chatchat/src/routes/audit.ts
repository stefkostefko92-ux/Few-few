import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCapability, requireUser } from '../auth/guards.js';

/**
 * Събитията по входа на хората. Администраторът на клиента (работодателят) НЕ ги вижда: това би
 * било дистанционно наблюдение на служителите (чл. 4 Statuto dei Lavoratori, L. 300/1970) —
 * целта на одита е сигурността на системата, не оценка на работата (правният одит, т. 7).
 * Вижда ги само администраторът на платформата (разследване на инцидент).
 */
export const LOGIN_AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.login_failed',
  'auth.mfa_verified',
  'auth.mfa_failed',
] as const;

/** §14.1 GET /audit — одитът на клиента, отзад напред, с курсор. */
export function auditRouter(deps: AppDeps): Router {
  const router = Router();
  // Способността е на самия маршрут: рутерът е монтиран на /api/v1 и не бива да спира чужди пътища.
  router.get('/audit', requireUser, requireCapability('audit:read'), async (req, res, next) => {
    try {
      const q = z
        .object({ before: z.coerce.number().int().positive().optional() })
        .safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const where =
        p.user.role === 'PLATFORM_ADMIN'
          ? {}
          : { tenantId: p.user.tenantId, action: { notIn: [...LOGIN_AUDIT_ACTIONS] } };
      const events = await deps.db.auditEvent.findMany({
        where: { ...where, ...(q.data.before ? { id: { lt: q.data.before } } : {}) },
        orderBy: { id: 'desc' },
        take: 100,
      });
      res.json({
        events,
        next: events.length === 100 ? (events.at(-1)?.id ?? null) : null,
      });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
