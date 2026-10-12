import type { QuickResponse, Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import type { WiredDeps } from '../app.js';
import { appendAudit } from '../audit.js';
import {
  apiError,
  principalOf,
  requireCapability,
  requireCsrf,
  requireUser,
} from '../auth/guards.js';
import { redactPii } from '../domain/pii.js';
import { isUniqueOn } from '../services/cases.js';
import { Id } from './collab-common.js';

/**
 * Бързи отговори (FR-20, AC-15): шаблони по роля и език, версионирани като знанието
 * (DRAFT → PUBLISHED → DEPRECATED). Техникът вижда само PUBLISHED и само ако ролята му е в
 * `roleScope`. Сървърът САМО връща текста за редакция в полето — не изпраща нищо сам;
 * изпращането е отделно, човешко действие. Управлението е на отговорника за знанието (`kb:manage`).
 */

const ROLES = [
  'PORTAL_TECHNICIAN',
  'INTERNAL_TECHNICIAN',
  'SUPPORT',
  'ENGINEERING',
  'KNOWLEDGE_OWNER',
  'TENANT_ADMIN',
  'PLATFORM_ADMIN',
] as const satisfies readonly Role[];
const Locale = z.enum(['it', 'en']);
const Fields = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
  roleScope: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
});
const CreateInput = Fields.extend({
  shortcut: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
  locale: Locale,
});
const UpdateInput = Fields.partial().refine((f) => Object.keys(f).length > 0);

const publicView = (q: QuickResponse) => ({
  id: q.id,
  shortcut: q.shortcut,
  locale: q.locale,
  title: q.title,
  body: q.body,
  version: q.version,
});
const fullView = (q: QuickResponse) => ({
  ...publicView(q),
  status: q.status,
  roleScope: q.roleScope,
  createdById: q.createdById,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
});

export function quickResponsesRouter(deps: WiredDeps): Router {
  const router = Router();
  router.use(requireUser, requireCsrf(deps.publicOrigin));
  const manage = requireCapability('kb:manage');

  const audit = (req: Parameters<typeof principalOf>[0], action: string, q: QuickResponse) => {
    const p = principalOf(req);
    return appendAudit(deps.db, {
      tenantId: p.user.tenantId,
      actorId: p.user.id,
      action,
      objectType: 'quick_response',
      objectId: q.id,
      detail: { shortcut: q.shortcut, locale: q.locale, version: q.version },
    });
  };

  const own = (req: Parameters<typeof principalOf>[0], id: string) =>
    deps.db.quickResponse.findFirst({ where: { id, tenantId: principalOf(req).user.tenantId } });

  router.get('/quick-responses', requireCapability('conversation:use'), async (req, res, next) => {
    try {
      const q = z.object({ locale: Locale.optional() }).safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const rows = await deps.db.quickResponse.findMany({
        where: {
          tenantId: p.user.tenantId,
          status: 'PUBLISHED',
          roleScope: { has: p.user.role },
          ...(q.data.locale ? { locale: q.data.locale } : {}),
        },
        orderBy: [{ shortcut: 'asc' }, { locale: 'asc' }],
        take: 500,
      });
      res.json({ quickResponses: rows.map(publicView) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/quick-responses/all', manage, async (req, res, next) => {
    try {
      const rows = await deps.db.quickResponse.findMany({
        where: { tenantId: principalOf(req).user.tenantId },
        orderBy: [{ shortcut: 'asc' }, { locale: 'asc' }, { version: 'desc' }],
        take: 2000,
      });
      res.json({ quickResponses: rows.map(fullView) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/quick-responses', manage, async (req, res, next) => {
    try {
      const parsed = CreateInput.safeParse(req.body);
      if (!parsed.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const { shortcut, locale } = parsed.data;
      const exists = await deps.db.quickResponse.findFirst({
        where: { tenantId: p.user.tenantId, shortcut, locale },
      });
      if (exists) return apiError(res, 409, 'duplicate');
      const created = await deps.db.quickResponse.create({
        data: {
          ...parsed.data,
          body: redactPii(parsed.data.body),
          tenantId: p.user.tenantId,
          version: 1,
          createdById: p.user.id,
        },
      });
      await audit(req, 'quick_response.create', created);
      res.status(201).json({ quickResponse: fullView(created) });
    } catch (err) {
      if (isUniqueOn(err, 'shortcut')) return apiError(res, 409, 'duplicate');
      next(err);
    }
  });

  // Редакция: черновата се променя на място; публикувана/отписана → НОВА версия-чернова.
  router.patch('/quick-responses/:id', manage, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      const parsed = UpdateInput.safeParse(req.body);
      if (!id.success || !parsed.success) return apiError(res, 400, 'invalid_input');
      const current = await own(req, id.data);
      if (!current) return apiError(res, 404, 'not_found');
      const data = {
        ...parsed.data,
        ...(parsed.data.body ? { body: redactPii(parsed.data.body) } : {}),
      };
      if (current.status === 'DRAFT' || current.status === 'REVIEW') {
        const updated = await deps.db.quickResponse.update({ where: { id: current.id }, data });
        await audit(req, 'quick_response.update', updated);
        return res.json({ quickResponse: fullView(updated) });
      }
      const draft = await deps.db.quickResponse.findFirst({
        where: {
          tenantId: current.tenantId,
          shortcut: current.shortcut,
          locale: current.locale,
          status: { in: ['DRAFT', 'REVIEW'] },
        },
      });
      if (draft) return apiError(res, 409, 'duplicate');
      const latest = await deps.db.quickResponse.aggregate({
        where: { tenantId: current.tenantId, shortcut: current.shortcut, locale: current.locale },
        _max: { version: true },
      });
      const next_ = await deps.db.quickResponse.create({
        data: {
          tenantId: current.tenantId,
          shortcut: current.shortcut,
          locale: current.locale,
          title: data.title ?? current.title,
          body: data.body ?? current.body,
          roleScope: data.roleScope ?? current.roleScope,
          version: (latest._max.version ?? current.version) + 1,
          createdById: principalOf(req).user.id,
        },
      });
      await audit(req, 'quick_response.version', next_);
      res.status(201).json({ quickResponse: fullView(next_) });
    } catch (err) {
      if (isUniqueOn(err, 'version')) return apiError(res, 409, 'duplicate');
      next(err);
    }
  });

  // Публикуване: предишната публикувана версия за същия пряк път и език се отписва.
  router.post('/quick-responses/:id/publish', manage, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const current = await own(req, id.data);
      if (!current) return apiError(res, 404, 'not_found');
      if (current.status !== 'DRAFT' && current.status !== 'REVIEW') {
        return apiError(res, 409, 'invalid_transition');
      }
      const published = await deps.db.$transaction(async (tx) => {
        await tx.quickResponse.updateMany({
          where: {
            tenantId: current.tenantId,
            shortcut: current.shortcut,
            locale: current.locale,
            status: 'PUBLISHED',
          },
          data: { status: 'DEPRECATED' },
        });
        return tx.quickResponse.update({
          where: { id: current.id },
          data: { status: 'PUBLISHED' },
        });
      });
      await audit(req, 'quick_response.publish', published);
      res.json({ quickResponse: fullView(published) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/quick-responses/:id/deprecate', manage, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const current = await own(req, id.data);
      if (!current) return apiError(res, 404, 'not_found');
      if (current.status !== 'PUBLISHED') return apiError(res, 409, 'invalid_transition');
      const deprecated = await deps.db.quickResponse.update({
        where: { id: current.id },
        data: { status: 'DEPRECATED' },
      });
      await audit(req, 'quick_response.deprecate', deprecated);
      res.json({ quickResponse: fullView(deprecated) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
