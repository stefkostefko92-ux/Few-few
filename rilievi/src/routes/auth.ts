import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { mailEnabled } from '../config.js';
import { writeAudit } from '../audit.js';
import { issuePreCsrf, requireCsrf, requirePreAuthCsrf, safeNext } from '../auth/guards.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  destroySessionById,
  setSessionCookie,
} from '../auth/sessions.js';
import { setFlash } from '../http/flash.js';
import { forgotLimiter, loginLimiter, tokenLimiter } from '../http/limits.js';
import { logger, errorMessage } from '../logger.js';
import { acceptInvite, findValidInvite } from '../services/invites.js';
import { findValidReset, login, requestReset, resetPassword } from '../services/auth.js';

export const authRouter: Router = Router();

/** Страниците с токен и входът не се кешират никъде (споделен компютър, прокси). */
function noStore(res: Response): void {
  res.set('Cache-Control', 'no-store');
}

const loginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(PASSWORD_MAX_LENGTH * 4),
  next: z.string().max(500).optional(),
});

authRouter.get('/', (req, res) => {
  res.redirect(req.principal ? '/schede' : '/accesso');
});

function renderLogin(
  req: Request,
  res: Response,
  status: number,
  view: { email: string; next: string; error: string | null },
): void {
  noStore(res);
  res.status(status).render('auth/login', { preCsrf: issuePreCsrf(req, res), ...view });
}

authRouter.get('/accesso', (req, res) => {
  const next = safeNext(req.query.next);
  if (req.principal) {
    res.redirect(next);
    return;
  }
  renderLogin(req, res, 200, { email: '', next, error: null });
});

authRouter.post('/accesso', loginLimiter, requirePreAuthCsrf, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  const next = safeNext(parsed.success ? parsed.data.next : undefined);
  if (!parsed.success || !parsed.data.email || !parsed.data.password) {
    renderLogin(req, res, 400, { email: '', next, error: 'auth.error.invalid' });
    return;
  }
  const outcome = await login(parsed.data.email, parsed.data.password);
  if (outcome.kind !== 'ok') {
    const status = { invalid: 401, locked: 429, deactivated: 403 }[outcome.kind];
    renderLogin(req, res, status, {
      email: parsed.data.email.slice(0, 254),
      next,
      error: `auth.error.${outcome.kind}`,
    });
    return;
  }
  // Стара сесия в същия браузър (друг човек на същия телефон) не остава жива зад новата.
  if (req.principal) await destroySessionById(req.principal.session.id);
  setSessionCookie(res, await createSession(outcome.user));
  res.redirect(outcome.user.mustChangePassword ? '/account' : next);
});

authRouter.post('/esci', requireCsrf, async (req, res) => {
  const principal = req.principal;
  if (principal) {
    await destroySessionById(principal.session.id);
    await writeAudit({
      actorId: principal.user.id,
      action: 'LOGOUT',
      aziendaId: principal.user.aziendaId,
      targetType: 'user',
      targetId: principal.user.id,
    });
  }
  clearSessionCookie(res);
  setFlash(res, 'ok', 'flash.loggedOut');
  res.redirect('/accesso');
});

const nameSchema = z.string().trim().min(2).max(120);
const newPasswordSchema = z.object({
  password: z.string().max(PASSWORD_MAX_LENGTH * 4),
  confirm: z.string().max(PASSWORD_MAX_LENGTH * 4),
});

function linkInvalid(res: Response, kind: 'invite' | 'reset'): void {
  noStore(res);
  res.status(410).render('auth/link-invalid', { kind });
}

authRouter.get('/invito/:token', tokenLimiter, async (req, res) => {
  const invite = await findValidInvite(req.params.token);
  if (!invite) {
    linkInvalid(res, 'invite');
    return;
  }
  noStore(res);
  res.render('auth/invite', {
    invite,
    preCsrf: issuePreCsrf(req, res),
    name: invite.name ?? '',
    error: null,
  });
});

authRouter.post('/invito/:token', tokenLimiter, requirePreAuthCsrf, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const invite = await findValidInvite(req.params.token);
  if (!invite) {
    linkInvalid(res, 'invite');
    return;
  }
  const rawName = typeof body.name === 'string' ? body.name : '';
  const fail = (status: number, error: string): void => {
    noStore(res);
    res.status(status).render('auth/invite', {
      invite,
      preCsrf: issuePreCsrf(req, res),
      name: rawName.slice(0, 120),
      error,
    });
  };
  const name = nameSchema.safeParse(rawName);
  const passwords = newPasswordSchema.safeParse(body);
  if (!name.success) return fail(400, 'auth.error.name');
  if (!passwords.success) return fail(400, 'password.problem.tooShort');
  if (passwords.data.password !== passwords.data.confirm) return fail(400, 'auth.error.confirm');
  const result = await acceptInvite(req.params.token, {
    name: name.data,
    password: passwords.data.password,
  });
  if (!result.ok) {
    if (result.error === 'invalid') return linkInvalid(res, 'invite');
    return fail(
      400,
      result.error === 'userExists' ? 'auth.error.userExists' : `password.problem.${result.error}`,
    );
  }
  if (req.principal) await destroySessionById(req.principal.session.id);
  setSessionCookie(res, await createSession(result.user));
  setFlash(res, 'ok', 'flash.welcome');
  res.redirect('/schede');
});

authRouter.get('/password-dimenticata', (req, res) => {
  noStore(res);
  res.render('auth/forgot', { preCsrf: issuePreCsrf(req, res), mail: mailEnabled(), sent: false });
});

authRouter.post('/password-dimenticata', forgotLimiter, requirePreAuthCsrf, async (req, res) => {
  const email = z
    .string()
    .trim()
    .max(254)
    .email()
    .safeParse((req.body as Record<string, unknown>).email);
  if (email.success) {
    try {
      await requestReset(email.data);
    } catch (error) {
      // Отговорът остава еднакъв; причината е в лога (без адреса).
      logger.error({ err: errorMessage(error) }, 'връзката за нова парола не се създаде');
    }
  }
  noStore(res);
  res.render('auth/forgot', { preCsrf: issuePreCsrf(req, res), mail: mailEnabled(), sent: true });
});

authRouter.get('/reimposta/:token', tokenLimiter, async (req, res) => {
  const reset = await findValidReset(req.params.token);
  if (!reset) {
    linkInvalid(res, 'reset');
    return;
  }
  noStore(res);
  res.render('auth/reset', {
    preCsrf: issuePreCsrf(req, res),
    email: reset.user.email,
    error: null,
  });
});

authRouter.post('/reimposta/:token', tokenLimiter, requirePreAuthCsrf, async (req, res) => {
  const reset = await findValidReset(req.params.token);
  if (!reset) {
    linkInvalid(res, 'reset');
    return;
  }
  const fail = (error: string): void => {
    noStore(res);
    res.status(400).render('auth/reset', {
      preCsrf: issuePreCsrf(req, res),
      email: reset.user.email,
      error,
    });
  };
  const passwords = newPasswordSchema.safeParse(req.body);
  if (!passwords.success) return fail('password.problem.tooShort');
  if (passwords.data.password !== passwords.data.confirm) return fail('auth.error.confirm');
  const result = await resetPassword(req.params.token, passwords.data.password);
  if (!result.ok) {
    if (result.error === 'invalid') return linkInvalid(res, 'reset');
    return fail(`password.problem.${result.error}`);
  }
  // Всички сесии на човека паднаха — и текущата в този браузър, ако е негова.
  if (req.principal?.user.id === reset.userId) clearSessionCookie(res);
  setFlash(res, 'ok', 'flash.passwordReset');
  res.redirect('/accesso');
});
