import { Router, type Request, type Response } from 'express';
import { issuePreCsrf, requirePreAuthCsrf } from '../auth/guards.js';
import { SEGNALAZIONI_UPDATED } from '../company.js';
import { segnalazioniLimiter } from '../http/limits.js';
import {
  CAMPI_SEGNALAZIONE,
  leggiSegnalazione,
  LIMITI_SEGNALAZIONE,
  TRAPPOLA,
  valoriVuoti,
  type CampoSegnalazione,
  type ValoriSegnalazione,
} from '../segnalazioni/form.js';
import { registraSegnalazione } from '../segnalazioni/servizio.js';
import { SEGNALAZIONE_INVIATA_PATH, SEGNALAZIONI_PATH } from '../seo/paths.js';
import { segnalazioniStructuredData } from '../seo/structured-pagine.js';
import { siteLocals } from './site.js';

/**
 * Публичната страница за сигнали за незаконно съдържание (чл. 11, 12 и 16 от Регламент (ЕС) 2022/2065; условията
 * 2026-11-13, чл. 25): точката за контакт, какво се сигнализира, формулярът, какво става после и как се възразява.
 * Формулярът работи без JavaScript и без вход: двойна бисквитка срещу CSRF, капан за ботове, таван по мрежа и за
 * денонощие. Решава MASTER — отговорникът за модерирането (routes/master-segnalazioni.ts).
 */
export const segnalazioniRouter: Router = Router();

function vista(
  req: Request,
  res: Response,
  status: number,
  valori: ValoriSegnalazione,
  errori: Partial<Record<CampoSegnalazione, string>>,
  errore: 'troppe' | null = null,
): void {
  const locals = siteLocals(req, SEGNALAZIONI_PATH);
  // Формата носи токена на бисквитка с кратък живот — страницата не се пази (както витрината).
  res.set('Cache-Control', 'no-store');
  res.status(status).render('site/segnalazioni', {
    ...locals,
    jsonLd: segnalazioniStructuredData(res.locals.t, locals.canonical ?? '', locals.contactEmail),
    preCsrf: issuePreCsrf(req, res),
    trappola: TRAPPOLA,
    campi: CAMPI_SEGNALAZIONE,
    limiti: LIMITI_SEGNALAZIONE,
    valori,
    errori,
    errore,
    aggiornato: new Date(`${SEGNALAZIONI_UPDATED}T12:00:00Z`),
  });
}

segnalazioniRouter.get(SEGNALAZIONI_PATH, (req, res) => vista(req, res, 200, valoriVuoti(), {}));

segnalazioniRouter.post(
  SEGNALAZIONI_PATH,
  segnalazioniLimiter,
  requirePreAuthCsrf,
  async (req, res) => {
    const letta = leggiSegnalazione(req.body as Record<string, unknown>);
    // Ботът получава същия отговор като човека — нищо не се пази, нищо не му подсказва капана.
    if (letta.kind === 'spam') return res.redirect(303, SEGNALAZIONE_INVIATA_PATH);
    if (letta.kind === 'invalid') return vista(req, res, 422, letta.valori, letta.errori);
    const esito = await registraSegnalazione(letta.dati);
    if (!esito.ok)
      return vista(
        req,
        res,
        429,
        {
          ...letta.dati,
          nome: letta.dati.nome ?? '',
          email: letta.dati.email ?? '',
          buonaFede: false,
        },
        {},
        'troppe',
      );
    const senza = letta.dati.email ? '' : '&email=no';
    res.redirect(303, `${SEGNALAZIONE_INVIATA_PATH}?rif=${esito.riferimento}${senza}`);
  },
);

segnalazioniRouter.get(SEGNALAZIONE_INVIATA_PATH, (req, res) => {
  const rif = typeof req.query.rif === 'string' ? req.query.rif : '';
  res.set('Cache-Control', 'no-store');
  res.render('site/segnalazione-inviata', {
    ...siteLocals(req, null),
    // Само вид на номер — нищо от адреса не влиза в страницата без проверка.
    riferimento: /^SG-[0-9A-Z]{8}$/.test(rif) ? rif : null,
    senzaEmail: req.query.email === 'no',
  });
});
