import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { WiredDeps } from '../app.js';
import { apiError } from '../auth/guards.js';
import { applyInbound } from '../services/integrations/inbound-apply.js';
import { verifyInbound } from '../services/integrations/inbound.js';

/**
 * Входящият webhook от helpdesk-а (обратната синхронизация на статуса, FR-09/§14.4):
 *   POST /api/v1/integrations/inbound/:inboundId
 * Без сесия и без CSRF — удостоверява се САМО с подписа върху суровото тяло (services/integrations/
 * inbound.ts), затова се монтира ПРЕДИ JSON парсера и сесиите; тялото е до 64 KB. Лимити: по IP
 * (срещу изброяване) и по адрес (срещу наводнение на един клиент). Непознат адрес, изключен
 * конектор и грешен подпис връщат един и същ отговор. В лога — само вид и код, никога тялото.
 */

const INBOUND_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function integrationsInboundRouter(deps: WiredDeps): Router {
  const router = Router();
  const perIp = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });
  const perEndpoint = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `inbound:${String(req.params.inboundId ?? '')}`,
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });
  const raw = express.raw({ type: () => true, limit: '64kb' });

  router.post(
    '/integrations/inbound/:inboundId',
    perIp,
    perEndpoint,
    raw,
    async (req, res, next) => {
      try {
        const integrations = deps.integrations;
        const inboundId = String(req.params.inboundId ?? '');
        if (!integrations || !INBOUND_ID.test(inboundId) || !Buffer.isBuffer(req.body)) {
          return apiError(res, 401, 'invalid_signature');
        }
        const integration = await deps.db.helpdeskIntegration.findUnique({ where: { inboundId } });
        if (!integration || !integration.enabled) return apiError(res, 401, 'invalid_signature');
        const verdict = verifyInbound(
          integrations,
          integration,
          req.headers,
          req.body.toString('utf8'),
        );
        if (!verdict.ok) {
          deps.logger.warn(
            { kind: integration.kind, code: verdict.code },
            'входящо от helpdesk отказано',
          );
          return apiError(res, verdict.status, verdict.code);
        }
        const out = await applyInbound(deps, integration, verdict);
        res.json({ ok: true, ...out });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
