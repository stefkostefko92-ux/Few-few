import type { NextFunction, Request, Response } from 'express';
import { safeEqual } from '../crypto.js';
import { can, type Capability } from './rbac.js';
import type { Principal } from './sessions.js';

/** Грешка за API клиента: стабилен код (UI го превежда), без вътрешни подробности. */
export function apiError(res: Response, status: number, code: string): void {
  res.status(status).json({ error: code, code });
}

export function principalOf(req: Request): Principal {
  if (!req.principal) throw new Error('Няма вписан потребител — липсва requireUser.');
  return req.principal;
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    apiError(res, 401, 'login_required');
    return;
  }
  next();
}

/** Authz след authn (§15.1): способността на ролята, не само „вписан е“. */
export function requireCapability(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal) {
      apiError(res, 401, 'login_required');
      return;
    }
    if (!can(principal.user.role, capability)) {
      apiError(res, 403, 'forbidden');
      return;
    }
    next();
  };
}

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF: synchronizer token на сесията в хедър `x-csrf-token` + Origin (ако го има) да е нашият.
 * Бисквитката е и SameSite=Strict — трите заедно.
 */
export function requireCsrf(publicOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (origin && origin !== publicOrigin) {
      apiError(res, 403, 'csrf');
      return;
    }
    const sent = req.get('x-csrf-token') ?? '';
    const principal = req.principal;
    if (!principal || !sent || !safeEqual(sent, principal.session.csrfToken)) {
      apiError(res, 403, 'csrf');
      return;
    }
    next();
  };
}

/** Преди вход няма сесия: само Origin проверка (входът не променя чужди данни). */
export function requireSameOrigin(publicOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get('origin');
    if (origin && origin !== publicOrigin) {
      apiError(res, 403, 'csrf');
      return;
    }
    next();
  };
}
