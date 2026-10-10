import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { sharedStore } from '../auth/rate-limit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import {
  getIntegrationView,
  testIntegration,
  UpdateInput,
  updateIntegration,
  type AdminResult,
} from '../services/integrations/admin-config.js';
import { listDeliveries, LogQuery, replayDelivery } from '../services/integrations/admin-log.js';
import { EXTERNAL_PAYLOAD_VERSION } from '../services/integrations/payload.js';

/**
 * Админ API на интеграцията с helpdesk (FR-09, §14.4) — само `integrations:manage` (администраторът
 * на клиента, с втори фактор), всичко по tenantId на човека. Без INTEGRATION_KEK → 503
 * `integrations_unavailable` (тайните няма с какво да се шифроват). Тайните никога не излизат:
 * изгледът казва само „зададена ли е“.
 *   GET  /admin/integrations                       настройката + бройки по статус
 *   PUT  /admin/integrations                       запис (вид, включен, настройка, тайни)
 *   POST /admin/integrations/test                  тест на връзката със записаната настройка
 *   GET  /admin/integrations/deliveries            дневникът (status, limit, after)
 *   POST /admin/integrations/deliveries/:id/replay повторно пускане от dead-letter
 */

const Id = z.string().trim().min(1).max(40);

function send<T>(res: Response, result: AdminResult<T>, ok: (value: T) => unknown): void {
  if (result.ok) {
    res.json(ok(result.value));
    return;
  }
  res.status(result.status).json({
    error: result.code,
    code: result.code,
    ...(result.fields ? { fields: result.fields } : {}),
  });
}

export function adminIntegrationsRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use('/integrations', requireUser, requireCsrf(deps.publicOrigin));
  const manage = requireCapability('integrations:manage');

  // Тестът ходи навън — по човек, не по IP (администраторите са зад един NAT).
  const testLimiter = rateLimit({
    store: sharedStore('integrations-test'),
    windowMs: 60 * 1000,
    limit: 6,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });

  router.get('/integrations', manage, async (req, res, next) => {
    try {
      const p = principalOf(req);
      const integrations = deps.integrations;
      if (!integrations) {
        res.json({ available: false, integration: null, payloadVersion: EXTERNAL_PAYLOAD_VERSION });
        return;
      }
      const [integration, log] = await Promise.all([
        getIntegrationView(deps.db, integrations, p.user.tenantId),
        listDeliveries(deps.db, p.user.tenantId, { limit: 1 }),
      ]);
      res.json({
        available: true,
        integration,
        counts: log.counts,
        payloadVersion: EXTERNAL_PAYLOAD_VERSION,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/integrations', manage, async (req, res, next) => {
    try {
      if (!deps.integrations) return apiError(res, 503, 'integrations_unavailable');
      const body = UpdateInput.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const result = await updateIntegration(
        deps.db,
        deps.integrations,
        principalOf(req),
        body.data,
      );
      send(res, result, (integration) => ({ integration }));
    } catch (err) {
      next(err);
    }
  });

  router.post('/integrations/test', manage, testLimiter, async (req, res, next) => {
    try {
      if (!deps.integrations) return apiError(res, 503, 'integrations_unavailable');
      const result = await testIntegration(deps.db, deps.integrations, principalOf(req));
      send(res, result, (test) => ({ test }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/integrations/deliveries', manage, async (req, res, next) => {
    try {
      const q = LogQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      res.json(await listDeliveries(deps.db, principalOf(req).user.tenantId, q.data));
    } catch (err) {
      next(err);
    }
  });

  router.post('/integrations/deliveries/:id/replay', manage, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 404, 'not_found');
      const result = await replayDelivery(deps.db, principalOf(req), id.data);
      send(res, result, (delivery) => ({ delivery }));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
