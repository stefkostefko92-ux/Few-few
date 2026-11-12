import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { eliminaAzienda } from '../aziende/eliminazione.js';
import { esportaAzienda } from '../aziende/esportazione.js';
import { getAzienda } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { errorMessage, logger } from '../logger.js';
import { renderShow } from './aziende.js';

/**
 * Краят на услугата за фирма — само MASTER (`aziende:manage`): износът на всичко (.tar) и изтриването на
 * деактивирана фирма веднага, с името ѝ, написано на ръка (aziende/eliminazione.ts).
 */
export const aziendeFineRouter: Router = Router();
const manage = requireCapability('aziende:manage');

aziendeFineRouter.get('/aziende/:id/esporta', manage, async (req, res) => {
  const esportazione = await esportaAzienda(String(req.params.id), principalOf(req).user.id);
  if (!esportazione) {
    sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    return;
  }
  res.set({
    'Content-Type': 'application/x-tar',
    'Content-Disposition': `attachment; filename="${esportazione.nomeFile}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  try {
    await pipeline(esportazione.stream, res);
  } catch (error) {
    // Заглавките са пратени: прекъснатият архив е непълен — връзката се затваря, не се кърпи.
    logger.warn({ err: errorMessage(error) }, 'azienda: износът прекъсна');
    res.destroy();
  }
});

aziendeFineRouter.post('/aziende/:id/elimina', manage, requireCsrf, async (req, res) => {
  const id = String(req.params.id);
  const azienda = await getAzienda(id);
  if (!azienda) {
    sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
    return;
  }
  const conferma = (req.body as Record<string, unknown>).conferma;
  if (!azienda.deactivatedAt) return renderShow(req, res, 400, 'aziende.error.eliminaAttiva');
  if (typeof conferma !== 'string' || conferma.trim() !== azienda.name) {
    return renderShow(req, res, 400, 'aziende.error.eliminaNome');
  }
  if (!(await eliminaAzienda(id, principalOf(req).user.id))) {
    return renderShow(req, res, 400, 'aziende.error.eliminaAttiva');
  }
  setFlash(res, 'ok', 'flash.aziendaEliminata');
  res.redirect(303, '/aziende');
});
