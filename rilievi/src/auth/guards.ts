import type { NextFunction, Request, Response } from 'express';
import { config, isProduction } from '../config.js';
import { randomToken, safeEqual } from '../crypto.js';
import { readCookie } from '../http/cookies.js';
import { setFlash } from '../http/flash.js';
import { HOUR } from '../time.js';
import { can, type Capability } from './roles.js';
import type { Principal } from '../types.js';

/** Методите, които не променят нищо: без CSRF проверка и извън тавана на записите. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Заявка от живата търсачка (`fetch` с `X-Partial: 1`) — иска парче HTML, не цяла страница. */
export function isPartial(req: Request): boolean {
  return req.get('x-partial') === '1';
}

/** Страница за грешка. Текстът е ключ от речника, никога суров. */
export function renderError(
  res: Response,
  status: number,
  titleKey: string,
  messageKey: string,
): void {
  res.status(status).render('errors/error', { titleKey, messageKey, status });
}

export function sendError(
  req: Request,
  res: Response,
  status: number,
  titleKey: string,
  messageKey: string,
): void {
  if (isPartial(req)) {
    res.status(status).type('text/plain').send(res.locals.t(messageKey));
    return;
  }
  renderError(res, status, titleKey, messageKey);
}

/** Само наш път: `/…`, никога `//host` или `/\host` (браузърът ги чете като чужд адрес). */
export function safeNext(raw: unknown, fallback = '/schede'): string {
  if (typeof raw !== 'string' || raw.length > 500) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

/** Докато първата парола не е сменена, отворени са само тези пътища. */
const WHILE_MUST_CHANGE = new Set(['/account', '/account/password', '/esci']);

/** Вписан човек. Без това — към входа (с връщане тук след него). */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    if (isPartial(req)) {
      res.status(401).type('text/plain').send(res.locals.t('error.loginNeeded'));
      return;
    }
    const back = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
    res.redirect(`/accesso${back}`);
    return;
  }
  if (principal.user.mustChangePassword && !WHILE_MUST_CHANGE.has(req.path)) {
    setFlash(res, 'info', 'flash.mustChangePassword');
    res.redirect('/account');
    return;
  }
  next();
}

export function principalOf(req: Request): Principal {
  if (!req.principal) throw new Error('Няма вписан потребител — липсва requireUser.');
  return req.principal;
}

/** Вписан човек със способността (roles.ts). Проверката е тук, на сървъра — скрит бутон не пази нищо. */
export function requireCapability(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireUser(req, res, () => {
      if (!can(principalOf(req).user.role, capability)) {
        sendError(req, res, 403, 'error.forbiddenTitle', 'error.forbidden');
        return;
      }
      next();
    });
  };
}

/**
 * Заявката е от нашия адрес: Origin, ако браузърът го е пратил; иначе (с `referer`) и Referer. Без
 * двата — да: тогава пазят токенът и SameSite.
 */
function fromOurOrigin(req: Request, referer: boolean): boolean {
  const expected = new URL(config().PUBLIC_BASE_URL).origin;
  const origin = req.get('origin');
  if (origin) return origin === expected;
  const from = referer ? req.get('referer') : undefined;
  return from ? from === expected || from.startsWith(`${expected}/`) : true;
}

/**
 * CSRF: synchronizer token, вързан за сесията (скрито поле `_csrf` или `x-csrf-token`), плюс
 * проверка на Origin/Referer спрямо нашия адрес.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
  const sent =
    (typeof body?._csrf === 'string' ? body._csrf : null) ?? req.get('x-csrf-token') ?? '';
  const principal = req.principal;
  if (
    !fromOurOrigin(req, true) ||
    !principal ||
    !sent ||
    !safeEqual(sent, principal.session.csrfToken)
  ) {
    sendError(req, res, 403, 'error.forbiddenTitle', 'error.csrf');
    return;
  }
  next();
}

/** CSRF за формите ПРЕДИ вход (вход, покана, нова парола): двойна бисквитка + проверка на Origin. */
export const PRE_CSRF_MAX_AGE_MS = 2 * HOUR;

export function preCsrfCookieName(): string {
  return isProduction() ? '__Host-rilievi_pre' : 'rilievi_pre';
}

function isPreCsrfToken(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/** Токенът за формата преди вход: съществуващият от бисквитката или нов (и бисквитката с него). */
export function issuePreCsrf(req: Request, res: Response): string {
  const current = readCookie(req, preCsrfCookieName());
  if (isPreCsrfToken(current)) return current;
  const token = randomToken(24);
  res.cookie(preCsrfCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: PRE_CSRF_MAX_AGE_MS,
  });
  return token;
}

export function requirePreAuthCsrf(req: Request, res: Response, next: NextFunction): void {
  const cookie = readCookie(req, preCsrfCookieName());
  const sent = (req.body as Record<string, unknown> | undefined)?._csrf;
  const ok =
    fromOurOrigin(req, false) &&
    typeof sent === 'string' &&
    isPreCsrfToken(cookie) &&
    safeEqual(sent, cookie);
  if (!ok) {
    sendError(req, res, 403, 'error.forbiddenTitle', 'error.csrf');
    return;
  }
  next();
}
