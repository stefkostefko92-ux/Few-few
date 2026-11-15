import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireUser } from '../auth/guards.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import {
  AccountTokenError,
  findPasswordReset,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '../accounts/tokens.js';
import { kickOutbox } from '../mail/outbox.js';
import { errorMessage, logger } from '../logger.js';
import { requestRateKey } from '../http/ip.js';
import { MINUTE } from '../time.js';

/** Заявки за писма без вход: 5 за 15 минути от адрес (и успешните — всяка праща писмо). */
const mailLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: requestRateKey,
});

/** Нова парола по връзка: 10 опита за 15 минути от адрес. */
const resetLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: requestRateKey,
});

const ForgotForm = z.object({ email: z.string().trim().max(254) });
const ResetForm = z.object({ password: z.string().max(PASSWORD_MAX_LENGTH) });

function noStore(res: Response): void {
  // Токенът е в адреса: страницата не се кешира и не праща Referer към чужди сайтове.
  res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer');
}

function tokenParam(req: Request): string {
  const value = req.params['token'];
  return typeof value === 'string' ? value : '';
}

/**
 * „Забравена парола“ и потвърждението на имейла (src/accounts/tokens.ts). Страниците с токен в адреса
 * са `no-store` и `no-referrer`; токенът не стига до лога (safeLogPath).
 */
export function accountRouter(): Router {
  const router = Router();

  router.get('/zabravena-parola', (_req, res) => {
    res.render('auth/forgot', { sent: null, email: '' });
  });

  router.post('/zabravena-parola', mailLimiter, (req, res) => {
    const parsed = ForgotForm.safeParse(req.body);
    const email = parsed.success ? parsed.data.email : '';
    // Отговорът е един и същ и идва веднага — работата е след него, затова и времето не издава дали
    // има профил с този имейл.
    res.render('auth/forgot', { sent: email, email: '' });
    if (email) {
      requestPasswordReset(email)
        .then((outcome) => {
          if (outcome === 'queued') kickOutbox();
        })
        .catch((error: unknown) =>
          logger.error({ err: errorMessage(error) }, 'връзката за нова парола не тръгна'),
        );
    }
  });

  router.get('/nova-parola/:token', async (req, res) => {
    noStore(res);
    const open = await findPasswordReset(tokenParam(req));
    if (!open) return res.status(404).render('auth/link-invalid', { kind: 'reset' });
    res.render('auth/reset', { email: open.email, error: null });
  });

  router.post('/nova-parola/:token', resetLimiter, async (req, res) => {
    noStore(res);
    const token = tokenParam(req);
    const parsed = ResetForm.safeParse(req.body);
    try {
      await resetPassword({ token, password: parsed.success ? parsed.data.password : '' });
      res.redirect(303, '/vhod?ok=reset');
    } catch (error) {
      if (!(error instanceof AccountTokenError)) throw error;
      if (error.code === 'invalid') {
        return res.status(404).render('auth/link-invalid', { kind: 'reset' });
      }
      const open = await findPasswordReset(token);
      if (!open) return res.status(404).render('auth/link-invalid', { kind: 'reset' });
      res.status(400).render('auth/reset', { email: open.email, error: error.code });
    }
  });

  router.get('/potvardi-imeyl/:token', async (req, res) => {
    noStore(res);
    try {
      await verifyEmail(tokenParam(req));
      res.render('auth/verified', { hideVerifyBar: true });
    } catch (error) {
      if (!(error instanceof AccountTokenError)) throw error;
      res.status(404).render('auth/link-invalid', { kind: 'verify' });
    }
  });

  router.post('/app/potvardi-imeyl', requireUser(), async (req, res) => {
    const outcome = await requestEmailVerification(req.principal!.user.id);
    if (outcome === 'queued') kickOutbox();
    res.redirect(303, `/app?verify=${outcome}`);
  });

  return router;
}
