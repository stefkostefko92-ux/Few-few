import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { me, type AdminCtx, type AdminRoute } from '../context.js';
import { requiredString } from '../forms.js';
import { limiter, requireCsrf, requireSession } from '../guards.js';
import { renderAdmin } from '../render.js';
import {
  clearSessionCookie,
  destroyAllSessions,
  passMfa,
  recordMfaFailure,
  setSessionCookie,
} from '../sessions.js';
import {
  acceptRecoveryCode,
  acceptTotp,
  enableTotp,
  issueRecoveryCodes,
  remainingRecoveryCodes,
  setupView,
} from '../totp-service.js';

/**
 * Вторият фактор (§10): без включен TOTP панелът показва САМО записването му. Пет грешни кода в
 * една сесия → сесията пада и входът започва отначало (плюс ограничението по IP).
 */
const codeBody = z.object({ code: requiredString(32) });

export function totpRouter(ctx: AdminCtx, mfaLimit: number): Router {
  const router = Router();
  const mfaLimiter = limiter(mfaLimit, 15 * 60_000);

  /** Грешен код: брои се; на петия — изход. Връща true, ако сесията е паднала. */
  async function failed(res: Response, sessionId: string): Promise<boolean> {
    if (await recordMfaFailure(ctx.db, sessionId)) return false;
    clearSessionCookie(res);
    res.redirect(303, '/admin/login?e=locked');
    return true;
  }

  router.get('/2fa', requireSession, (req: Request, res: Response) => {
    const principal = me(res);
    if (!principal.totpEnabled) return res.redirect(303, '/admin/2fa/setup');
    if (principal.mfaPassed) return res.redirect(303, '/admin');
    renderAdmin(req, res, 'totp', { error: null });
  });

  router.post(
    '/2fa',
    mfaLimiter,
    requireSession,
    requireCsrf,
    async (req: Request, res: Response) => {
      const principal = me(res);
      if (!principal.totpEnabled) return res.redirect(303, '/admin/2fa/setup');
      if (principal.mfaPassed) return res.redirect(303, '/admin');
      const body = codeBody.safeParse(req.body);
      const code = body.success ? body.data.code : '';
      const ok =
        (await acceptTotp(ctx, principal.steamId, code, true)) ||
        (await acceptRecoveryCode(ctx, principal.steamId, code));
      if (!ok) {
        if (await failed(res, principal.sessionId)) return;
        renderAdmin(req, res, 'totp', { error: 'badCode' }, 400);
        return;
      }
      const token = await passMfa(ctx.db, principal);
      if (!token) return res.redirect(303, '/admin/login?e=expired');
      await audit(ctx.db, { actor: principal.steamId, action: 'web.login' });
      setSessionCookie(res, token);
      res.redirect(303, '/admin');
    },
  );

  router.get('/2fa/setup', requireSession, async (req: Request, res: Response) => {
    const principal = me(res);
    if (principal.totpEnabled) return res.redirect(303, '/admin/2fa');
    const setup = await setupView(ctx, principal.steamId, principal.steamId);
    renderAdmin(req, res, 'totp-setup', { setup, error: null });
  });

  router.post(
    '/2fa/setup',
    mfaLimiter,
    requireSession,
    requireCsrf,
    async (req: Request, res: Response) => {
      const principal = me(res);
      if (principal.totpEnabled) return res.redirect(303, '/admin/2fa');
      const body = codeBody.safeParse(req.body);
      const ok = body.success && (await acceptTotp(ctx, principal.steamId, body.data.code, false));
      const codes = ok ? await enableTotp(ctx, principal.steamId) : null;
      if (!codes) {
        if (await failed(res, principal.sessionId)) return;
        const setup = await setupView(ctx, principal.steamId, principal.steamId);
        renderAdmin(req, res, 'totp-setup', { setup, error: 'badCode' }, 400);
        return;
      }
      const token = await passMfa(ctx.db, principal);
      if (!token) return res.redirect(303, '/admin/login?e=expired');
      await audit(ctx.db, { actor: principal.steamId, action: 'web.login' });
      setSessionCookie(res, token);
      // Кодовете се показват веднъж — страницата е `no-store` (целият панел).
      renderAdmin(req, res, 'recovery-codes', { codes });
    },
  );

  return router;
}

/** Акаунтът на вписания: резервни кодове и изход от всички устройства. */
export function accountRoutes(ctx: AdminCtx): AdminRoute[] {
  return [
    {
      method: 'get',
      path: '/account',
      cap: 'panel',
      handle: async (req, res) => {
        const remaining = await remainingRecoveryCodes(ctx, me(res).steamId);
        renderAdmin(req, res, 'account', { remaining, error: null, current: 'account' });
      },
    },
    {
      method: 'post',
      path: '/account/recovery',
      cap: 'panel',
      handle: async (req, res) => {
        const principal = me(res);
        const body = codeBody.safeParse(req.body);
        // Нов комплект само срещу ТЕКУЩ код от приложението (не резервен).
        if (!body.success || !(await acceptTotp(ctx, principal.steamId, body.data.code, true))) {
          const remaining = await remainingRecoveryCodes(ctx, principal.steamId);
          renderAdmin(req, res, 'account', { remaining, error: 'badCode' }, 400);
          return;
        }
        const codes = await ctx.db.$transaction(async (tx) => {
          const issued = await issueRecoveryCodes(ctx, tx, principal.steamId);
          await audit(tx, { actor: principal.steamId, action: 'totp.recovery_regenerate' });
          return issued;
        });
        renderAdmin(req, res, 'recovery-codes', { codes });
      },
    },
    {
      method: 'post',
      path: '/account/logout-all',
      cap: 'panel',
      handle: async (_req, res) => {
        const principal = me(res);
        await destroyAllSessions(ctx.db, principal.steamId);
        await audit(ctx.db, { actor: principal.steamId, action: 'web.logout_all' });
        clearSessionCookie(res);
        res.redirect(303, '/admin/login');
      },
    },
  ];
}
