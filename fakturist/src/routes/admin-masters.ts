import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../auth/guards.js';
import { HOUR } from '../time.js';
import { kickOutbox } from '../mail/outbox.js';
import { grantMaster, listMasters, MasterError, revokeMaster } from '../accounts/masters.js';

/**
 * „Мастъри“ в панела (под requireMaster — src/routes/admin.ts): списък, даване по имейл, отнемане.
 * Всяко действие иска 2FA кода на действащия мастър (src/auth/step-up.ts); до 10 на час.
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const GrantSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254)),
  name: z.string().trim().max(100).default(''),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
const CodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

function code(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z]{2,30}$/.test(value) ? value : '';
}

function actor(req: Request): string {
  return req.principal!.user.id;
}

export function adminMastersRouter(): Router {
  const router = Router();

  router.get('/admin/mastari', async (req, res) => {
    res.render('admin/masters', {
      masters: await listMasters(),
      selfId: actor(req),
      ok: code(req.query['ok']),
      err: code(req.query['err']),
    });
  });

  router.post('/admin/mastari', limiter, async (req, res) => {
    const parsed = GrantSchema.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, '/admin/mastari?err=invalid');
    try {
      const result = await grantMaster({ actorId: actor(req), ...parsed.data });
      kickOutbox();
      res.redirect(303, `/admin/mastari?ok=${result.created ? 'created' : 'granted'}`);
    } catch (error) {
      if (error instanceof MasterError)
        return res.redirect(303, `/admin/mastari?err=${error.code}`);
      throw error;
    }
  });

  router.post('/admin/mastari/:id/otnemi', limiter, async (req, res) => {
    const parsed = CodeSchema.safeParse(req.body);
    if (!parsed.success) return res.redirect(303, '/admin/mastari?err=badCode');
    const userId = String(req.params['id']);
    if (!/^[a-z0-9]{20,40}$/.test(userId)) throw new HttpError(404);
    try {
      await revokeMaster({ actorId: actor(req), userId, code: parsed.data.code });
      kickOutbox();
      // Отнел е собствената си роля — сесията му вече я няма.
      if (userId === actor(req)) return res.redirect(303, '/vhod');
      res.redirect(303, '/admin/mastari?ok=revoked');
    } catch (error) {
      if (error instanceof MasterError)
        return res.redirect(303, `/admin/mastari?err=${error.code}`);
      throw error;
    }
  });

  return router;
}
