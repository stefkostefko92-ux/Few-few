import { pipeline } from 'node:stream/promises';
import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability, requireCsrf, sendError } from '../auth/guards.js';
import { eliminaAzienda } from '../aziende/eliminazione.js';
import { esportaAzienda } from '../aziende/esportazione.js';
import { getAzienda } from '../aziende/service.js';
import { setFlash } from '../http/flash.js';
import { esportaLimiter } from '../http/limits.js';
import { errorMessage, logger } from '../logger.js';
import { renderShow } from './aziende.js';
import { confermaPassword } from './conferma-password.js';

/**
 * Краят на услугата за фирма — само MASTER (`aziende:manage`): износът на всичко (.tar) и изтриването на
 * деактивирана фирма веднага, с името ѝ, написано на ръка (aziende/eliminazione.ts).
 */
export const aziendeFineRouter: Router = Router();
const manage = requireCapability('aziende:manage');

/** Фирмите, чийто износ тече в момента — втори едновременно не тръгва (всичките снимки и клипове). */
const inCorso = new Set<string>();

/** Праща архива на фирмата (.tar) като изтегляне; общото на MASTER и на ADMIN (impostazioni-esportazione.ts). */
export async function scaricaEsportazione(
  req: Request,
  res: Response,
  aziendaId: string,
): Promise<void> {
  if (inCorso.has(aziendaId)) {
    sendError(req, res, 429, 'error.tooManyTitle', 'esportazione.inCorso');
    return;
  }
  inCorso.add(aziendaId);
  try {
    const esportazione = await esportaAzienda(aziendaId, principalOf(req).user);
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
  } finally {
    inCorso.delete(aziendaId);
  }
}

/**
 * С паролата на MASTER и с POST (одитът от 12 ноември 2026): преди — GET без нищо, а откраднатата сесия на
 * MASTER изнасяше всяка фирма с една връзка. Опитите се броят в заключването (conferma-password.ts).
 */
aziendeFineRouter.post(
  '/aziende/:id/esporta',
  manage,
  requireCsrf,
  esportaLimiter,
  async (req, res) => {
    const esito = await confermaPassword(req, res);
    if (esito === 'bloccato') return;
    if (esito === 'errata') return renderShow(req, res, 422, 'esportazione.errore.password');
    await scaricaEsportazione(req, res, String(req.params.id));
  },
);

/** Старата връзка (GET) — към страницата на фирмата, при бутона. */
aziendeFineRouter.get('/aziende/:id/esporta', manage, (req, res) => {
  res.redirect(303, `/aziende/${encodeURIComponent(String(req.params.id))}#h-fine`);
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
