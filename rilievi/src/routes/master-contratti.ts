import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { isAziendaId } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { elencoContratti, richiediFirma } from '../master/contratti.js';
import { VERSIONE } from '../legale/versioni.js';

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
    setFlash(res, esito === 'ok' ? 'ok' : 'error', `master.contratti.flash.${esito}`);
    res.redirect(303, '/master/contratti');
  },
);
