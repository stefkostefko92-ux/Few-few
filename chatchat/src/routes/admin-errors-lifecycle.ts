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
  errorIsSafetyRelevant,
  fourEyesBlocked,
  OptionalReasonBody,
  ReasonBody,
  reasonForAudit,
  rejectTarget,
  withAuthor,
} from '../services/kb-lifecycle.js';

/**
 * Жизненият цикъл на код за грешка (FR-04, §11.3) — като при документите:
 *   submit    DRAFT → REVIEW (пратилият става автор на версията)
 *   reject    REVIEW → DRAFT (никога публикувана) | DEPRECATED (възстановена и върната)
 *   publish   REVIEW → PUBLISHED; източникът е публикуван; свързаната с безопасността версия
 *             (флаг или проверка SAFETY_RELEVANT/DIRECT_COMMAND) — ЧЕТИРИ ОЧИ: не я публикува
 *             никой от авторите ѝ. Предишната ПУБЛИКУВАНА версия със СЪЩАТА валидност (модел + HW
 *             + обхват на FW) се отписва — тя се пази и може да се възстанови.
 *   deprecate PUBLISHED → DEPRECATED — с причина
 *   restore   DEPRECATED → REVIEW — с причина (възстановилият става автор)
 * Версиите не се трият никога.
 */

const Id = z.string().min(1).max(40);
type Action = 'submit' | 'reject' | 'publish' | 'deprecate' | 'restore';
const FROM: Record<Action, 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED'> = {
  submit: 'DRAFT',
  reject: 'REVIEW',
  publish: 'REVIEW',
  deprecate: 'PUBLISHED',
  restore: 'DEPRECATED',
};

export function adminErrorsLifecycleRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin), requireCapability('kb:manage'));

  async function load(req: Request, res: Response, action: Action) {
    const id = Id.safeParse(req.params.id);
    if (!id.success) return void apiError(res, 400, 'invalid_input');
    const p = principalOf(req);
    const entry = await deps.db.errorCode.findFirst({
      where: { id: id.data, tenantId: p.user.tenantId },
      include: { sourceDocument: { select: { status: true } }, relations: true },
    });
    if (!entry) return void apiError(res, 404, 'not_found');
    if (entry.status !== FROM[action]) return void apiError(res, 409, 'invalid_transition');
    return { p, entry };
  }

  const audit = (
    req: Request,
    action: Action,
    entry: { id: string; code: string; version: number },
    extra: Record<string, unknown> = {},
  ) => {
    const p = principalOf(req);
    return appendAudit(deps.db, {
      tenantId: p.user.tenantId,
      actorId: p.user.id,
      action: `kb.error.${action}`,
      objectType: 'error',
      objectId: entry.id,
      detail: { code: entry.code, version: entry.version, ...extra },
    });
  };

  router.post('/errors/:id/submit', async (req, res, next) => {
    try {
      const got = await load(req, res, 'submit');
      if (!got) return;
      const { p, entry } = got;
      await deps.db.errorCode.update({
        where: { id: entry.id },
        data: { status: 'REVIEW', authorIds: withAuthor(entry.authorIds, p.user.id) },
      });
      await audit(req, 'submit', entry);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/errors/:id/reject', async (req, res, next) => {
    try {
      const got = await load(req, res, 'reject');
      if (!got) return;
      const body = OptionalReasonBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const { entry } = got;
      const to = rejectTarget(entry.approvedAt !== null);
      await deps.db.errorCode.update({ where: { id: entry.id }, data: { status: to } });
      await audit(req, 'reject', entry, { to, reason: reasonForAudit(body.data.reason) });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/errors/:id/publish', async (req, res, next) => {
    try {
      const got = await load(req, res, 'publish');
      if (!got) return;
      const { p, entry } = got;
      if (entry.sourceDocument?.status !== 'PUBLISHED') {
        return apiError(res, 422, 'source_not_published');
      }
      if (errorIsSafetyRelevant(entry) && fourEyesBlocked(p.user.id, entry.authorIds)) {
        return apiError(res, 409, 'four_eyes_required');
      }
      const now = new Date();
      const replaced = await deps.db.$transaction(async (tx) => {
        const same = {
          productId: entry.productId,
          code: entry.code,
          hwRevision: entry.hwRevision,
          fwMin: entry.fwMin,
          fwMax: entry.fwMax,
          status: 'PUBLISHED' as const,
          id: { not: entry.id },
        };
        const previous = await tx.errorCode.findMany({ where: same, select: { id: true } });
        await tx.errorCode.updateMany({ where: same, data: { status: 'DEPRECATED' } });
        await tx.errorCode.update({
          where: { id: entry.id },
          data: { status: 'PUBLISHED', approvedById: p.user.id, approvedAt: now },
        });
        return previous.map((x) => x.id);
      });
      await audit(req, 'publish', entry, replaced.length > 0 ? { replaced } : {});
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/errors/:id/deprecate', async (req, res, next) => {
    try {
      const got = await load(req, res, 'deprecate');
      if (!got) return;
      const body = ReasonBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      await deps.db.errorCode.update({
        where: { id: got.entry.id },
        data: { status: 'DEPRECATED' },
      });
      await audit(req, 'deprecate', got.entry, { reason: reasonForAudit(body.data.reason) });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/errors/:id/restore', async (req, res, next) => {
    try {
      const got = await load(req, res, 'restore');
      if (!got) return;
      const body = ReasonBody.safeParse(req.body ?? {});
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const { p, entry } = got;
      await deps.db.errorCode.update({
        where: { id: entry.id },
        data: { status: 'REVIEW', authorIds: withAuthor(entry.authorIds, p.user.id) },
      });
      await audit(req, 'restore', entry, { reason: reasonForAudit(body.data.reason) });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
