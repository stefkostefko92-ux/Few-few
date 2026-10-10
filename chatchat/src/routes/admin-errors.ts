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
import { withAuthor } from '../services/kb-lifecycle.js';

/**
 * Базата с кодове за грешка (FR-04): създаване (DRAFT), редакция на чернова, нова версия и
 * пресвързване. Всеки код сочи документ-източник (без публикуван източник AI не може да го
 * цитира). Преходите (submit → REVIEW → publish с четири очи, отписване, възстановяване) са в
 * `admin-errors-lifecycle.ts`. Публикувана версия е неизменима: промяна = нова версия (DRAFT).
 */

const Id = z.string().min(1).max(40);
const version = z.string().trim().max(20).refine(isVersion, 'версия като 4.2.1');

const RelationInput = z.object({
  kind: z.enum(['SYMPTOM', 'CAUSE', 'CHECK', 'FIX']),
  text: z.string().trim().min(2).max(1000),
  expected: z.string().trim().max(400).optional(),
  actionClass: z.enum(ACTION_CLASSES).default('INFORMATIVE'),
  sourcePage: z.number().int().min(1).max(100000).optional(),
});

const EditableFields = z.object({
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
  relations: z.array(RelationInput).max(40),
});

const ErrorInput = EditableFields.extend({
  productModel: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(20),
});

/** Редакция на чернова: всяко поле по избор; null изчиства незадължително поле. */
const ErrorPatch = EditableFields.extend({
  subsystem: z.string().trim().max(60).nullable().optional(),
  hwRevision: z.string().trim().max(20).nullable().optional(),
  fwMin: version.nullable().optional(),
  fwMax: version.nullable().optional(),
  sourcePage: z.number().int().min(1).max(100000).nullable().optional(),
})
  .partial()
  .strict();

const RelinkInput = z
  .object({ sourceDocumentId: Id, sourcePage: z.number().int().min(1).max(100000).optional() })
  .strict();

type Relation = z.infer<typeof RelationInput>;
const relationRows = (relations: Relation[], sourceId: string, page: number | null) =>
  relations.map((r, i) => ({
    kind: r.kind,
    ordinal: i + 1,
    text: r.text,
    expected: r.expected ?? null,
    actionClass: r.actionClass,
    sourceDocumentId: sourceId,
    sourcePage: r.sourcePage ?? page,
  }));

export function adminErrorsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  const sourceIn = (tenantId: string, id: string) =>
    deps.db.document.findFirst({ where: { id, tenantId }, select: { id: true } });

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
      const source = await sourceIn(p.user.tenantId, input.sourceDocumentId);
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
          authorIds: [p.user.id],
          relations: {
            create: relationRows(input.relations, source.id, input.sourcePage ?? null),
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

  // Редакция САМО на чернова (FR-04): прегледаната/публикуваната версия не се пипа.
  router.patch('/errors/:id', async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const body = ErrorPatch.safeParse(req.body);
      if (!id.success || !body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const entry = await deps.db.errorCode.findFirst({
        where: { id: id.data, tenantId: p.user.tenantId },
      });
      if (!entry) return apiError(res, 404, 'not_found');
      if (entry.status !== 'DRAFT') return apiError(res, 409, 'invalid_transition');
      const { relations, ...fields } = body.data;
      let sourceId = entry.sourceDocumentId;
      if (fields.sourceDocumentId) {
        const source = await sourceIn(p.user.tenantId, fields.sourceDocumentId);
        if (!source) return apiError(res, 422, 'unknown_source_document');
        sourceId = source.id;
      }
      const page = fields.sourcePage === undefined ? entry.sourcePage : fields.sourcePage;
      await deps.db.$transaction(async (tx) => {
        await tx.errorCode.update({
          where: { id: entry.id },
          data: { ...fields, authorIds: withAuthor(entry.authorIds, p.user.id) },
        });
        if (relations && sourceId) {
          await tx.errorRelation.deleteMany({ where: { errorId: entry.id } });
          await tx.errorRelation.createMany({
            data: relationRows(relations, sourceId, page).map((r) => ({ ...r, errorId: entry.id })),
          });
        } else if (sourceId && entry.sourceDocumentId && sourceId !== entry.sourceDocumentId) {
          // Нов източник без нови връзки: проверките, сочили стария, сочат новия (като relink).
          await tx.errorRelation.updateMany({
            where: { errorId: entry.id, sourceDocumentId: entry.sourceDocumentId },
            data: { sourceDocumentId: sourceId, sourcePage: page },
          });
        }
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'kb.error.update',
          objectType: 'error',
          objectId: entry.id,
          // Само кои полета — не съдържанието им.
          detail: {
            code: entry.code,
            version: entry.version,
            fields: Object.keys(body.data).sort(),
          },
        });
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

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
