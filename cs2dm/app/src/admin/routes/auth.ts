import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../../config.js';
import { LOCALES, localeFromHeader } from '../../i18n.js';
import { logger } from '../../logger.js';
import type { AdminCtx } from '../context.js';
import { randomToken, safeEqual } from '../crypto.js';
import { first } from '../forms.js';
import { limiter, requireCsrf, requireSession } from '../guards.js';
import { canEnterPanel } from '../rbac.js';
import { renderAdmin } from '../render.js';
import {
  LOGIN_COOKIE,
  LOGIN_NONCE_TTL_MS,
  clearSessionCookie,
  cookieOptions,
  createSession,
  destroySession,
  readCookie,
  setSessionCookie,
  setSessionLang,
} from '../sessions.js';
import { steamLoginUrl, verifySteamResponse } from '../steam-openid.js';

/**
 * Входът със Steam (OpenID 2.0, §10). Еднократен nonce в бисквитка `__Host-cs2dm_oid` и в
 * `return_to`: отговор на Steam се приема само в браузъра, който е започнал входа, и само веднъж.
 * Достъп само при `players.role ≥ HELPER`; непознат SteamID или по-ниска роля → отказ БЕЗ сесия.
 */
const LOGIN_ERRORS = ['denied', 'failed', 'expired', 'locked'] as const;
const loginQuery = z.object({
  e: z.preprocess(first, z.enum(LOGIN_ERRORS).optional()).catch(undefined),
});
const langBody = z.object({
  lang: z.preprocess(first, z.enum(LOCALES)),
  // Връщане само към страница на панела — никога към чужд адрес.
  to: z.preprocess(first, z.string().regex(/^\/admin(?:\/[A-Za-z0-9/_-]*)?$/)).catch('/admin'),
});

export function returnUrl(nonce: string): string {
  return `${config().PUBLIC_BASE_URL}/admin/login/return?n=${nonce}`;
}

function nextStep(totpEnabled: boolean): string {
  return totpEnabled ? '/admin/2fa' : '/admin/2fa/setup';
}

export function authRouter(ctx: AdminCtx, loginLimit: number): Router {
  const router = Router();
  const loginLimiter = limiter(loginLimit, 15 * 60_000);

  router.get('/login', (req: Request, res: Response) => {
    const principal = res.locals.admin;
    if (principal) {
      res.redirect(303, principal.mfaPassed ? '/admin' : nextStep(principal.totpEnabled));
      return;
    }
    renderAdmin(req, res, 'login', { error: loginQuery.parse(req.query).e ?? null });
  });

  router.get('/login/steam', loginLimiter, (_req: Request, res: Response) => {
    const nonce = randomToken(24);
    res.cookie(LOGIN_COOKIE, nonce, cookieOptions(LOGIN_NONCE_TTL_MS));
    res.redirect(302, steamLoginUrl(returnUrl(nonce), `${config().PUBLIC_BASE_URL}/`));
  });

  router.get('/login/return', loginLimiter, async (req: Request, res: Response) => {
    const nonce = readCookie(req, LOGIN_COOKIE);
    const sent = first(req.query.n);
    res.clearCookie(LOGIN_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    if (!nonce || typeof sent !== 'string' || !safeEqual(nonce, sent)) {
      res.redirect(303, '/admin/login?e=expired');
      return;
    }
    const result = await verifySteamResponse({
      query: req.query as Record<string, unknown>,
      expectedReturnTo: returnUrl(nonce),
      fetch: ctx.steamFetch,
      now: ctx.now().getTime(),
    });
    if (!result.ok) {
      logger.warn({ reason: result.reason }, 'панел: входът със Steam не мина');
      res.redirect(303, '/admin/login?e=failed');
      return;
    }
    const player = await ctx.db.player.findUnique({
      where: { steamId: result.steamId },
      select: { role: true, totpEnabledAt: true },
    });
    if (!player || !canEnterPanel(player.role)) {
      renderAdmin(req, res, 'login', { error: 'denied' }, 403);
      return;
    }
    const now = ctx.now();
    const token = await createSession(
      ctx.db,
      {
        steamId: result.steamId,
        role: player.role,
        lang: localeFromHeader(req.get('accept-language')),
      },
      now,
    );
    await ctx.db.player.update({ where: { steamId: result.steamId }, data: { webLoginAt: now } });
    setSessionCookie(res, token);
    res.redirect(303, nextStep(player.totpEnabledAt !== null));
  });

  router.post('/logout', requireSession, requireCsrf, async (_req: Request, res: Response) => {
    const principal = res.locals.admin;
    if (principal) await destroySession(ctx.db, principal.sessionId);
    clearSessionCookie(res);
    res.redirect(303, '/admin/login');
  });

  router.post('/lang', requireSession, requireCsrf, async (req: Request, res: Response) => {
    const principal = res.locals.admin;
    const body = langBody.safeParse(req.body);
    if (principal && body.success)
      await setSessionLang(ctx.db, principal.sessionId, body.data.lang);
    res.redirect(303, body.success ? body.data.to : '/admin');
  });

  return router;
}
