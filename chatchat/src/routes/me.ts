import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { apiError, principalOf, requireCsrf, requireUser } from '../auth/guards.js';

/**
 * Собственият профил (FR-14): човекът сам сменя езика си — на него са интерфейсът, писмата и
 * отговорите на AI (чатът чете `locale` от базата при всеки въпрос). Само it/en/bg; нищо друго от
 * профила не се пипа оттук (роля, срок, фирма — само администраторът, с одит).
 */

export const LOCALES = ['it', 'en', 'bg'] as const;

const MePatch = z.object({ locale: z.enum(LOCALES) }).strict();

export function meRouter(deps: AppDeps): Router {
  const router = Router();

  router.patch('/me', requireUser, requireCsrf(deps.publicOrigin), async (req, res, next) => {
    try {
      const body = MePatch.safeParse(req.body);
      if (!body.success) return apiError(res, 400, 'invalid_input');
      const p = principalOf(req);
      const user = await deps.db.user.update({
        where: { id: p.user.id, tenantId: p.user.tenantId },
        data: { locale: body.data.locale },
        select: { id: true, name: true, role: true, kind: true, locale: true },
      });
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
