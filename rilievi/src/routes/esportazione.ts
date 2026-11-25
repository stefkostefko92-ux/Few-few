import { Router } from 'express';
import { ESPORTAZIONE_PORTALE_PATH } from '../auth/guards.js';
import {
  campiEsportati,
  campiSchedaFigli,
  FORMATO_ESPORTAZIONE,
  SEZIONI_DATI,
} from '../aziende/formato.js';
import { ESPORTAZIONE_UPDATED } from '../company.js';
import { ESPORTAZIONE_PATH } from '../seo/paths.js';
import {
  esportazioneStructuredData,
  FAQ_ESPORTAZIONE,
  MISURE_GIURISDIZIONE,
  PASSI_CAMBIO,
} from '../seo/structured-esportazione.js';
import { publicCache, siteLocals } from './site.js';

/**
 * Публичната страница `/esportazione` (чл. 26 и 28 Data Act; Allegato B, B.9 и B.14): файлът, полетата на
 * `dati.json` — от същите select-и, с които износът чете (aziende/formato.ts), процедурата и сроковете на
 * смяната, цената, известните ограничения и юрисдикцията.
 */
export const esportazioneRouter: Router = Router();

esportazioneRouter.get(ESPORTAZIONE_PATH, (req, res) => {
  publicCache(req, res);
  const locals = siteLocals(req, ESPORTAZIONE_PATH);
  res.render('site/esportazione', {
    ...locals,
    jsonLd: esportazioneStructuredData(res.locals.t, locals.canonical ?? ''),
    aggiornato: new Date(`${ESPORTAZIONE_UPDATED}T00:00:00Z`),
    formato: FORMATO_ESPORTAZIONE,
    sezioni: SEZIONI_DATI,
    campi: campiEsportati(),
    figli: campiSchedaFigli(),
    scaricaPath: `${locals.publicBase}${ESPORTAZIONE_PORTALE_PATH}/scarica`,
    passi: PASSI_CAMBIO,
    misure: MISURE_GIURISDIZIONE,
    faq: FAQ_ESPORTAZIONE,
  });
});
