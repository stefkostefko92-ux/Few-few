import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { can, type Capability } from './rbac.js';
import type { HumanPrincipal } from '../types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function humanPrincipal(req: Request): HumanPrincipal | null {
  return req.principal?.kind === 'human' ? req.principal : null;
}

function wantsJson(req: Request): boolean {
  return req.path.startsWith('/api/') || req.get('accept')?.includes('application/json') === true;
}

/** Вход + минал TOTP (ако е включен). Без това — към входа. */
export function requireLogin(req: Request, res: Response, next: NextFunction): void {
  const principal = humanPrincipal(req);
  if (!principal) {
    if (wantsJson(req)) {
      res.status(401).json({ error: 'Нужен е вход.' });
      return;
    }
    res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (principal.user.totpEnabledAt && !principal.session.mfaPassed) {
    if (wantsJson(req)) {
      res.status(401).json({ error: 'Нужен е втори фактор.' });
      return;
    }
    res.redirect('/admin/2fa');
    return;
  }
  next();
}

/**
 * CSRF (synchronizer token): всяка непроста заявка носи токена на сесията —
 * в скрито поле `_csrf` или заглавие `x-csrf-token`. Бисквитката е и SameSite=Strict.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const principal = humanPrincipal(req);
  const body = req.body as Record<string, unknown> | undefined;
  const sent =
    (typeof body?._csrf === 'string' ? body._csrf : null) ?? req.get('x-csrf-token') ?? '';
  if (!principal || !sent || sent !== principal.session.csrfToken) {
    if (wantsJson(req)) {
      res.status(403).json({ error: 'Невалиден CSRF токен.' });
      return;
    }
    res.status(403).render('admin/error', {
      title: 'Отказано',
      message: 'Формата е с изтекъл или невалиден токен. Опитай отново.',
    });
    return;
  }
  next();
}

export function requireCapability(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = humanPrincipal(req);
    if (!principal || !can(principal.user.role, capability)) {
      if (wantsJson(req)) {
        res.status(403).json({ error: 'Нямаш право за това действие.' });
        return;
      }
      res.status(403).render('admin/error', {
        title: 'Нямаш право',
        message: 'Ролята ти не позволява това действие.',
      });
      return;
    }
    next();
  };
}

export function roleOf(req: Request): Role | null {
  return humanPrincipal(req)?.user.role ?? null;
}
