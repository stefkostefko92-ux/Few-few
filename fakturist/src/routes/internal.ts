import { Router } from 'express';
import { config } from '../config.js';
import { errorMessage, logger } from '../logger.js';
import { internalAccess } from '../stats/internal-access.js';
import { weeklyStats } from '../stats/weekly.js';

/**
 * `/internal/*` — за локалния извикващ на сървъра (vpsdash: петъчният отчет). Скрито (404) без токен
 * или при заявка през прокси; грешен токен → 401 без подробности. Отговорът никога не се кешира.
 */
export function internalRouter(): Router {
  const router = Router();
  router.use('/internal', (req, res, next) => {
    const access = internalAccess(req.headers, config().INTERNAL_STATS_TOKEN);
    if (access === 'hidden') {
      res.status(404).set('Cache-Control', 'no-store').end();
      return;
    }
    if (access === 'unauthorized') {
      res.status(401).set('Cache-Control', 'no-store').end();
      return;
    }
    next();
  });
  router.get('/internal/weekly', async (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json(await weeklyStats());
    } catch (error) {
      logger.error({ err: errorMessage(error) }, 'седмичните сборове не се сметнаха');
      res.status(503).set('Cache-Control', 'no-store').json({ ok: false, app: 'fakturist' });
    }
  });
  return router;
}
