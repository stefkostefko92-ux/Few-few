import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../auth/guards.js';
import { isId } from '../ids.js';
import { HOUR } from '../time.js';
import {
  changeCompanyEik,
  ProfileError,
  updateCompanyProfile,
} from '../accounts/company-profile.js';
import { kickOutbox } from '../mail/outbox.js';

/**
 * Данните на фирма от мастър панела (SPEC 82–83; под requireMaster — src/routes/admin.ts): данните — като
 * собственика; ЕИК — с 2FA кода и основание. Грешката е `?greshka=profile.<код>` на картата.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

export function adminCompanyRouter(): Router {
  const router = Router();

  router.post('/admin/firmi/:id/danni', limiter, async (req, res) => {
    const id = String(req.params['id']);
    if (!isId(id)) throw new HttpError(404);
    const back = `/admin/r/organizations/${id}`;
    try {
      await updateCompanyProfile({
        organizationId: id,
        actor: { userId: req.principal!.user.id, master: true },
        input: req.body as Record<string, unknown>,
      });
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      if (error.code === 'notFound') throw new HttpError(404);
      return res.redirect(303, `${back}?greshka=profile.${error.code}`);
    }
    res.redirect(303, `${back}?danni=1`);
  });

  router.post('/admin/firmi/:id/eik', limiter, async (req, res) => {
    const id = String(req.params['id']);
    if (!isId(id)) throw new HttpError(404);
    const back = `/admin/r/organizations/${id}`;
    const body = req.body as Record<string, unknown>;
    const text = (key: string) => (typeof body[key] === 'string' ? body[key] : '').slice(0, 400);
    try {
      await changeCompanyEik({
        organizationId: id,
        actorId: req.principal!.user.id,
        code: text('code'),
        reason: text('reason'),
        eik: text('eik'),
      });
    } catch (error) {
      if (!(error instanceof ProfileError)) throw error;
      if (error.code === 'notFound') throw new HttpError(404);
      return res.redirect(303, `${back}?greshka=profile.${error.code}`);
    }
    kickOutbox();
    res.redirect(303, `${back}?danni=1`);
  });

  return router;
}
