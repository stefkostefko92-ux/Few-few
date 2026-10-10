import { Router, type Request, type Response } from 'express';
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
import {
  errorsSourcedBy,
  fourEyesBlocked,
  OptionalReasonBody,
  Reason,
  ReasonBody,
  reasonForAudit,
  rejectTarget,
} from '../services/kb-lifecycle.js';

/**
 * Жизненият цикъл на документа (§4.1, §11.3, FR-11, AC-10) — само преходи на статуса, никога
 * редакция (документите са неизменими и се пазят завинаги — решение на собственика):
 *   submit    DRAFT → REVIEW
 *   reject    REVIEW → DRAFT (никога публикуван) | DEPRECATED (възстановен и върнат)
 *   publish   REVIEW → PUBLISHED; по безопасност — четири очи (не качилият, не пратилият)
 *   deprecate PUBLISHED → DEPRECATED — изрично, с причина; нищо не се трие
 *   restore   DEPRECATED → REVIEW — с причина; после publish (четири очи за безопасност)
 * Нова ревизия НЕ отписва старата: старите табла продължават със своята, коя важи решава
 * приложимостта. По избор при публикуване (`replacesPrevious` + причина): новата заменя старата
 * за ВСИЧКИ табла → старата се отписва изрично (с одит).
 */

const Id = z.string().min(1).max(40);
const PublishBody = z
  .object({ replacesPrevious: z.boolean().optional(), reason: Reason.optional() })
  .strict()
  .refine((b) => !b.replacesPrevious || b.reason !== undefined, { path: ['reason'] });

type Action = 'submit' | 'reject' | 'publish' | 'deprecate' | 'restore';
const FROM: Record<Action, 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED'> = {
  submit: 'DRAFT',
  reject: 'REVIEW',
  publish: 'REVIEW',
  deprecate: 'PUBLISHED',
  restore: 'DEPRECATED',
};

export function adminDocumentsLifecycleRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  /** Документът в клиента и в очаквания статус — или отговорът за грешка (404/409). */
  async function load(req: Request, res: Response, action: Action) {
    const id = Id.safeParse(req.params.id);
    if (!id.success) return void apiError(res, 400, 'invalid_input');
    const p = principalOf(req);
    const doc = await deps.db.document.findFirst({
      where: { id: id.data, tenantId: p.user.tenantId },
      include: { _count: { select: { chunks: true, applicability: true } } },
    });
    if (!doc) return void apiError(res, 404, 'not_found');
    if (doc.status !== FROM[action]) return void apiError(res, 409, 'invalid_transition');
    return { p, doc };
  }

  const audit = (
    req: Request,
    action: Action,
    doc: { id: string; code: string; revision: string; supersedesId: string | null },
    extra: Record<string, unknown> = {},
  ) => {
    const p = principalOf(req);
    return appendAudit(deps.db, {
      tenantId: p.user.tenantId,
      actorId: p.user.id,
      action: `kb.document.${action}`,
      objectType: 'document',
      objectId: doc.id,
      detail: { code: doc.code, revision: doc.revision, supersedes: doc.supersedesId, ...extra },
    });
  };

  router.post('/documents/:id/submit', async (req, res, next) => {
    try {
      const got = await load(req, res, 'submit');
      if (!got) return;
      const { p, doc } = got;
      await deps.db.document.update({
        where: { id: doc.id },
        data: { status: 'REVIEW', submittedById: p.user.id },
      });
      await audit(req, 'submit', doc);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents/:id/reject', async (req, res, next) => {
    try {
      const got = await load(req, res, 'reject');
      if (!got) return;
      const body = OptionalReasonBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const { p, doc } = got;
      const to = rejectTarget(doc.publishedAt !== null);
      await deps.db.document.update({
        where: { id: doc.id },
        data: {
          status: to,
          reviewedById: p.user.id,
          ...(to === 'DEPRECATED' ? { deprecatedAt: new Date() } : {}),
        },
      });
      await audit(req, 'reject', doc, { to, reason: reasonForAudit(body.data.reason) });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents/:id/publish', async (req, res, next) => {
    try {
      const got = await load(req, res, 'publish');
      if (!got) return;
      const body = PublishBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const { p, doc } = got;
      // §7.3: търсим само с достатъчно метаданни за приложимостта.
      if (doc._count.chunks === 0 || doc._count.applicability === 0) {
        return apiError(res, 422, 'insufficient_metadata');
      }
      if (doc.safetyRelevant && fourEyesBlocked(p.user.id, [doc.uploadedById, doc.submittedById])) {
        return apiError(res, 409, 'four_eyes_required');
      }
      const replaces = body.data.replacesPrevious === true;
      if (replaces && !doc.supersedesId) return apiError(res, 422, 'superseded_not_found');
      const now = new Date();
      const reason = reasonForAudit(body.data.reason);
      const replaced = await deps.db.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: doc.id },
          data: {
            status: 'PUBLISHED',
            approvedById: p.user.id,
            approvedAt: now,
            publishedAt: now,
            deprecatedAt: null,
          },
        });
        if (!replaces || !doc.supersedesId) return null;
        // Изрично решение на отговорника: новата ревизия заменя старата за ВСИЧКИ табла.
        const old = await tx.document.updateMany({
          where: { id: doc.supersedesId, tenantId: p.user.tenantId, status: 'PUBLISHED' },
          data: { status: 'DEPRECATED', deprecatedAt: now },
        });
        if (old.count === 0) return { deprecated: [], errorsAffected: [] };
        const errorsAffected = await errorsSourcedBy(tx, p.user.tenantId, doc.supersedesId);
        await appendAudit(tx, {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          action: 'kb.document.deprecate',
          objectType: 'document',
          objectId: doc.supersedesId,
          detail: { replacedBy: doc.id, reason, errorsAffected: errorsAffected.map((e) => e.id) },
        });
        return { deprecated: [doc.supersedesId], errorsAffected };
      });
      deps.onDocumentPublished?.(doc.id);
      await audit(req, 'publish', doc, {
        ...(replaced ? { replacesPrevious: true, reason, deprecated: replaced.deprecated } : {}),
      });
      if (replaced) return res.json(replaced);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents/:id/deprecate', async (req, res, next) => {
    try {
      const got = await load(req, res, 'deprecate');
      if (!got) return;
      const body = ReasonBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const { p, doc } = got;
      const errorsAffected = await deps.db.$transaction(async (tx) => {
        await tx.document.update({
          where: { id: doc.id },
          data: { status: 'DEPRECATED', deprecatedAt: new Date() },
        });
        return errorsSourcedBy(tx, p.user.tenantId, doc.id);
      });
      await audit(req, 'deprecate', doc, {
        reason: reasonForAudit(body.data.reason),
        errorsAffected: errorsAffected.map((e) => e.id),
      });
      // Кодовете на отписания документ не изчезват тихо: връщат се на отговорника.
      res.json({ errorsAffected });
    } catch (err) {
      next(err);
    }
  });

  router.post('/documents/:id/restore', async (req, res, next) => {
    try {
      const got = await load(req, res, 'restore');
      if (!got) return;
      const body = ReasonBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const { p, doc } = got;
      // Възстановяващият е „подготвил“ повторното публикуване → четирите очи важат и за него.
      await deps.db.document.update({
        where: { id: doc.id },
        data: { status: 'REVIEW', submittedById: p.user.id, deprecatedAt: null },
      });
      await audit(req, 'restore', doc, { reason: reasonForAudit(body.data.reason) });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
