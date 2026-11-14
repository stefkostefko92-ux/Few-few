import { Router } from 'express';
import { impostaAbbonamento, leggiAbbonamentoManuale } from '../abbonamenti/servizio.js';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { isAziendaId } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';

/**
 * Абонаментът на фирмата, зададен на ръка от MASTER (#31): нивото и последният ден — за плащания извън Revolut
 * и за фирмите отпреди абонаментите. Само `aziende:manage`.
 */
export const aziendeAbbonamentoRouter: Router = Router();

aziendeAbbonamentoRouter.post(
  '/aziende/:id/abbonamento',
  requireCapability('aziende:manage'),
  requireCsrf,
  async (req, res) => {
    const id = String(req.params.id);
    const valori = leggiAbbonamentoManuale(req.body as Record<string, unknown>);
    if (!isAziendaId(id)) return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    if (!valori) {
      setFlash(res, 'error', 'abbonamento.master.errore');
      return res.redirect(303, `/aziende/${encodeURIComponent(id)}#h-abbonamento`);
    }
    const body = req.body as Record<string, unknown>;
    const base = typeof body.base === 'string' ? body.base : '';
    const esito = await impostaAbbonamento(
      principalOf(req).user.id,
      id,
      valori,
      base,
      body.confermo === '1',
    );
    if (esito === 'assente')
      return sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    // Сменен междувременно, платен план или срок под 30 дни без потвърждение — нищо не се пише.
    if (esito !== 'ok') {
      setFlash(res, 'error', `abbonamento.master.${esito}`);
      return res.redirect(303, `/aziende/${encodeURIComponent(id)}#h-abbonamento`);
    }
    setFlash(res, 'ok', 'abbonamento.master.salvato');
    res.redirect(303, `/aziende/${encodeURIComponent(id)}#h-abbonamento`);
  },
);
