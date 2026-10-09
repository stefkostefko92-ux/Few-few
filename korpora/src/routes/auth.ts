import type { Role } from '@prisma/client';
import { Router, type Request, type Response } from 'express';
import { config, isProduction } from '../config.js';
import { safeEqual } from '../crypto.js';
import {
  deviceCookieHash,
  ensureDeviceCookie,
  parseFingerprint,
  readDeviceCookie,
} from '../auth/device.js';
import {
  fromOurOrigin,
  isPreCsrfToken,
  newPreCsrfToken,
  PRE_CSRF_COOKIE,
  PRE_CSRF_MAX_AGE_MS,
  requirePreAuthCsrf,
} from '../auth/guards.js';
import { clearSessionCookie, destroySessionById, setSessionCookie } from '../auth/sessions.js';
import { isStaff } from '../auth/rbac.js';
import { linkHours } from '../auth/tokens.js';
import { readCookie } from '../http/cookies.js';
import { setFlash } from '../http/flash.js';
import { errorMessage, logger } from '../logger.js';
import {
  forgotLimiter,
  loginLimiter,
  mfaLimiter,
  registerLimiter,
  resetLimiter,
  verifyLimiter,
} from '../http/limits.js';
import { rawField, requestMeta, safeNext, stringField } from '../http/meta.js';
import { PATHS } from '../seo/paths.js';
import { audit } from '../audit.js';
import { attemptLogin, completeMfa } from '../services/login.js';
import { emailLinkKind, registerAccount, verifyEmailToken } from '../services/registration.js';
import { requestPasswordReset, resetPassword, resetTokenValid } from '../services/security.js';
import { customerActor } from '../services/auth-common.js';
import { signInMayReadFingerprint } from '../services/device-consent.js';
import type { DeviceContext } from '../services/devices.js';

export const authRouter: Router = Router();

/** CSRF токен за формите преди вход: двойна бисквитка (стойността е и в скритото поле). */
function preCsrf(req: Request, res: Response): string {
  const existing = readCookie(req, PRE_CSRF_COOKIE);
  if (existing && isPreCsrfToken(existing)) return existing;
  const token = newPreCsrfToken();
  res.cookie(PRE_CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/',
    maxAge: PRE_CSRF_MAX_AGE_MS,
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
    .render(view, { noindex: true, paths: PATHS, ...data });
}

/** Персоналът, тръгнал към проектите, каца в администрацията — след вход със и без втори фактор. */
function landing(role: Role, next: string): string {
  return isStaff(role) && next === '/app' ? '/admin' : next;
}

/* -------------------------------------- вход -------------------------------------- */

authRouter.get('/login', async (req, res) => {
  if (req.principal?.session.mfaPassed) {
    res.redirect(safeNext(req.query.next));
    return;
  }
  authPage(res, 'auth/login', {
    pre: preCsrf(req, res),
    next: safeNext(req.query.next, ''),
    email: '',
    error: null,
    fingerprint: await signInMayReadFingerprint(readDeviceCookie(req)),
  });
});

authRouter.post('/login', loginLimiter, requirePreAuthCsrf, async (req, res) => {
  const meta = requestMeta(req);
  const email = stringField(req.body, 'email', 254);
  const next = safeNext(stringField(req.body, 'next', 300));
  const device = deviceContext(req, res);
  const result = await attemptLogin(email, rawField(req.body, 'password'), meta, device);
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
      res.redirect(landing(result.user.role, next));
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
  res.redirect(landing(principal.user.role, next));
});

authRouter.post('/logout', async (req, res) => {
  const principal = req.principal;
  // Сесията пада и с остаряла форма (токенът е сменен в друг раздел), затова токенът не се иска. Пази
  // Origin: SameSite=Strict пуска бисквитката и от съседен поддомейн (същият сайт), така че заявка от
  // чужд адрес само връща към входа, без да трие сесията.
  if (!fromOurOrigin(req, true)) {
    res.redirect('/login');
    return;
  }
  if (principal) {
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
  authPage(res, 'auth/register', {
    pre: preCsrf(req, res),
    values: { email: '', name: '', deviceConsent: false },
    error: null,
    field: null,
  });
});

authRouter.post('/register', registerLimiter, requirePreAuthCsrf, async (req, res) => {
  const values = {
    email: stringField(req.body, 'email', 254),
    name: stringField(req.body, 'name', 80),
    deviceConsent: stringField(req.body, 'deviceConsent') === 'yes',
  };
  const result = await registerAccount(
    {
      ...values,
      password: rawField(req.body, 'password'),
      acceptTerms: stringField(req.body, 'terms') === 'yes',
    },
    requestMeta(req),
    deviceContext(req, res),
    res.locals.locale,
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
  authPage(res, 'auth/check-email', { email: values.email, hours: linkHours('VERIFY_EMAIL') });
});

/**
 * Връзката от писмото само показва бутона — потвърждава POST. Програмите, които проверяват пощата,
 * отварят връзките преди човека; ако GET изразходваше токена, човекът би намерил „невалидна връзка“.
 */
authRouter.get('/verify-email', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const kind = token ? await emailLinkKind(token) : null;
  if (!kind) {
    authPage(res, 'auth/verified', { result: { ok: false } }, 400);
    return;
  }
  authPage(res, 'auth/verify-email', { pre: preCsrf(req, res), token, kind });
});

authRouter.post('/verify-email', verifyLimiter, requirePreAuthCsrf, async (req, res) => {
  const token = stringField(req.body, 'token', 100);
  const device = deviceCookieHash(ensureDeviceCookie(req, res));
  const result = token
    ? await verifyEmailToken(token, requestMeta(req), device)
    : ({ ok: false } as const);
  if (result.ok && result.kind === 'setPassword') {
    // на друго устройство: потвърждението минава през нова парола (виж verifyEmailToken)
    res.redirect(303, `/reset?token=${encodeURIComponent(result.resetToken)}&from=verify`);
    return;
  }
  // токенът вече е изразходван: същият адрес с друг език би показал „връзката не работи“
  res.locals.hideLangs = true;
  authPage(res, 'auth/verified', { result }, result.ok ? 200 : 400);
});

/* ---------------------------------- нова парола ---------------------------------- */

/** „Забравена парола“: формата или „изпратихме връзка“ — срокът на връзката идва от кода. */
function forgotPage(req: Request, res: Response, sent: boolean): void {
  const hours = linkHours('RESET_PASSWORD');
  authPage(res, 'auth/forgot', { pre: preCsrf(req, res), sent, hours });
}

authRouter.get('/forgot', (req, res) => forgotPage(req, res, false));

/**
 * Отговорът не чака работата: за познат имейл тя е по-дълга (връзка, писмо, одит), а времето на отговора
 * не бива да казва дали има акаунт. Грешка в нея отива в лога, не в отговора.
 */
authRouter.post('/forgot', forgotLimiter, requirePreAuthCsrf, (req, res) => {
  void requestPasswordReset(stringField(req.body, 'email', 254), requestMeta(req)).catch(
    (error: unknown) => logger.error({ err: errorMessage(error) }, 'нова парола: заявката не мина'),
  );
  forgotPage(req, res, true);
});

authRouter.get('/reset', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const valid = token ? await resetTokenValid(token) : false;
  authPage(
    res,
    'auth/reset',
    { pre: preCsrf(req, res), token, valid, error: null, fromVerify: req.query.from === 'verify' },
    valid ? 200 : 400,
  );
});

authRouter.post('/reset', resetLimiter, requirePreAuthCsrf, async (req, res) => {
  const token = stringField(req.body, 'token', 100);
  const result = await resetPassword(token, rawField(req.body, 'password'), requestMeta(req));
  if (!result.ok) {
    const valid = await resetTokenValid(token);
    // „Задайте парола“ след потвърждение от друго устройство остава такава и след отхвърлена парола
    const fromVerify = stringField(req.body, 'from', 10) === 'verify';
    authPage(
      res,
      'auth/reset',
      { pre: preCsrf(req, res), token, valid, error: result.key, fromVerify },
      400,
    );
    return;
  }
  clearSessionCookie(res);
  setFlash(res, 'ok', 'flash.passwordReset');
  res.redirect('/login');
});
