import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCsrf, requireUser } from '../auth/guards.js';
import { can } from '../auth/rbac.js';

/**
 * Списъците за административната конзола (UI): продукти, табла, кодове за грешка, фирми. Само за
 * четене и само в клиента на администратора (tenantId във всяка заявка). Знанието е `kb:manage`;
 * фирмите — и `users:manage` (портален акаунт иска фирма), без нищо повече.
 */

const Q = z.string().trim().min(1).max(80);
const Id = z.string().min(1).max(40);
const DeviceQuery = z
  .object({
    q: Q.optional(),
    cursor: z.string().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const ErrorQuery = z
  .object({
    q: Q.optional(),
    status: z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED']).optional(),
    productModel: Q.optional(),
  })
  .strict();

export function adminListsRouter(deps: AppDeps): Router {
  const router = Router();
  const base = [requireUser, requireCsrf(deps.publicOrigin)];
  const need =
    (...caps: Array<'kb:manage' | 'users:manage'>) =>
    (req: Request, res: Response, next: NextFunction) =>
      caps.some((c) => can(principalOf(req).user.role, c))
        ? next()
        : apiError(res, 403, 'forbidden');
  const kb = [...base, need('kb:manage')];

  router.get('/companies', ...base, need('kb:manage', 'users:manage'), async (req, res, next) => {
    try {
      const companies = await deps.db.company.findMany({
        where: { tenantId: principalOf(req).user.tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 500,
      });
      res.json({ companies });
    } catch (err) {
      next(err);
    }
  });

  router.get('/products', ...kb, async (req, res, next) => {
    try {
      const products = await deps.db.product.findMany({
        where: { tenantId: principalOf(req).user.tenantId },
        include: { revisions: { orderBy: { hwRevision: 'asc' } } },
        orderBy: [{ family: 'asc' }, { model: 'asc' }],
        take: 500,
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

  // Табла по сериен номер (курсор = последният сериен номер). QR токенът не се пази и не се връща —
  // само дали има етикет.
  router.get('/devices', ...kb, async (req, res, next) => {
    try {
      const q = DeviceQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const { tenantId } = principalOf(req).user;
      const { q: text, cursor, limit } = q.data;
      const rows = await deps.db.device.findMany({
        where: {
          tenantId,
          ...(cursor ? { serial: { gt: cursor } } : {}),
          ...(text
            ? {
                OR: [
                  { serial: { contains: text, mode: 'insensitive' } },
                  { company: { name: { contains: text, mode: 'insensitive' } } },
                  { revision: { product: { model: { contains: text, mode: 'insensitive' } } } },
                ],
              }
            : {}),
        },
        include: {
          company: { select: { id: true, name: true } },
          revision: { include: { product: true } },
        },
        orderBy: { serial: 'asc' },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      res.json({
        devices: page.map((d) => ({
          serial: d.serial,
          productModel: d.revision.product.model,
          family: d.revision.product.family,
          hwRevision: d.revision.hwRevision,
          firmware: d.firmware,
          company: d.company,
          options: d.options,
          hasQr: d.qrTokenHash !== null,
          createdAt: d.createdAt,
        })),
        next: rows.length > limit ? (page.at(-1)?.serial ?? null) : null,
      });
    } catch (err) {
      next(err);
    }
  });

  const errorInclude = {
    product: { select: { model: true } },
    sourceDocument: { select: { id: true, code: true, revision: true, status: true } },
  } as const;

  router.get('/errors', ...kb, async (req, res, next) => {
    try {
      const q = ErrorQuery.safeParse(req.query);
      if (!q.success) return apiError(res, 400, 'invalid_input');
      const { tenantId } = principalOf(req).user;
      const { q: text, status, productModel } = q.data;
      const rows = await deps.db.errorCode.findMany({
        where: {
          tenantId,
          ...(status ? { status } : {}),
          ...(productModel ? { product: { model: productModel } } : {}),
          ...(text
            ? {
                OR: [
                  { code: { contains: text, mode: 'insensitive' } },
                  { title: { contains: text, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { ...errorInclude, _count: { select: { relations: true } } },
        orderBy: [{ code: 'asc' }, { version: 'desc' }],
        take: 300,
      });
      res.json({
        errors: rows.map((e) => ({
          id: e.id,
          productModel: e.product.model,
          code: e.code,
          title: e.title,
          severity: e.severity,
          safetyRelevant: e.safetyRelevant,
          hwRevision: e.hwRevision,
          fwMin: e.fwMin,
          fwMax: e.fwMax,
          status: e.status,
          version: e.version,
          sourceDocument: e.sourceDocument,
          sourcePage: e.sourcePage,
          relations: e._count.relations,
          updatedAt: e.updatedAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // Един код с причините/проверките — за преглед преди публикуване (класът на действието е важен).
  router.get('/errors/:id', ...kb, async (req, res, next) => {
    try {
      const id = Id.safeParse(req.params.id);
      if (!id.success) return apiError(res, 400, 'invalid_input');
      const e = await deps.db.errorCode.findFirst({
        where: { id: id.data, tenantId: principalOf(req).user.tenantId },
        include: {
          ...errorInclude,
          relations: { orderBy: [{ kind: 'asc' }, { ordinal: 'asc' }] },
        },
      });
      if (!e) return apiError(res, 404, 'not_found');
      res.json({
        id: e.id,
        productModel: e.product.model,
        code: e.code,
        title: e.title,
        description: e.description,
        subsystem: e.subsystem,
        severity: e.severity,
        safetyRelevant: e.safetyRelevant,
        hwRevision: e.hwRevision,
        fwMin: e.fwMin,
        fwMax: e.fwMax,
        status: e.status,
        version: e.version,
        sourceDocument: e.sourceDocument,
        sourcePage: e.sourcePage,
        relations: e.relations.map((r) => ({
          kind: r.kind,
          text: r.text,
          expected: r.expected,
          actionClass: r.actionClass,
          sourcePage: r.sourcePage,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
