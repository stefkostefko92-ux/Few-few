import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireUser } from '../auth/guards.js';
import { audiencesFor, can } from '../auth/rbac.js';
import { canonicalIdentifier } from '../domain/normalize.js';
import { isApplicable } from '../domain/versions.js';

/** Справочни крайни точки (§14.1): продукти, табла, кодове за грешка, страница на документ. */

const SearchQuery = z.object({ q: z.string().trim().max(80).default('') });
const Serial = z.string().trim().min(1).max(80);
const ErrorQuery = z.object({
  model: z.string().trim().min(1).max(80),
  hw: z.string().trim().max(20).optional(),
  fw: z.string().trim().max(20).optional(),
});
const PageParams = z.object({
  id: z.string().min(1).max(40),
  page: z.coerce.number().int().min(1).max(100000),
});

export function catalogRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser);

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
      const visible =
        device !== null &&
        (can(user.role, 'device:readAll') ||
          (user.companyId !== null && device.companyId === user.companyId));
      if (!device || !visible) return apiError(res, 404, 'not_found');
      res.json({
        device: {
          serial: device.serial,
          productModel: device.revision.product.model,
          family: device.revision.product.family,
          hardwareRevision: device.revision.hwRevision,
          firmware: device.firmware,
          options: device.options,
        },
      });
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
      res.json({
        errors: errors.map((e) => ({
          code: e.code,
          title: e.title,
          description: e.description,
          severity: e.severity,
          safetyRelevant: e.safetyRelevant,
          applicable: isApplicable(
            { hwRevision: e.hwRevision, fwMin: e.fwMin, fwMax: e.fwMax },
            version,
          ),
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

  router.get('/documents/:id/pages/:page', async (req, res, next) => {
    try {
      const parsed = PageParams.safeParse(req.params);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const { user } = principalOf(req);
      const document = await deps.db.document.findFirst({
        where: {
          id: parsed.data.id,
          tenantId: user.tenantId,
          status: 'PUBLISHED',
          audience: { in: [...audiencesFor(user.role)] },
        },
        select: { id: true, code: true, title: true, revision: true, type: true },
      });
      if (!document) return apiError(res, 404, 'not_found');
      const chunks = await deps.db.documentChunk.findMany({
        where: { documentId: document.id, page: parsed.data.page },
        orderBy: { ordinal: 'asc' },
        select: { section: true, text: true },
      });
      if (chunks.length === 0) return apiError(res, 404, 'not_found');
      res.json({ document, page: parsed.data.page, chunks });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
