import { Router, type Request, type Response } from 'express';
import { config, isProduction } from '../config.js';
import { randomToken, safeEqual } from '../crypto.js';
import { ensureDeviceCookie, parseFingerprint } from '../auth/device.js';
import { PRE_CSRF_COOKIE, requirePreAuthCsrf } from '../auth/guards.js';
import { clearSessionCookie, destroySessionById, setSessionCookie } from '../auth/sessions.js';
import { isRole } from '../auth/rbac.js';
import { setFlash } from '../http/flash.js';
import { forgotLimiter, loginLimiter, mfaLimiter, registerLimiter } from '../http/limits.js';
import { rawField, requestMeta, safeNext, stringField } from '../http/meta.js';
import { isLocale } from '../i18n.js';
import { audit } from '../audit.js';
import { attemptLogin, completeMfa } from '../services/login.js';
import { registerAccount, verifyEmailToken } from '../services/registration.js';
import { requestPasswordReset, resetPassword, resetTokenValid } from '../services/security.js';
import { customerActor } from '../services/auth-common.js';
import type { DeviceContext } from '../services/devices.js';

export const authRouter: Router = Router();

/** CSRF токен за формите преди вход: двойна бисквитка (стойността е и в скритото поле). */
function preCsrf(req: Request, res: Response): string {
  const existing = ((req.cookies ?? {}) as Record<string, string | undefined>)[PRE_CSRF_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{32}$/.test(existing)) return existing;
  const token = randomToken(24);
  res.cookie(PRE_CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/',
    maxAge: 2 * 60 * 60 * 1000,
  });
  return token;
}

function deviceContext(req: Request, res: Response): DeviceContext {
  return {
    cookieId: ensureDeviceCookie(req, res),
    fingerprint: parseFingerprint((req.body as Record<string, unknown> | undefined)?.fp),
  };
}

/** Страниците за вход не се кешират и не се индексират. */
function authPage(res: Response, view: string, data: Record<string, unknown>, status = 200): void {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .render(view, { noindex: true, ...data });
}

/* -------------------------------------- вход -------------------------------------- */

authRouter.get('/login', (req, res) => {
  if (req.principal?.session.mfaPassed) {
    res.redirect(safeNext(req.query.next));
    return;
  }
  ensureDeviceCookie(req, res);
  authPage(res, 'auth/login', {
    pre: preCsrf(req, res),
    next: safeNext(req.query.next, ''),
    email: '',
    error: null,
  });
});

authRouter.post('/login', loginLimiter, requirePreAuthCsrf, async (req, res) => {
  const meta = requestMeta(req);
  const email = stringField(req.body, 'email', 254);
  const next = safeNext(stringField(req.body, 'next', 300));
  const result = await attemptLogin(
    email,
    rawField(req.body, 'password'),
    meta,
    deviceContext(req, res),
  );
  const again = (error: string, status: number, extra: Record<string, unknown> = {}) =>
    authPage(res, 'auth/login', { pre: preCsrf(req, res), next, email, error, ...extra }, status);

  switch (result.kind) {
    case 'invalid':
      again('auth.errors.invalid', 401);
      return;
    case 'throttled':
      again('auth.errors.throttled', 429);
      return;
    case 'banned':
      authPage(res, 'auth/banned', { reason: result.reason, contact: config().CONTACT_EMAIL }, 403);
      return;
    case 'unverified':
      again('auth.errors.unverified', 403, { resent: result.resent });
      return;
    case 'ok':
      if (req.principal) await destroySessionById(req.principal.session.id);
      setSessionCookie(res, result.session);
      if (result.mfaRequired) {
        res.redirect(`/login/2fa?next=${encodeURIComponent(next)}`);
        return;
      }
      res.redirect(
        isRole(result.user.role) && result.user.role !== 'CUSTOMER' && next === '/app'
          ? '/admin'
          : next,
      );
  }
});

authRouter.get('/login/2fa', (req, res) => {
  const principal = req.principal;
  if (!principal) {
    res.redirect('/login');
    return;
  }
  if (principal.session.mfaPassed) {
    res.redirect('/app');
    return;
  }
  authPage(res, 'auth/twofa', { next: safeNext(req.query.next), error: null, left: null });
});

authRouter.post('/login/2fa', mfaLimiter, async (req, res) => {
  const principal = req.principal;
  const sent = stringField(req.body, '_csrf', 100);
  if (!principal || principal.session.mfaPassed || !safeEqual(sent, principal.session.csrfToken)) {
    res.redirect('/login');
    return;
  }
  const next = safeNext(stringField(req.body, 'next', 300));
  const result = await completeMfa(
    principal.session.id,
    stringField(req.body, 'code', 40),
    requestMeta(req),
  );
  if (result.kind === 'reset') {
    clearSessionCookie(res);
    setFlash(res, 'error', 'auth.errors.mfaReset');
    res.redirect('/login');
    return;
  }
  if (result.kind === 'invalid') {
    authPage(res, 'auth/twofa', { next, error: 'auth.errors.mfaInvalid', left: result.left }, 401);
    return;
  }
  if (result.recovery) setFlash(res, 'info', 'flash.recoveryUsed');
  res.redirect(principal.user.role !== 'CUSTOMER' && next === '/app' ? '/admin' : next);
});

authRouter.post('/logout', async (req, res) => {
  const principal = req.principal;
  const sent = stringField(req.body, '_csrf', 100);
  if (principal && safeEqual(sent, principal.session.csrfToken)) {
    await destroySessionById(principal.session.id);
    await audit(customerActor(principal.user, requestMeta(req)), {
      action: 'auth.logout',
      targetType: 'user',
      targetId: principal.user.id,
    });
  }
  clearSessionCookie(res);
  res.redirect('/login');
});

/* ----------------------------------- регистрация ----------------------------------- */

authRouter.get('/register', (req, res) => {
  if (req.principal?.session.mfaPassed) {
    res.redirect('/app');
    return;
  }
  ensureDeviceCookie(req, res);
  authPage(res, 'auth/register', {
    pre: preCsrf(req, res),
    values: { email: '', name: '' },
    error: null,
    field: null,
  });
});

authRouter.post('/register', registerLimiter, requirePreAuthCsrf, async (req, res) => {
  const values = {
    email: stringField(req.body, 'email', 254),
    name: stringField(req.body, 'name', 80),
  };
  const locale = isLocale(res.locals.locale) ? res.locals.locale : 'bg';
  const result = await registerAccount(
    {
      ...values,
      password: rawField(req.body, 'password'),
      acceptTerms: stringField(req.body, 'terms') === 'yes',
    },
    requestMeta(req),
    deviceContext(req, res),
    locale,
  );
  if (!result.ok) {
    authPage(
      res,
      'auth/register',
      { pre: preCsrf(req, res), values, error: result.key, field: result.field },
      400,
    );
    return;
  }
  authPage(res, 'auth/check-email', { email: values.email });
});

authRouter.get('/verify-email', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const result = token ? await verifyEmailToken(token, requestMeta(req)) : ({ ok: false } as const);
  authPage(res, 'auth/verified', { result }, result.ok ? 200 : 400);
});

/* ---------------------------------- нова парола ---------------------------------- */

authRouter.get('/forgot', (req, res) => {
  authPage(res, 'auth/forgot', { pre: preCsrf(req, res), sent: false });
});

authRouter.post('/forgot', forgotLimiter, requirePreAuthCsrf, async (req, res) => {
  await requestPasswordReset(stringField(req.body, 'email', 254), requestMeta(req));
  authPage(res, 'auth/forgot', { pre: preCsrf(req, res), sent: true });
});

authRouter.get('/reset', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const valid = token ? await resetTokenValid(token) : false;
  authPage(
    res,
    'auth/reset',
    { pre: preCsrf(req, res), token, valid, error: null },
    valid ? 200 : 400,
  );
});

authRouter.post('/reset', forgotLimiter, requirePreAuthCsrf, async (req, res) => {
  const token = stringField(req.body, 'token', 100);
  const result = await resetPassword(token, rawField(req.body, 'password'), requestMeta(req));
  if (!result.ok) {
    const valid = await resetTokenValid(token);
    authPage(res, 'auth/reset', { pre: preCsrf(req, res), token, valid, error: result.key }, 400);
    return;
  }
  clearSessionCookie(res);
  setFlash(res, 'ok', 'flash.passwordReset');
  res.redirect('/login');
});
