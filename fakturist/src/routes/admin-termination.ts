import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../auth/guards.js';
import { isId } from '../ids.js';
import { HOUR } from '../time.js';
import { kickOutbox } from '../mail/outbox.js';
import {
  cancelTermination,
  requestTermination,
  TerminationError,
} from '../accounts/termination.js';

/**
 * Прекратяване на фирма от мастъра (SPEC 65; под requireMaster — src/routes/admin.ts): заявка и отмяна
 * само с 2FA кода на действащия мастър (src/auth/step-up.ts) и отметка; до 10 на час.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const CodeForm = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
const TerminateForm = CodeForm.extend({ understood: z.literal('on') });

export function adminTerminationRouter(): Router {
  const router = Router();

  const act = (path: string, form: z.ZodType<{ code: string }>, run: typeof requestTermination) =>
    router.post(path, limiter, async (req, res) => {
      const id = String(req.params['id']);
      if (!isId(id)) throw new HttpError(404);
      const back = `/admin/r/organizations/${id}`;
      const parsed = form.safeParse(req.body);
      if (!parsed.success) return res.redirect(303, `${back}?greshka=code`);
      try {
        await run({
          organizationId: id,
          actor: { userId: req.principal!.user.id, master: true },
          code: parsed.data.code,
        });
      } catch (error) {
        if (!(error instanceof TerminationError)) throw error;
        if (error.code === 'notFound') throw new HttpError(404);
        return res.redirect(303, `${back}?greshka=${error.code}`);
      }
      kickOutbox();
      res.redirect(303, `${back}?prekratyavane=1`);
    });

  act('/admin/firmi/:id/prekrati', TerminateForm, requestTermination);
  act('/admin/firmi/:id/otmeni-prekratyavane', CodeForm, async (input) => {
    await cancelTermination(input);
    return { purgeAfter: new Date(0) };
  });
  return router;
}
