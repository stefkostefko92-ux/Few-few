import express, { Router } from 'express';
import { webhookLimiter } from '../http/limits.js';
import { elaboraWebhook } from '../pagamenti/riconcilia.js';

/**
 * Известията на Revolut за поръчките (#31): суровото тяло (подписът е над него, не над прочетения JSON), до
 * 64 KB; без валиден подпис — 401 и нищо; с него — сверката (поръчката решава) и 200 (иначе Revolut пита пак).
 * Без бисквитки и CSRF — пази подписът; таван по адрес срещу засипване.
 */
export const webhookRevolutRouter: Router = Router();

webhookRevolutRouter.post(
  '/webhook/revolut',
  webhookLimiter,
  express.raw({ type: () => true, limit: '64kb' }),
  async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const esito = await elaboraWebhook(
      raw,
      req.get('revolut-request-timestamp'),
      req.get('revolut-signature'),
    );
    res.set('Cache-Control', 'no-store');
    if (esito === 'firma') {
      res.status(401).json({ errore: 'firma' });
      return;
    }
    res.status(200).json({ ok: true });
  },
);
