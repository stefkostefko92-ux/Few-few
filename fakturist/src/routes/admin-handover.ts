import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../auth/guards.js';
import { isId } from '../ids.js';
import { HOUR } from '../time.js';
import { HandoverError, masterHandover, type MasterTarget } from '../accounts/handover.js';
import { kickOutbox } from '../mail/outbox.js';

/**
 * Мастърът предава собствеността веднага (SPEC 87; под requireMaster — src/routes/admin.ts): от картата
 * на организацията, с 2FA кода и основание. Грешката се връща като `?greshka=handover.<код>`.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const Form = z.object({
  to: z.enum(['person', 'firm']),
  email: z.string().max(254).optional(),
  name: z.string().max(100).optional(),
  keepOldOwner: z.literal('on').optional(),
  eik: z.string().max(13).optional(),
  reason: z.string().max(400),
  code: z.string().trim().max(10),
});

export function adminHandoverRouter(): Router {
  const router = Router();

  router.post('/admin/firmi/:id/predai', limiter, async (req, res) => {
    const id = String(req.params['id']);
    if (!isId(id)) throw new HttpError(404);
    const back = `/admin/r/organizations/${id}`;
    const parsed = Form.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, `${back}?greshka=handover.invalid`);
    const form = parsed.data;
    const target: MasterTarget =
      form.to === 'person'
        ? {
            kind: 'person',
            email: form.email ?? '',
            ...(form.name ? { name: form.name } : {}),
            keepOldOwner: form.keepOldOwner === 'on',
          }
        : { kind: 'firm', eik: form.eik ?? '' };
    try {
      await masterHandover({
        organizationId: id,
        actorId: req.principal!.user.id,
        code: form.code,
        reason: form.reason,
        target,
      });
    } catch (error) {
      if (!(error instanceof HandoverError)) throw error;
      return res.redirect(303, `${back}?greshka=handover.${error.code}`);
    }
    kickOutbox();
    res.redirect(303, `${back}?predadeno=1`);
  });

  return router;
}
