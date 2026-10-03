import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { safeEqual } from '../crypto.js';
import { setFlash } from '../http/flash.js';
import { can, isStaff, type Capability } from './rbac.js';
import type { Principal } from '../types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function wantsJson(req: Request): boolean {
  return req.path.includes('/api/') || req.get('accept')?.includes('application/json') === true;
}

/** Страница за грешка на езика на заявката. Текстът е ключ от речника, никога суров. */
export function renderError(
  res: Response,
  status: number,
  titleKey: string,
  messageKey: string,
): void {
  res.status(status).render('errors/error', { titleKey, messageKey, status });
}

function deny(req: Request, res: Response, status: number, key: string): void {
  if (wantsJson(req)) {
    res.status(status).json({ error: res.locals.t(key) as string, code: key });
    return;
  }
  renderError(res, status, status === 403 ? 'error.forbiddenTitle' : 'error.title', key);
}

/** Вписан човек с минат втори фактор (ако е включен). Без това — към входа. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    if (wantsJson(req)) {
      res.status(401).json({ error: res.locals.t('error.loginNeeded') as string, code: 'login' });
      return;
    }
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (!principal.session.mfaPassed) {
    if (wantsJson(req)) {
      res.status(401).json({ error: res.locals.t('error.mfaNeeded') as string, code: 'mfa' });
      return;
    }
    res.redirect('/login/2fa');
    return;
  }
  next();
}

export function principalOf(req: Request): Principal {
  if (!req.principal) throw new Error('Няма вписан потребител — липсва requireUser.');
  return req.principal;
}

/**
 * Персонал със способността. Вторият фактор е ЗАДЪЛЖИТЕЛЕН за персонала: без включен TOTP
 * панелът не се отваря — човекът отива да го включи.
 */
export function requireStaff(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireUser(req, res, () => {
      const principal = principalOf(req);
      if (!isStaff(principal.user.role)) {
        deny(req, res, 403, 'error.notStaff');
        return;
      }
      if (!principal.user.totpEnabledAt) {
        setFlash(res, 'info', 'flash.staffNeeds2fa');
        res.redirect('/account/security');
        return;
      }
      if (!can(principal.user.role, capability)) {
        deny(req, res, 403, 'error.noCapability');
        return;
      }
      next();
    });
  };
}

/**
 * CSRF: synchronizer token, обвързан със сесията (скрито поле `_csrf` или `x-csrf-token`), плюс
 * проверка на Origin/Referer спрямо нашия адрес. Бисквитката на сесията е и SameSite=Strict.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const expectedOrigin = new URL(config().PUBLIC_BASE_URL).origin;
  const origin = req.get('origin');
  const referer = req.get('referer');
  const sameOrigin = origin
    ? origin === expectedOrigin
    : referer
      ? referer.startsWith(`${expectedOrigin}/`)
      : true;
  const body = req.body as Record<string, unknown> | undefined;
  const sent =
    (typeof body?._csrf === 'string' ? body._csrf : null) ?? req.get('x-csrf-token') ?? '';
  const principal = req.principal;
  if (!sameOrigin || !principal || !sent || !safeEqual(sent, principal.session.csrfToken)) {
    deny(req, res, 403, 'error.csrf');
    return;
  }
  next();
}

/** CSRF за формите ПРЕДИ вход (вход, регистрация): двойна бисквитка + проверка на Origin. */
export const PRE_CSRF_COOKIE = 'rd_pre';
export function requirePreAuthCsrf(req: Request, res: Response, next: NextFunction): void {
  const expectedOrigin = new URL(config().PUBLIC_BASE_URL).origin;
  const origin = req.get('origin');
  const cookie = ((req.cookies ?? {}) as Record<string, string | undefined>)[PRE_CSRF_COOKIE] ?? '';
  const sent = (req.body as Record<string, unknown> | undefined)?._csrf;
  const ok =
    (!origin || origin === expectedOrigin) &&
    typeof sent === 'string' &&
    cookie.length >= 20 &&
    safeEqual(sent, cookie);
  if (!ok) {
    deny(req, res, 403, 'error.csrf');
    return;
  }
  next();
}
