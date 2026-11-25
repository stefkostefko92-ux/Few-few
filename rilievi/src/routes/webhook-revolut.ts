import express, { Router } from 'express';
import { webhookLimiter } from '../http/limits.js';
import { errorMessage, logger } from '../logger.js';
import { elaboraWebhook } from '../pagamenti/riconcilia.js';

/**
 * Известията на Revolut за поръчките (#31): суровото тяло (подписът е над него, не над прочетения JSON), до
 * 64 KB; без валиден подпис — 401 и нищо; с него — сверката (поръчката решава) и 200. Revolut праща известието
 * пак само при 4XX или timeout, а 200–399 е „доставено“ (merchant.yaml 2026-09-22, webhooks): вътрешна грешка при
 * обработката (базата, срив) е 409, не 500 — иначе известието се губи. Сверката е идемпотентна (чете поръчката),
 * повторението не дава нищо два пъти. Без бисквитки и CSRF — пази подписът; таван по адрес срещу засипване.
 */
export const webhookRevolutRouter: Router = Router();

webhookRevolutRouter.post(
  '/webhook/revolut',
  webhookLimiter,
  express.raw({ type: () => true, limit: '64kb' }),
  async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.set('Cache-Control', 'no-store');
    let esito: Awaited<ReturnType<typeof elaboraWebhook>>;
    try {
      esito = await elaboraWebhook(
        raw,
        req.get('revolut-request-timestamp'),
        req.get('revolut-signature'),
      );
    } catch (error) {
      logger.error(
        { evento: 'webhook.errore', err: errorMessage(error) },
        'revolut: webhook-ът не се обработи — Revolut ще го прати пак',
      );
      res.status(409).json({ errore: 'riprova' });
      return;
    }
    if (esito === 'firma') {
      res.status(401).json({ errore: 'firma' });
      return;
    }
    res.status(200).json({ ok: true });
  },
);
