import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCapability, requireUser } from '../auth/guards.js';
import { computeKpi, MAX_PERIOD_DAYS } from '../services/kpi/kpi.js';

/**
 * §16.1 GET /admin/kpi — метриките на клиента за период. Само агрегати, k-анонимни, без разбивка
 * по човек (чл. 4 Statuto dei Lavoratori: KPI не е средство за наблюдение на служител). Винаги по
 * `tenantId` на сесията — и за ролите, които виждат всички случаи на клиента.
 */

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const KpiQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    /** Моделът на таблото, както е в контекста на случая (FR-02). */
    model: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 30;

export function adminKpiRouter(deps: AppDeps): Router {
  const router = Router();
  const evalDir = deps.evalReportsDir ?? '';
  // Способността е на самия маршрут: рутерът е монтиран на /admin и не бива да спира чужди пътища.
  router.get('/kpi', requireUser, requireCapability('kpi:read'), async (req, res, next) => {
    try {
      const q = KpiQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const to = q.data.to ?? new Date();
      const from = q.data.from ?? new Date(to.getTime() - DEFAULT_DAYS * DAY_MS);
      const span = to.getTime() - from.getTime();
      if (span <= 0 || span > MAX_PERIOD_DAYS * DAY_MS) {
        return apiError(res, 400, 'invalid_period');
      }
      const tenantId = principalOf(req).user.tenantId;
      const [report, products] = await Promise.all([
        computeKpi(deps.db, { tenantId, from, to, model: q.data.model ?? null }, evalDir),
        deps.db.product.findMany({
          where: { tenantId },
          select: { model: true },
          orderBy: { model: 'asc' },
        }),
      ]);
      res.json({ ...report, models: products.map((m) => m.model) });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
