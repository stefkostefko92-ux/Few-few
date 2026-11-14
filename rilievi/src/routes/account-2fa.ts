import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { principalOf, requireCsrf, requireUser } from '../auth/guards.js';
import { PASSWORD_MAX_LENGTH } from '../auth/password.js';
import { clearSessionCookie } from '../auth/sessions.js';
import { setFlash } from '../http/flash.js';
import type { Reauth } from '../services/reauth.js';
import {
  avviaDueFattori,
  configurazioneDaBozza,
  confermaDueFattori,
  disattivaDueFattori,
  nuoviCodici,
  statoDueFattori,
  type Configurazione,
} from '../services/due-fattori.js';

/**
 * „Verifica in due passaggi“ в профила (`/account/2fa`): включване (парола → QR и код), резервните
 * кодове (показани веднъж), нови кодове и изключване (парола и код). Грешните пароли и кодове тук се
 * броят в заключването; заключи ли се акаунтът, всички сесии падат и човекът е на входа.
 */
export const account2faRouter: Router = Router();

const PATH = '/account/2fa';

type Vista =
  | { modo: 'stato'; error?: string | null; errorParams?: Record<string, string | number> }
  | { modo: 'configura'; setup: Configurazione; bozza: string; error?: string | null }
  | { modo: 'codici'; codici: string[] };

async function render(req: Request, res: Response, status: number, vista: Vista): Promise<void> {
  const stato = await statoDueFattori(principalOf(req).user.id);
  res.set('Cache-Control', 'no-store');
  res.status(status).render('account/due-fattori', { stato, error: null, ...vista });
}

/** Заключен от грешките в сесията: сесиите вече ги няма — към входа. */
function bloccato(res: Response): void {
  clearSessionCookie(res);
  setFlash(res, 'error', 'flash.bloccatoSessione');
  res.redirect(303, '/accesso');
}

const erroreReauth = (error: Reauth | 'attiva' | 'spenta'): string =>
  error === 'wrong'
    ? 'account.dueFattori.errore.credenziali'
    : `account.dueFattori.errore.${error}`;

const password = z.string().max(PASSWORD_MAX_LENGTH * 4);
const codice = z.string().max(64);

account2faRouter.get(PATH, requireUser, async (req, res) => {
  await render(req, res, 200, { modo: 'stato' });
});

account2faRouter.post(`${PATH}/avvia`, requireUser, requireCsrf, async (req, res) => {
  const principal = principalOf(req);
  const parsed = z.object({ password }).safeParse(req.body);
  if (!parsed.success)
    return render(req, res, 400, { modo: 'stato', error: 'account.dueFattori.errore.credenziali' });
  const avvio = await avviaDueFattori(
    principal.user.id,
    principal.session.id,
    parsed.data.password,
  );
  if (!avvio.ok) {
    if (avvio.error === 'locked') return bloccato(res);
    return render(req, res, 400, { modo: 'stato', error: erroreReauth(avvio.error) });
  }
  await render(req, res, 200, { modo: 'configura', setup: avvio.setup, bozza: avvio.bozza });
});

account2faRouter.post(`${PATH}/conferma`, requireUser, requireCsrf, async (req, res) => {
  const principal = principalOf(req);
  const parsed = z.object({ bozza: z.string().max(400), codice }).safeParse(req.body);
  const bozza = parsed.success ? parsed.data.bozza : '';
  const esito = await confermaDueFattori(
    principal.user.id,
    principal.session.id,
    bozza,
    parsed.success ? parsed.data.codice : '',
  );
  if (esito.ok) return render(req, res, 200, { modo: 'codici', codici: esito.codici });
  if (esito.error === 'codice') {
    const setup = await configurazioneDaBozza(principal.user.id, principal.session.id, bozza);
    if (setup)
      return render(req, res, 400, {
        modo: 'configura',
        setup,
        bozza,
        error: 'account.dueFattori.errore.codice',
      });
  }
  setFlash(
    res,
    'error',
    `account.dueFattori.errore.${esito.error === 'codice' ? 'scaduta' : esito.error}`,
  );
  res.redirect(303, PATH);
});

const conferma = z.object({ password, codice });

account2faRouter.post(`${PATH}/codici`, requireUser, requireCsrf, async (req, res) => {
  const parsed = conferma.safeParse(req.body);
  if (!parsed.success)
    return render(req, res, 400, { modo: 'stato', error: 'account.dueFattori.errore.credenziali' });
  const esito = await nuoviCodici(
    principalOf(req).user.id,
    parsed.data.password,
    parsed.data.codice,
  );
  if (!esito.ok) {
    if (esito.error === 'locked') return bloccato(res);
    return render(req, res, 400, { modo: 'stato', error: erroreReauth(esito.error) });
  }
  await render(req, res, 200, { modo: 'codici', codici: esito.codici });
});

account2faRouter.post(`${PATH}/disattiva`, requireUser, requireCsrf, async (req, res) => {
  const parsed = conferma.safeParse(req.body);
  if (!parsed.success)
    return render(req, res, 400, { modo: 'stato', error: 'account.dueFattori.errore.credenziali' });
  const esito = await disattivaDueFattori(
    principalOf(req).user.id,
    parsed.data.password,
    parsed.data.codice,
  );
  if (!esito.ok) {
    if (esito.error === 'locked') return bloccato(res);
    return render(req, res, 400, { modo: 'stato', error: erroreReauth(esito.error) });
  }
  setFlash(res, 'ok', 'account.dueFattori.flash.disattivata');
  res.redirect(303, PATH);
});
