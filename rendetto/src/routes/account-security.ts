import { Router, type Request, type Response } from 'express';
import { prisma } from '../db.js';
import { principalOf } from '../auth/guards.js';
import { remainingRecoveryCodes } from '../auth/recovery.js';
import { rotateSessionToken, setSessionCookie } from '../auth/sessions.js';
import { isStaff } from '../auth/rbac.js';
import { sensitiveLimiter } from '../http/limits.js';
import { rawField, requestMeta, stringField } from '../http/meta.js';
import { listSessions, revokeOtherSessions, revokeOwnSession } from '../services/account-self.js';
import {
  changePassword,
  confirmTotp,
  disableTotp,
  regenerateRecoveryCodes,
  startTotp,
} from '../services/security.js';
import { back, me } from './account-common.js';

/**
 * „Сигурност“ в акаунта: парола, двуфакторна защита, резервни кодове, сесии. Закача се ВЪТРЕ в
 * accountRouter, затова минава през неговата защита (вход + CSRF + no-store).
 */
export const accountSecurityRouter: Router = Router();

/* ------------------------------------- сигурност ------------------------------------- */

async function renderSecurity(
  req: Request,
  res: Response,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const user = await me(req);
  const principal = principalOf(req);
  const [sessions, devices, logins, recoveryLeft] = await Promise.all([
    listSessions(user.id, principal.session.id),
    prisma.device.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    }),
    prisma.loginEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    remainingRecoveryCodes(user.id),
  ]);
  res.render('account/security', {
    user,
    sessions,
    devices,
    logins,
    recoveryLeft,
    staff: isStaff(user.role),
    setup: null,
    codes: null,
    section: 'security',
    ...extra,
  });
}

accountSecurityRouter.get('/account/security', async (req, res) => {
  await renderSecurity(req, res);
});

accountSecurityRouter.post('/account/security/password', sensitiveLimiter, async (req, res) => {
  const user = await me(req);
  const result = await changePassword(
    user,
    rawField(req.body, 'current'),
    rawField(req.body, 'next'),
    principalOf(req).session.id,
    requestMeta(req),
  );
  if (result.ok)
    setSessionCookie(res, await rotateSessionToken(principalOf(req).session.id, user.role));
  back(
    res,
    '/account/security',
    result.ok ? 'ok' : 'error',
    result.ok ? 'flash.passwordChanged' : result.key,
  );
});

accountSecurityRouter.post('/account/security/2fa/start', sensitiveLimiter, async (req, res) => {
  const setup = await startTotp(await me(req));
  if (!setup) {
    back(res, '/account/security', 'info', 'flash.twoFactorAlreadyOn');
    return;
  }
  await renderSecurity(req, res, { setup });
});

accountSecurityRouter.post('/account/security/2fa/confirm', sensitiveLimiter, async (req, res) => {
  const codes = await confirmTotp(
    await me(req),
    stringField(req.body, 'code', 12),
    requestMeta(req),
  );
  if (!codes) {
    back(res, '/account/security', 'error', 'flash.codeMismatch');
    return;
  }
  // Показва се на същата страница с кодовете — не чака следващата.
  res.locals.flash = { kind: 'ok', key: 'flash.twoFactorOn', params: {} };
  await renderSecurity(req, res, { codes });
});

accountSecurityRouter.post('/account/security/2fa/disable', sensitiveLimiter, async (req, res) => {
  const result = await disableTotp(
    await me(req),
    rawField(req.body, 'password'),
    stringField(req.body, 'code', 20),
    requestMeta(req),
  );
  back(
    res,
    '/account/security',
    result.ok ? 'ok' : 'error',
    result.ok ? 'flash.twoFactorOff' : result.key,
  );
});

accountSecurityRouter.post('/account/security/recovery', sensitiveLimiter, async (req, res) => {
  const codes = await regenerateRecoveryCodes(
    await me(req),
    stringField(req.body, 'code', 20),
    requestMeta(req),
  );
  if (!codes) {
    back(res, '/account/security', 'error', 'flash.wrongCode');
    return;
  }
  await renderSecurity(req, res, { codes });
});

accountSecurityRouter.post('/account/security/sessions/:id/revoke', async (req, res) => {
  const ok = await revokeOwnSession(await me(req), String(req.params.id), requestMeta(req));
  back(
    res,
    '/account/security',
    ok ? 'ok' : 'error',
    ok ? 'flash.sessionRevoked' : 'error.notFoundText',
  );
});

accountSecurityRouter.post('/account/security/sessions/revoke-others', async (req, res) => {
  await revokeOtherSessions(await me(req), principalOf(req).session.id, requestMeta(req));
  back(res, '/account/security', 'ok', 'flash.sessionsRevoked');
});
