import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { canonicalIdentifier } from '../domain/normalize.js';
import { ACTION_CLASSES } from '../domain/response.js';
import { isVersion } from '../domain/versions.js';

/**
 * Базата с кодове за грешка (FR-04): CRUD + версии. Всеки код сочи публикуван документ-източник
 * (без източник AI не може да го цитира). Нова версия при публикуване отписва предишната със
 * същата валидност (модел + HW + обхват на FW). Публикува се от DRAFT или REVIEW (след нова
 * ревизия на източника — `relink`).
 */

const Id = z.string().min(1).max(40);
const version = z.string().trim().max(20).refine(isVersion, 'версия като 4.2.1');

const ErrorInput = z.object({
  productModel: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(4000),
  subsystem: z.string().trim().max(60).optional(),
  severity: z.enum(['INFO', 'WARNING', 'FAULT', 'CRITICAL']),
  safetyRelevant: z.boolean(),
  hwRevision: z.string().trim().max(20).optional(),
  fwMin: version.optional(),
  fwMax: version.optional(),
  sourceDocumentId: Id,
  sourcePage: z.number().int().min(1).max(100000).optional(),
  relations: z
    .array(
      z.object({
        kind: z.enum(['SYMPTOM', 'CAUSE', 'CHECK', 'FIX']),
        text: z.string().trim().min(2).max(1000),
        expected: z.string().trim().max(400).optional(),
        actionClass: z.enum(ACTION_CLASSES).default('INFORMATIVE'),
        sourcePage: z.number().int().min(1).max(100000).optional(),
      }),
    )
    .max(40),
});

const RelinkInput = z
  .object({ sourceDocumentId: Id, sourcePage: z.number().int().min(1).max(100000).optional() })
  .strict();

export function adminErrorsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  router.post('/errors', async (req, res, next) => {
    try {
      const parsed = ErrorInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const input = parsed.data;
      const product = await deps.db.product.findUnique({
        where: { tenantId_model: { tenantId: p.user.tenantId, model: input.productModel } },
      });
      if (!product) return apiError(res, 422, 'unknown_product');
      const source = await deps.db.document.findFirst({
        where: { id: input.sourceDocumentId, tenantId: p.user.tenantId },
      });
      if (!source) return apiError(res, 422, 'unknown_source_document');
      const code = canonicalIdentifier(input.code);
      const latest = await deps.db.errorCode.findFirst({
        where: { productId: product.id, code },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const created = await deps.db.errorCode.create({
        data: {
          tenantId: p.user.tenantId,
          productId: product.id,
          code,
          title: input.title,
          description: input.description,
          subsystem: input.subsystem ?? null,
          severity: input.severity,
          safetyRelevant: input.safetyRelevant,
          hwRevision: input.hwRevision ?? null,
          fwMin: input.fwMin ?? null,
          fwMax: input.fwMax ?? null,
          version: (latest?.version ?? 0) + 1,
          sourceDocumentId: source.id,
          sourcePage: input.sourcePage ?? null,
          relations: {
            create: input.relations.map((r, i) => ({
              kind: r.kind,
              ordinal: i + 1,
              text: r.text,
              expected: r.expected ?? null,
              actionClass: r.actionClass,
              sourceDocumentId: source.id,
              sourcePage: r.sourcePage ?? input.sourcePage ?? null,
            })),
          },
        },
      });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'kb.error.create',
        objectType: 'error',
        objectId: created.id,
        detail: { code, version: created.version },
      });
      res.status(201).json({ errorId: created.id, version: created.version });
    } catch (err) {
      next(err);
    }
  });

  router.post('/errors/:id/publish', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const entry = await deps.db.errorCode.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
        include: { sourceDocument: true },
      });
      if (!entry) return apiError(res, 404, 'not_found');
      if (entry.status !== 'DRAFT' && entry.status !== 'REVIEW') {
        return apiError(res, 409, 'invalid_transition');
      }
      if (entry.sourceDocument?.status !== 'PUBLISHED') {
        return apiError(res, 422, 'source_not_published');
      }
      await deps.db.$transaction(async (tx) => {
        await tx.errorCode.updateMany({
          where: {
            productId: entry.productId,
            code: entry.code,
            hwRevision: entry.hwRevision,
            fwMin: entry.fwMin,
            fwMax: entry.fwMax,
            status: 'PUBLISHED',
            id: { not: entry.id },
          },
          data: { status: 'DEPRECATED' },
        });
        await tx.errorCode.update({ where: { id: entry.id }, data: { status: 'PUBLISHED' } });
      });
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'kb.error.publish',
        objectType: 'error',
        objectId: entry.id,
        detail: { code: entry.code, version: entry.version },
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Нова ревизия на документа-източник прави кода REVIEW (не изчезва тихо): отговорникът го
  // свързва с публикувания нов документ и го публикува отново. Страниците на старата ревизия не
  // важат за новата — проверките, сочили стария документ, получават новата страница (или нищо).
  router.post('/errors/:id/relink', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = RelinkInput.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const entry = await deps.db.errorCode.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
      });
      if (!entry) return apiError(res, 404, 'not_found');
      if (entry.status !== 'DRAFT' && entry.status !== 'REVIEW') {
        return apiError(res, 409, 'invalid_transition');
      }
      const source = await deps.db.document.findFirst({
        where: { id: body.data.sourceDocumentId, tenantId: p.user.tenantId },
        include: { applicability: { select: { productId: true } } },
      });
      if (!source) return apiError(res, 422, 'unknown_source_document');
      if (source.status !== 'PUBLISHED') return apiError(res, 422, 'source_not_published');
      if (!source.applicability.some((a) => a.productId === entry.productId)) {
        return apiError(res, 422, 'source_not_applicable');
      }
      const page = body.data.sourcePage ?? null;
      await deps.db.$transaction(async (tx) => {
        await tx.errorCode.update({
          where: { id: entry.id },
          data: { sourceDocumentId: source.id, sourcePage: page },
        });
        if (entry.sourceDocumentId) {
          await tx.errorRelation.updateMany({
            where: { errorId: entry.id, sourceDocumentId: entry.sourceDocumentId },
            data: { sourceDocumentId: source.id, sourcePage: page },
          });
        }
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'kb.error.relink',
          objectType: 'error',
          objectId: entry.id,
          detail: {
            code: entry.code,
            version: entry.version,
            from: entry.sourceDocumentId,
            to: source.id,
            page,
          },
        });
      });
      res.json({
        errorId: entry.id,
        status: entry.status,
        sourceDocumentId: source.id,
        sourcePage: page,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/errors/:id/deprecate', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const updated = await deps.db.errorCode.updateMany({
        where: { id: id.data, tenantId: p.user.tenantId, status: 'PUBLISHED' },
        data: { status: 'DEPRECATED' },
      });
      if (updated.count === 0) return apiError(res, 409, 'invalid_transition');
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'kb.error.deprecate',
        objectType: 'error',
        objectId: id.data,
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
