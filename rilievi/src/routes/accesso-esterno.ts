import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  principalOf,
  requireCsrf,
  requirePreAuthCsrf,
  requireUser,
  safeNext,
  sendError,
} from '../auth/guards.js';
import {
  ErroreOidc,
  fornitoriConfigurati,
  identitaDaCodice,
  urlAutorizzazione,
} from '../auth/oidc.js';
import {
  consumaStato,
  isFornitore,
  leggiStato,
  nuovoStato,
  STATO_MS,
  type Fornitore,
  type StatoOidc,
} from '../auth/oidc-stato.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  destroySessionById,
  setSessionCookie,
} from '../auth/sessions.js';
import { isProduction } from '../config.js';
import { prisma } from '../db.js';
import { readCookie } from '../http/cookies.js';
import { setFlash } from '../http/flash.js';
import { loginLimiter, ritornoLimiter } from '../http/limits.js';
import { logger } from '../logger.js';
import {
  accediConIdentita,
  collegaIdentita,
  fornitoriDelleAziende,
  fornitoriVisibili,
  NOME_FORNITORE,
  scollegaIdentita,
} from '../services/accesso-esterno.js';
import { creaSfida } from '../services/login-2fa.js';
import { reauthPassword } from '../services/reauth.js';
import { renderAccount } from './account.js';
import { durataBlocco, renderCodice, setSfidaCookie } from './auth-codice.js';
import { noStore, renderLogin } from './auth-vista.js';

/**
 * Входът с доставчика на самоличност на клиента (D1, чл. 4.6): „Accedi con Microsoft/Google“ на страницата
 * за вход (форма с двойната бисквитка → доставчикът), връщането (`/ritorno`: state от бисквитката, кодът,
 * проверката на токена — src/auth/oidc.ts — после сесия, кодът на 2FA или причината) и свързването от
 * „Account“ (паролата → доставчикът → връщането с акаунта и сесията, които са започнали). Състоянието е в
 * бисквитка HttpOnly, SameSite=Lax (връщането е навигация от доставчика), 10 минути, веднъж.
 */
export const accessoEsternoRouter: Router = Router();

const cookieName = (): string => (isProduction() ? '__Host-rilievi_oidc' : 'rilievi_oidc');
const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction(),
  path: '/',
  maxAge,
});

/** Доставчикът от адреса — само познат и с регистрирано приложение. */
function fornitoreDi(req: Request): Fornitore | null {
  const f = req.params.fornitore;
  return isFornitore(f) && fornitoriConfigurati().includes(f) ? f : null;
}

const notFound = (req: Request, res: Response): void =>
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');

const nome = (f: Fornitore) => ({ fornitore: NOME_FORNITORE[f] });

/** Бутоните на страницата за вход (и на върнатата с грешка) — в `res.locals`, за renderLogin. */
accessoEsternoRouter.use('/accesso', async (_req, res, next) => {
  res.locals.esterni = await fornitoriVisibili();
  next();
});

async function vaiAlFornitore(
  res: Response,
  fornitore: Fornitore,
  dati: Omit<Parameters<typeof nuovoStato>[0], 'fornitore'>,
): Promise<void> {
  const s = nuovoStato({ fornitore, ...dati });
  const url = await urlAutorizzazione(fornitore, s);
  noStore(res);
  res.cookie(cookieName(), s.cookie, cookieOptions(STATO_MS));
  res.redirect(303, url);
}

accessoEsternoRouter.post(
  '/accesso/esterno/:fornitore',
  loginLimiter,
  requirePreAuthCsrf,
  async (req, res) => {
    const fornitore = fornitoreDi(req);
    if (!fornitore) return notFound(req, res);
    const next = safeNext((req.body as Record<string, unknown>).next);
    try {
      await vaiAlFornitore(res, fornitore, { scopo: 'accesso', next });
    } catch (error) {
      if (!(error instanceof ErroreOidc)) throw error;
      logger.warn({ fornitore, motivo: error.motivo }, 'oidc: доставчикът не отговаря');
      renderLogin(req, res, 503, {
        email: '',
        next,
        error: 'esterno.errore.nonRaggiungibile',
        errorParams: nome(fornitore),
      });
    }
  },
);

/** Състоянието от бисквитката е на този доставчик и този отговор (state в постоянно време). */
const STATO_RE = /^[A-Za-z0-9_-]{43}$/;

function statoValido(s: StatoOidc | null, fornitore: Fornitore, raw: unknown): s is StatoOidc {
  // Само 43 знака base64url: друг знак (UTF-8 с повече байтове) би дал буфери с различна дължина.
  if (!s || s.fornitore !== fornitore || typeof raw !== 'string' || !STATO_RE.test(raw))
    return false;
  return timingSafeEqual(Buffer.from(raw, 'ascii'), Buffer.from(s.stato, 'ascii'));
}

// Свой таван (не loginLimiter — един вход би струвал две места от десетте). Без живо състояние от бисквитката
// — 400 преди всяка заявка навън; живото минава ВЕДНЪЖ (consumaStato), и копие на бисквитката не стига до
// доставчика втори път.
accessoEsternoRouter.get(
  '/accesso/esterno/:fornitore/ritorno',
  ritornoLimiter,
  async (req, res) => {
    const fornitore = fornitoreDi(req);
    if (!fornitore) return notFound(req, res);
    const s = leggiStato(readCookie(req, cookieName()));
    // Веднъж: повторено връщане (назад в браузъра, втори раздел) няма състояние.
    res.clearCookie(cookieName(), cookieOptions(0));
    noStore(res);
    const collega = s?.scopo === 'collega' && Boolean(req.principal);
    const fallisce = (status: number, error: string, params: Record<string, string> = {}) =>
      collega
        ? renderAccount(req, res, status, error, params)
        : renderLogin(req, res, status, {
            email: '',
            next: safeNext(s?.next),
            error,
            errorParams: params,
          });
    const q = req.query;
    if (!statoValido(s, fornitore, q.state) || !consumaStato(s))
      return fallisce(400, 'esterno.errore.scaduto');
    if (typeof q.error === 'string')
      return fallisce(400, 'esterno.errore.annullato', nome(fornitore));
    if (typeof q.code !== 'string' || q.code.length === 0 || q.code.length > 4096)
      return fallisce(400, 'esterno.errore.scaduto');
    let identita;
    try {
      identita = await identitaDaCodice(fornitore, q.code, s);
    } catch (error) {
      if (!(error instanceof ErroreOidc)) throw error;
      logger.warn({ fornitore, motivo: error.motivo }, 'oidc: отговорът не мина проверката');
      return fallisce(400, 'esterno.errore.verifica', nome(fornitore));
    }

    if (s.scopo === 'collega') {
      const principal = req.principal;
      if (!principal || principal.user.id !== s.uid || principal.session.id !== s.sid)
        return fallisce(400, 'esterno.errore.scaduto');
      const esito = await collegaIdentita(principal.user, fornitore, identita);
      if (esito !== 'ok') return fallisce(422, `esterno.errore.${esito}`, nome(fornitore));
      setFlash(res, 'ok', 'esterno.flash.collegato', nome(fornitore));
      return res.redirect(303, '/account');
    }

    const esito = await accediConIdentita(fornitore, identita);
    switch (esito.kind) {
      case 'mfa':
        // Доставчикът замества само паролата: кодът — на същата страница като след паролата.
        setSfidaCookie(res, await creaSfida(esito.userId, safeNext(s.next)));
        return renderCodice(req, res, 200, { error: null });
      case 'ok':
        // Стара сесия в същия браузър (друг човек на същия телефон) не остава жива зад новата.
        if (req.principal) await destroySessionById(req.principal.session.id);
        setSessionCookie(res, await createSession(esito.user));
        return res.redirect(303, esito.user.mustChangePassword ? '/account' : safeNext(s.next));
      case 'locked':
        return fallisce(429, 'auth.error.locked', { durata: durataBlocco(res, esito.minutes) });
      case 'deactivated':
        return fallisce(403, 'auth.error.deactivated');
      default:
        return fallisce(403, `esterno.errore.${esito.kind}`, nome(fornitore));
    }
  },
);

/** Свързването от „Account“ — само с паролата (откраднатата сесия не закача свой акаунт към чуждия). */
accessoEsternoRouter.post(
  '/account/esterno/:fornitore/collega',
  requireUser,
  requireCsrf,
  async (req, res) => {
    const fornitore = fornitoreDi(req);
    const principal = principalOf(req);
    if (
      !fornitore ||
      principal.user.master ||
      !(await fornitoriDelleAziende(principal.user.id)).includes(fornitore)
    )
      return notFound(req, res);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: principal.user.id },
      select: { id: true, passwordHash: true },
    });
    const raw = (req.body as Record<string, unknown>).password;
    const password = typeof raw === 'string' ? raw.slice(0, PASSWORD_MAX_LENGTH * 4) : '';
    const esito = await reauthPassword(user, password);
    if (esito === 'locked') {
      clearSessionCookie(res);
      setFlash(res, 'error', 'flash.bloccatoSessione');
      return res.redirect(303, '/accesso');
    }
    if (esito === 'wrong') return renderAccount(req, res, 422, 'account.error.wrongCurrent');
    try {
      await vaiAlFornitore(res, fornitore, {
        scopo: 'collega',
        next: '/account',
        uid: principal.user.id,
        sid: principal.session.id,
      });
    } catch (error) {
      if (!(error instanceof ErroreOidc)) throw error;
      logger.warn({ fornitore, motivo: error.motivo }, 'oidc: доставчикът не отговаря');
      return renderAccount(req, res, 503, 'esterno.errore.nonRaggiungibile', nome(fornitore));
    }
  },
);

accessoEsternoRouter.post(
  '/account/esterno/:fornitore/scollega',
  requireUser,
  requireCsrf,
  async (req, res) => {
    const f = req.params.fornitore;
    if (!isFornitore(f)) return notFound(req, res);
    const tolto = await scollegaIdentita(principalOf(req).user, f);
    if (tolto) setFlash(res, 'ok', 'esterno.flash.scollegato', nome(f));
    res.redirect(303, '/account');
  },
);
