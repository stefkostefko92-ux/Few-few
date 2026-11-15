import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../auth/guards.js';
import { isId } from '../ids.js';
import { HOUR } from '../time.js';
import { endGrant, grantPlan, GrantError, parseGrantForm } from '../billing/grant.js';

/**
 * Ръчно даден план от картата на фирмата в мастър панела (SPEC 71–72; под requireMaster —
 * src/routes/admin.ts). Грешката се връща на картата като `?greshka=grant.<код>`; до 30 на час.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

export function adminGrantRouter(): Router {
  const router = Router();

  router.post('/admin/firmi/:id/plan', limiter, async (req, res) => {
    const id = String(req.params['id']);
    if (!isId(id)) throw new HttpError(404);
    const back = `/admin/r/organizations/${id}`;
    const parsed = parseGrantForm(req.body as Record<string, unknown>);
    if (!parsed.ok) return res.redirect(303, `${back}?greshka=grant.${parsed.error}`);
    try {
      await grantPlan({ organizationId: id, actorId: req.principal!.user.id, ...parsed.value });
    } catch (error) {
      if (!(error instanceof GrantError)) throw error;
      if (error.code === 'notFound' || error.code === 'deleted') throw new HttpError(404);
      return res.redirect(303, `${back}?greshka=grant.${error.code}`);
    }
    res.redirect(303, `${back}?plan=ok`);
  });

  router.post('/admin/firmi/:id/plan/prekrati', limiter, async (req, res) => {
    const id = String(req.params['id']);
    if (!isId(id)) throw new HttpError(404);
    const back = `/admin/r/organizations/${id}`;
    try {
      await endGrant({ organizationId: id, actorId: req.principal!.user.id });
    } catch (error) {
      if (!(error instanceof GrantError)) throw error;
      if (error.code === 'notFound' || error.code === 'deleted') throw new HttpError(404);
      return res.redirect(303, `${back}?greshka=grant.${error.code}`);
    }
    res.redirect(303, `${back}?plan=ended`);
  });

  return router;
}
