import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { isAziendaId } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { elencoContratti, richiediFirma } from '../master/contratti.js';
import { annunciaVersione, statoAnnuncio } from '../legale/annunci.js';
import { PREAVVISO_GIORNI, VERSIONE } from '../legale/versioni.js';
import { BUSINESS_TZ } from '../time.js';

/**
 * „Contratti“ в конзолата на MASTER: договорът на всяка фирма (подписан с код, приет без подпис отпреди
 * условията, чакащ), подписът с печата и копието, колко души са приели правилата; „Richiedi la firma“ —
 * фирма, приета без подпис, подписва наистина.
 */
export const masterContrattiRouter: Router = Router();
const manage = requireCapability('aziende:manage');

masterContrattiRouter.get('/master/contratti', manage, async (_req, res) => {
  const righe = await elencoContratti();
  const conta = (stato: string) => righe.filter((r) => !r.disattivata && r.stato === stato).length;
  res.set('Cache-Control', 'no-store').render('master/contratti', {
    righe,
    versione: VERSIONE.CONDIZIONI,
    prossima: await statoAnnuncio('CONDIZIONI'),
    preavviso: PREAVVISO_GIORNI,
    totali: { firmate: conta('firmate'), esistente: conta('esistente'), attesa: conta('attesa') },
  });
});

masterContrattiRouter.post(
  '/master/contratti/:id/richiedi',
  manage,
  requireCsrf,
  async (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !isAziendaId(id))
      return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    const esito = await richiediFirma(principalOf(req).user, id);
    if (esito === 'missing')
      return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    if (typeof esito === 'object')
      setFlash(res, 'info', 'master.contratti.flash.presto', {
        data: new Intl.DateTimeFormat('it-IT', {
          timeZone: BUSINESS_TZ,
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(esito.presto),
      });
    else setFlash(res, esito === 'ok' ? 'ok' : 'error', `master.contratti.flash.${esito}`);
    res.redirect(303, '/master/contratti');
  },
);

/** Обявата на следващата версия на условията (чл. 18.1): лента и писмо до всички администратори. */
masterContrattiRouter.post('/master/contratti/annuncia', manage, requireCsrf, async (req, res) => {
  const esito = await annunciaVersione(principalOf(req).user, 'CONDIZIONI');
  setFlash(res, esito === 'ok' ? 'ok' : 'info', `master.contratti.prossima.flash.${esito}`);
  res.redirect(303, '/master/contratti');
});
