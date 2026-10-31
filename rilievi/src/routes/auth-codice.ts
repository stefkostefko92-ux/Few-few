import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { issuePreCsrf, requirePreAuthCsrf, safeNext } from '../auth/guards.js';
import { createSession, destroySessionById, setSessionCookie } from '../auth/sessions.js';
import { remainingRecoveryCodes } from '../auth/recovery.js';
import { isProduction } from '../config.js';
import { readCookie } from '../http/cookies.js';
import { setFlash } from '../http/flash.js';
import { loginLimiter } from '../http/limits.js';
import { SFIDA_MS, sfidaValida, verificaSfida } from '../services/login-2fa.js';
import { renderLogin } from './auth-vista.js';

/**
 * Вторият фактор при вход (`/accesso/codice`): кодът от приложението или резервен код след вярна
 * парола. Предизвикателството е в бисквитка (HttpOnly, SameSite=Strict, 10 минути); сесия има едва след
 * верния код. Формата е преди вход — двойна бисквитка за CSRF, като входа.
 */
export const authCodiceRouter: Router = Router();

export function sfidaCookieName(): string {
  return isProduction() ? '__Host-rilievi_2fa' : 'rilievi_2fa';
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: isProduction(),
  path: '/',
  maxAge,
});

export function setSfidaCookie(res: Response, token: string): void {
  res.cookie(sfidaCookieName(), token, cookieOptions(SFIDA_MS));
}

function clearSfidaCookie(res: Response): void {
  res.clearCookie(sfidaCookieName(), cookieOptions(0));
}

/** „15 минути“ / „4 часа“ — колко трае още заключването. */
export function durataBlocco(res: Response, minutes: number): string {
  const t = res.locals.t as (key: string, params?: Record<string, string | number>) => string;
  return minutes < 60
    ? t('auth.durata.minuti', { n: minutes })
    : t('auth.durata.ore', { n: Math.ceil(minutes / 60) });
}

function renderCodice(
  req: Request,
  res: Response,
  status: number,
  view: { error: string | null; errorParams?: Record<string, string | number> },
): void {
  res.set('Cache-Control', 'no-store');
  res
    .status(status)
    .render('auth/codice', { preCsrf: issuePreCsrf(req, res), errorParams: {}, ...view });
}

authCodiceRouter.get('/accesso/codice', async (req, res) => {
  if (!(await sfidaValida(readCookie(req, sfidaCookieName())))) {
    clearSfidaCookie(res);
    res.redirect('/accesso');
    return;
  }
  renderCodice(req, res, 200, { error: null });
});

const codiceSchema = z.object({ codice: z.string().max(64) });

authCodiceRouter.post('/accesso/codice', loginLimiter, requirePreAuthCsrf, async (req, res) => {
  const parsed = codiceSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.codice.trim()) {
    renderCodice(req, res, 400, { error: 'auth.codice.vuoto' });
    return;
  }
  const esito = await verificaSfida(readCookie(req, sfidaCookieName()), parsed.data.codice, req.ip);
  switch (esito.kind) {
    case 'invalid':
      renderCodice(req, res, 401, { error: 'auth.codice.errato', errorParams: { n: esito.left } });
      return;
    case 'throttled':
      renderCodice(req, res, 429, { error: 'auth.error.throttled' });
      return;
    case 'locked':
      clearSfidaCookie(res);
      renderLogin(req, res, 429, {
        email: '',
        next: '/schede',
        error: 'auth.error.locked',
        errorParams: { durata: durataBlocco(res, esito.minutes) },
      });
      return;
    case 'expired':
      clearSfidaCookie(res);
      renderLogin(req, res, 400, { email: '', next: '/schede', error: 'auth.codice.scaduto' });
      return;
    case 'ok': {
      clearSfidaCookie(res);
      // Стара сесия в същия браузър (друг човек на същия телефон) не остава жива зад новата.
      if (req.principal) await destroySessionById(req.principal.session.id);
      setSessionCookie(res, await createSession(esito.user));
      if (esito.via === 'recupero') {
        const n = await remainingRecoveryCodes(esito.user.id);
        setFlash(res, 'info', 'flash.codiceRecupero', { n });
      }
      res.redirect(303, esito.user.mustChangePassword ? '/account' : safeNext(esito.next));
    }
  }
});
