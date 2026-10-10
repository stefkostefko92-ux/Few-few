import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sharedStore } from '../auth/rate-limit.js';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireUser } from '../auth/guards.js';
import { audiencesFor } from '../auth/rbac.js';
import { hashToken } from '../crypto.js';
import { canonicalIdentifier } from '../domain/normalize.js';
import { isApplicable, validityAt } from '../domain/versions.js';
import { deviceView, deviceVisible, QR_TOKEN } from '../services/devices.js';

/** Справочни крайни точки (§14.1): продукти, табла, кодове за грешка, страница на документ. */

const SearchQuery = z.object({ q: z.string().trim().max(80).default('') });
const Serial = z.string().trim().min(1).max(80);
const ErrorQuery = z.object({
  model: z.string().trim().min(1).max(80),
  hw: z.string().trim().max(20).optional(),
  fw: z.string().trim().max(20).optional(),
});

export function catalogRouter(deps: AppDeps): Router {
  const router = Router();
  // Справките са евтини, но изброяването на сериини номера/кодове не бива да е безплатно.
  const lookupLimiter = rateLimit({
    store: sharedStore('catalog-lookup'),
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
    handler: (_req, res) => apiError(res, 429, 'too_many_requests'),
  });
  router.use(['/products', '/devices', '/errors', '/documents'], requireUser, lookupLimiter);

  router.get('/products/search', async (req, res, next) => {
    try {
      const parsed = SearchQuery.safeParse(req.query);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const { tenantId } = principalOf(req).user;
      const q = parsed.data.q;
      const products = await deps.db.product.findMany({
        where: {
          tenantId,
          ...(q
            ? {
                OR: [
                  { model: { contains: q, mode: 'insensitive' } },
                  { family: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { revisions: { orderBy: { hwRevision: 'asc' } } },
        orderBy: [{ family: 'asc' }, { model: 'asc' }],
        take: 25,
      });
      res.json({
        products: products.map((p) => ({
          id: p.id,
          family: p.family,
          model: p.model,
          description: p.description,
          revisions: p.revisions.map((r) => ({
            hwRevision: r.hwRevision,
            fwMin: r.fwMin,
            fwMax: r.fwMax,
          })),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // FR-13: таблото по токена от QR етикета — същите правила за видимост като по сериен номер.
  // В базата е само HMAC на токена; непознат, стар (подменен) или чужд токен е един и същ 404.
  router.get('/devices/by-qr/:token', async (req, res, next) => {
    try {
      const token = z.string().regex(QR_TOKEN).safeParse(req.params.token);
      if (!token.success) return apiError(res, 404, 'not_found');
      const { user } = principalOf(req);
      const device = await deps.db.device.findUnique({
        where: { qrTokenHash: hashToken(token.data, deps.sessions.pepper) },
        include: { revision: { include: { product: true } } },
      });
      if (!device || !deviceVisible(user, device)) return apiError(res, 404, 'not_found');
      res.json({ device: deviceView(device) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/devices/:serial', async (req, res, next) => {
    try {
      const parsed = Serial.safeParse(req.params.serial);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const { user } = principalOf(req);
      const device = await deps.db.device.findUnique({
        where: { tenantId_serial: { tenantId: user.tenantId, serial: parsed.data } },
        include: { revision: { include: { product: true } } },
      });
      // Порталът вижда само таблата на своята фирма; чуждото е „няма такова“, не „забранено“.
      if (!device || !deviceVisible(user, device)) return apiError(res, 404, 'not_found');
      res.json({ device: deviceView(device) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/errors/:code', async (req, res, next) => {
    try {
      const code = z.string().trim().min(1).max(20).safeParse(req.params.code);
      const query = ErrorQuery.safeParse(req.query);
      if (!code.success || !query.success) return apiError(res, 400, 'invalid_input');
      const { user } = principalOf(req);
      const audiences = [...audiencesFor(user.role)];
      const errors = await deps.db.errorCode.findMany({
        where: {
          tenantId: user.tenantId,
          code: canonicalIdentifier(code.data),
          status: 'PUBLISHED',
          product: { model: query.data.model, tenantId: user.tenantId },
          sourceDocument: { status: 'PUBLISHED', audience: { in: audiences } },
        },
        include: { relations: { orderBy: { ordinal: 'asc' } }, sourceDocument: true },
        take: 10,
      });
      const version = { hwRevision: query.data.hw ?? null, firmware: query.data.fw ?? null };
      const now = new Date();
      res.json({
        errors: errors.map((e) => ({
          code: e.code,
          title: e.title,
          description: e.description,
          severity: e.severity,
          safetyRelevant: e.safetyRelevant,
          // Кодът важи, докато важи документът му (§7.2 effectiveFrom/To).
          applicable:
            isApplicable({ hwRevision: e.hwRevision, fwMin: e.fwMin, fwMax: e.fwMax }, version) &&
            (e.sourceDocument === null || validityAt(e.sourceDocument, now) === 'effective'),
          validity: { hwRevision: e.hwRevision, fwMin: e.fwMin, fwMax: e.fwMax },
          relations: e.relations.map((r) => ({
            kind: r.kind,
            ordinal: r.ordinal,
            text: r.text,
            expected: r.expected,
            actionClass: r.actionClass,
          })),
          source: e.sourceDocument
            ? {
                documentId: e.sourceDocument.id,
                documentCode: e.sourceDocument.code,
                revision: e.sourceDocument.revision,
                page: e.sourcePage,
              }
            : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
