import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../auth/guards.js';
import { safeBack } from '../http/view.js';
import { HOUR } from '../time.js';

/**
 * Езикът на приложението (BG/EN) от превключвателя в лентата: пази се в профила — на него са и
 * приложението, и мастър панелът, и писмата до човека. Без профил езикът е в адреса (`?lang=`).
 */
const limiter = rateLimit({
  windowMs: HOUR,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.principal?.user.id ?? 'anonymous',
});

const LanguageForm = z.object({
  lang: z.enum(['bg', 'en']),
  back: z.string().max(500).optional(),
});

export function languageRouter(): Router {
  const router = Router();

  router.post('/app/ezik', limiter, async (req, res) => {
    const principal = req.principal;
    if (!principal) return res.redirect(303, '/vhod');
    const parsed = LanguageForm.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400);
    await prisma.user.update({
      where: { id: principal.user.id },
      data: { locale: parsed.data.lang },
    });
    res.redirect(303, safeBack(parsed.data.back));
  });

  return router;
}
