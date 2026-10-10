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

/**
 * Само вписан (паролата е мината), без проверка на втория фактор — за `/auth/me`, `/auth/logout`
 * и `/auth/mfa/*`: пътищата, по които човек довършва или настройва MFA.
 */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.principal) {
    apiError(res, 401, 'login_required');
    return;
  }
  next();
}

/**
 * Политиката за втори фактор: включен TOTP и неминат в тази сесия → 401 `mfa_required`;
 * персонал без TOTP → 403 `mfa_setup_required` (до способностите си не стига, докато не го включи).
 */
export function mfaBlock(p: Principal): { status: number; code: string } | null {
  // Доказан от доставчика на единния вход (amr ∋ mfa) и клиентът му се доверява — за ТАЗИ сесия.
  if (p.mfa.idp === true) return null;
  if (p.mfa.enabled && !p.mfa.passed) return { status: 401, code: 'mfa_required' };
  if (p.mfa.required && !p.mfa.enabled) return { status: 403, code: 'mfa_setup_required' };
  return null;
}

/** Вписан И минал политиката за втори фактор — всеки път към данни минава оттук. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const principal = req.principal;
  if (!principal) {
    apiError(res, 401, 'login_required');
    return;
  }
  const blocked = mfaBlock(principal);
  if (blocked) {
    apiError(res, blocked.status, blocked.code);
    return;
  }
  next();
}

/** Authz след authn (§15.1): способността на ролята, не само „вписан е“ (и вторият фактор). */
export function requireCapability(capability: Capability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const principal = req.principal;
    if (!principal) {
      apiError(res, 401, 'login_required');
      return;
    }
    const blocked = mfaBlock(principal);
    if (blocked) {
      apiError(res, blocked.status, blocked.code);
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
