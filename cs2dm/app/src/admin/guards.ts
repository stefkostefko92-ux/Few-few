import type { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { safeEqual } from './crypto.js';
import { can, type Capability } from './rbac.js';
import { renderAdminError } from './render.js';
import { SESSION_COOKIE, readCookie, resolveSession } from './sessions.js';

/**
 * Защитите на панела. Ред на проверките на всеки маршрут: сесия → минат TOTP → включен TOTP →
 * възможност по ролята (§1) → (за POST) Origin + CSRF токен. Действие върху цел проверява и
 * immunity в самия маршрут, ПРЕДИ да пише в базата или да подпише команда.
 */

const SAFE = new Set(['GET', 'HEAD']);

/** Закача вписания човек, ако бисквитката е валидна. Без бисквитка — нула заявки към базата. */
export function attachSession(db: PrismaClient, now: () => Date): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const principal = await resolveSession(db, token, now());
      if (principal) res.locals.admin = principal;
    }
    next();
  };
}

/** Има сесия (TOTP може още да не е минат) — за екраните на втория фактор и изхода. */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!res.locals.admin) {
    if (SAFE.has(req.method)) res.redirect(303, '/admin/login');
    else renderAdminError(req, res, 'csrf');
    return;
  }
  next();
}

/**
 * Пълен достъп: включен и минат TOTP + възможността. Без включен TOTP панелът показва само
 * записването му (§10); с включен, но неминат — екрана за кода.
 */
export function requireCap(capability: Capability): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const principal = res.locals.admin;
    if (!principal) {
      if (SAFE.has(req.method)) res.redirect(303, '/admin/login');
      else renderAdminError(req, res, 'csrf');
      return;
    }
    if (!principal.totpEnabled) {
      res.redirect(303, '/admin/2fa/setup');
      return;
    }
    if (!principal.mfaPassed) {
      res.redirect(303, '/admin/2fa');
      return;
    }
    if (!can(principal.role, capability)) {
      renderAdminError(req, res, 'forbidden');
      return;
    }
    next();
  };
}

/** Заявката е от нашия адрес: Origin, ако браузърът го е пратил; иначе Referer; иначе — токенът. */
export function fromOurOrigin(req: Request): boolean {
  const expected = new URL(config().PUBLIC_BASE_URL).origin;
  const origin = req.get('origin');
  if (origin) return origin === expected;
  const referer = req.get('referer');
  return referer ? referer === expected || referer.startsWith(`${expected}/`) : true;
}

/**
 * CSRF: synchronizer token, вързан със сесията (скрито поле `_csrf` на всяка POST форма), плюс
 * проверка на Origin/Referer. Бисквитката е и SameSite=Lax — междусайтов POST не я носи.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) {
    next();
    return;
  }
  const principal = res.locals.admin;
  const body = req.body as Record<string, unknown> | undefined;
  const sent = typeof body?._csrf === 'string' ? body._csrf : '';
  if (!principal || !sent || !fromOurOrigin(req) || !safeEqual(sent, principal.csrf)) {
    renderAdminError(req, res, 'csrf');
    return;
  }
  next();
}

/** Ограничение по IP в паметта (1 прозорец, нищо не се записва) със страница 429 на езика. */
export function limiter(limit: number, windowMs: number, skipSafe = false): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => skipSafe && SAFE.has(req.method),
    handler: (req, res) => renderAdminError(req, res, 'tooMany'),
  });
}

/** Обвивка на async маршрут: грешката стига до обработчика на панела, не виси. */
export function handler(
  work: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    work(req, res, next).catch(next);
  };
}
