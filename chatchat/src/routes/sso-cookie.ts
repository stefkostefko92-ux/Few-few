import type { Response } from 'express';
import type { SessionDeps } from '../auth/sessions.js';
import { SSO_COOKIE, SSO_STATE_TTL_MS } from '../services/sso/flow.js';
import { SSO_BASE_PATH } from '../services/sso/types.js';

/**
 * Бисквитката на потока (`cc_sso`) — вързва връщането от доставчика към браузъра, който е започнал
 * входа/теста/свързването (login CSRF). Само за пътищата на единния вход.
 */

export function setFlowCookie(res: Response, sessions: SessionDeps, binding: string): void {
  res.cookie(SSO_COOKIE, binding, {
    httpOnly: true,
    secure: sessions.secureCookies,
    // Lax: връщането от доставчика е навигация от чужд сайт — Strict бисквитка не би дошла.
    sameSite: 'lax',
    path: SSO_BASE_PATH,
    maxAge: SSO_STATE_TTL_MS,
  });
}

export function clearFlowCookie(res: Response, sessions: SessionDeps): void {
  res.clearCookie(SSO_COOKIE, {
    httpOnly: true,
    secure: sessions.secureCookies,
    sameSite: 'lax',
    path: SSO_BASE_PATH,
  });
}
