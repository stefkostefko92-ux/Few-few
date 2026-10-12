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
 * Базата с кодове за грешка (FR-04): създаване (DRAFT) и редакция на чернова. Всеки код сочи
 * документ-източник, който важи за модела му (без публикуван източник AI не може да го цитира).
 * Нова версия и пресвързване — `admin-errors-versions.ts`; преходите (submit → REVIEW → publish с
 * четири очи, отписване, възстановяване) — `admin-errors-lifecycle.ts`. Публикувана версия е
 * неизменима: промяна = нова версия (DRAFT).
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

  // Източникът е от клиента и важи за модела на кода (§7.3: без приложимост — не е източник).
  const sourceFor = async (tenantId: string, id: string, productId: string) => {
    const doc = await deps.db.document.findFirst({
      where: { id, tenantId },
      select: { id: true, applicability: { select: { productId: true } } },
    });
    if (!doc) return { ok: false as const, code: 'unknown_source_document' };
    if (!doc.applicability.some((a) => a.productId === productId)) {
      return { ok: false as const, code: 'source_not_applicable' };
    }
    return { ok: true as const, id: doc.id };
  };

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
      const source = await sourceFor(p.user.tenantId, input.sourceDocumentId, product.id);
      if (!source.ok) return apiError(res, 422, source.code);
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
        const source = await sourceFor(p.user.tenantId, fields.sourceDocumentId, entry.productId);
        if (!source.ok) return apiError(res, 422, source.code);
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

  return router;
}
