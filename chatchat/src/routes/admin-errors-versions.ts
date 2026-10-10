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
import { withAuthor } from '../services/kb-lifecycle.js';

/**
 * Версиите на код за грешка (FR-04 „versioning“): нова версия от съществуваща (публикуваната е
 * неизменима — копието е DRAFT с нов номер) и пресвързване на непубликувана версия с друг
 * публикуван документ-източник за същия модел. Версиите не се трият никога.
 */

const Id = z.string().min(1).max(40);
const RelinkInput = z
  .object({ sourceDocumentId: Id, sourcePage: z.number().int().min(1).max(100000).optional() })
  .strict();

export function adminErrorsVersionsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  // Нова версия от съществуваща (публикувана/отписана е неизменима): копие като DRAFT.
  router.post('/errors/:id/new-version', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const entry = await deps.db.errorCode.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
        include: { relations: { orderBy: { ordinal: 'asc' } } },
      });
      if (!entry) return apiError(res, 404, 'not_found');
      const created = await deps.db.$transaction(async (tx) => {
        const latest = await tx.errorCode.findFirst({
          where: { productId: entry.productId, code: entry.code },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const row = await tx.errorCode.create({
          data: {
            tenantId: entry.tenantId,
            productId: entry.productId,
            code: entry.code,
            title: entry.title,
            description: entry.description,
            subsystem: entry.subsystem,
            severity: entry.severity,
            safetyRelevant: entry.safetyRelevant,
            hwRevision: entry.hwRevision,
            fwMin: entry.fwMin,
            fwMax: entry.fwMax,
            version: (latest?.version ?? entry.version) + 1,
            sourceDocumentId: entry.sourceDocumentId,
            sourcePage: entry.sourcePage,
            authorIds: [p.user.id],
            relations: {
              create: entry.relations.map((r) => ({
                kind: r.kind,
                ordinal: r.ordinal,
                text: r.text,
                expected: r.expected,
                actionClass: r.actionClass,
                sourceDocumentId: r.sourceDocumentId,
                sourcePage: r.sourcePage,
              })),
            },
          },
        });
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'kb.error.new_version',
          objectType: 'error',
          objectId: row.id,
          detail: { code: row.code, version: row.version, from: entry.id },
        });
        return row;
      });
      res.status(201).json({ errorId: created.id, version: created.version });
    } catch (err) {
      next(err);
    }
  });

  // Пресвързване на непубликувана версия с друг публикуван документ-източник (напр. нова
  // ревизия). Страниците на стария източник не важат за новия — проверките получават новата.
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
          data: {
            sourceDocumentId: source.id,
            sourcePage: page,
            authorIds: withAuthor(entry.authorIds, p.user.id),
          },
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

  return router;
}
