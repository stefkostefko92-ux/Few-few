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
import { DocumentInputSchema, ingestDocument } from '../services/ingest.js';

/**
 * Управление на знанието (§4.1, §11.3, AC-10): Draft → Review → Published → Deprecated.
 * Публикуване и отписване на ревизия НЕ иска преобучение — AI вижда само PUBLISHED.
 * Документ по безопасност: публикува го човек, различен от качилия (принцип на четирите очи).
 * Нова ревизия (supersedes): кодовете за грешка на старата стават REVIEW и се връщат в отговора.
 */

const Id = z.string().min(1).max(40);
const ListQuery = z.object({
  status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED']).optional(),
});

type Transition = 'submit' | 'reject' | 'publish' | 'deprecate';
const FROM: Record<Transition, string> = {
  submit: 'DRAFT',
  reject: 'REVIEW',
  publish: 'REVIEW',
  deprecate: 'PUBLISHED',
};

export function adminDocumentsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  router.get('/documents', async (req, res, next) => {
    try {
      const q = ListQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const { tenantId } = principalOf(req).user;
      const docs = await deps.db.document.findMany({
        where: { tenantId, ...(q.data.status ? { status: q.data.status } : {}) },
        include: {
          applicability: { include: { product: { select: { model: true } } } },
          _count: { select: { chunks: true } },
        },
        orderBy: [{ code: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      });
      res.json({
        documents: docs.map((d) => ({
          id: d.id,
          code: d.code,
          title: d.title,
          type: d.type,
          language: d.language,
          revision: d.revision,
          status: d.status,
          audience: d.audience,
          safetyRelevant: d.safetyRelevant,
          checksum: d.checksum,
          chunks: d._count.chunks,
          supersedesId: d.supersedesId,
          applicability: d.applicability.map((a) => ({
            productModel: a.product.model,
            hwRevision: a.hwRevision,
            fwMin: a.fwMin,
            fwMax: a.fwMax,
          })),
          publishedAt: d.publishedAt,
          deprecatedAt: d.deprecatedAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents', async (req, res, next) => {
    try {
      const parsed = DocumentInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_input',
          code: 'invalid_input',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }
      const p = principalOf(req);
      const result = await ingestDocument(deps.db, p.user.tenantId, p.user.id, parsed.data);
      if (!result.ok) {
        const status = result.error.code === 'duplicate_revision' ? 409 : 422;
        return res.status(status).json({ error: result.error.code, ...result.error });
      }
      await appendAudit(deps.db, {
        tenantId: p.user.tenantId,
        actorId: p.user.id,
        action: 'kb.document.upload',
        objectType: 'document',
        objectId: result.documentId,
        detail: { code: parsed.data.code, revision: parsed.data.revision, chunks: result.chunks },
      });
      res.status(201).json({ documentId: result.documentId, chunks: result.chunks });
    } catch (err) {
      next(err);
    }
  });

  const transition = (action: Transition) =>
    router.post(`/documents/:id/${action}`, async (req, res, next) => {
      try {
        const id = Id.safeParse(req.params.id);
        if (!id.success) return apiError(res, 400, 'invalid_input');
        const p = principalOf(req);
        const doc = await deps.db.document.findFirst({
          where: { id: id.data, tenantId: p.user.tenantId },
          include: { _count: { select: { chunks: true, applicability: true } } },
        });
        if (!doc) return apiError(res, 404, 'not_found');
        if (doc.status !== FROM[action]) return apiError(res, 409, 'invalid_transition');
        const now = new Date();
        let errorsToReview: Array<{ id: string; code: string; version: number }> | null = null;

        if (action === 'publish') {
          // §7.3: търсим само с достатъчно метаданни за приложимостта.
          if (doc._count.chunks === 0 || doc._count.applicability === 0) {
            return apiError(res, 422, 'insufficient_metadata');
          }
          if (doc.safetyRelevant && doc.uploadedById === p.user.id) {
            return apiError(res, 409, 'four_eyes_required');
          }
          errorsToReview = await deps.db.$transaction(async (tx) => {
            await tx.document.update({
              where: { id: doc.id },
              data: {
                status: 'PUBLISHED',
                approvedById: p.user.id,
                approvedAt: now,
                publishedAt: now,
              },
            });
            if (!doc.supersedesId) return null;
            await tx.document.updateMany({
              where: { id: doc.supersedesId, tenantId: p.user.tenantId, status: 'PUBLISHED' },
              data: { status: 'DEPRECATED', deprecatedAt: now },
            });
            // Решение на собственика: кодовете на отписаната ревизия не изчезват тихо — стават
            // REVIEW (AI не ги вижда) и отговорникът ги свързва с новия документ (`relink`).
            const affected = await tx.errorCode.findMany({
              where: {
                tenantId: p.user.tenantId,
                sourceDocumentId: doc.supersedesId,
                status: 'PUBLISHED',
              },
              select: { id: true, code: true, version: true },
              orderBy: [{ code: 'asc' }, { version: 'asc' }],
            });
            if (affected.length > 0) {
              await tx.errorCode.updateMany({
                where: { id: { in: affected.map((e) => e.id) }, status: 'PUBLISHED' },
                data: { status: 'REVIEW' },
              });
            }
            for (const e of affected) {
              await appendAudit(tx, {
                tenantId: p.user.tenantId,
                actorId: p.user.id,
                action: 'kb.error.review_required',
                objectType: 'error',
                objectId: e.id,
                detail: { code: e.code, version: e.version, supersededDocument: doc.supersedesId },
              });
            }
            return affected;
          });
        } else {
          const data =
            action === 'submit'
              ? { status: 'REVIEW' as const }
              : action === 'reject'
                ? { status: 'DRAFT' as const, reviewedById: p.user.id }
                : { status: 'DEPRECATED' as const, deprecatedAt: now };
          await deps.db.document.update({ where: { id: doc.id }, data });
        }

        await appendAudit(deps.db, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: `kb.document.${action}`,
          objectType: 'document',
          objectId: doc.id,
          detail: {
            code: doc.code,
            revision: doc.revision,
            supersedes: doc.supersedesId,
            ...(errorsToReview ? { errorsToReview: errorsToReview.map((e) => e.id) } : {}),
          },
        });
        // Публикуване на нова ревизия връща кодовете за преглед; останалите преходи — 204.
        if (errorsToReview) return res.json({ errorsToReview });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    });

  transition('submit');
  transition('reject');
  transition('publish');
  transition('deprecate');

  return router;
}
