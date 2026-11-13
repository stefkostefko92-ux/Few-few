import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { sha256 } from '../ledger/chain.js';
import { verifyRevolutSignature } from '../billing/revolut.js';
import { handlePeppolWebhook } from '../peppol/webhook.js';
import { accessPoint } from '../peppol/settings.js';
import { revolutSettings } from '../admin/integrations.js';
import { settleRevolutOrder } from '../billing/card.js';

/** Събитията на Revolut Merchant API, които ползваме; останалите се записват и пропускат. */
const RevolutEvent = z.object({
  event: z.string().min(1).max(100),
  order_id: z.string().min(1).max(100).optional(),
});

/**
 * Webhook на Revolut: суровото тяло (за подписа) → проверка на подписа → запис на събитието (уникален
 * ключ event:order_id — Revolut не праща id на събитието) → при ORDER_COMPLETED поръчката се чете наново
 * и се сверява (src/billing/card.ts) → активиране + фактура. Правата по плана се дават САМО оттук,
 * от проверката на висящите или от мастър панела, никога от пренасочването след плащането.
 */
export function webhooksRouter(): Router {
  const router = Router();
  // Peppol (SPEC 59): подписът е с тайната на фирмата по `partyId` (src/peppol/webhook.ts).
  router.post(
    '/webhooks/peppol',
    express.raw({ type: 'application/json', limit: '64kb' }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const outcome = await handlePeppolWebhook({
        rawBody,
        signature: req.get('x-econnect-signature'),
        delivery: req.get('x-econnect-delivery'),
        ap: await accessPoint(),
      });
      res.status(outcome.status).end();
    },
  );
  router.post(
    '/webhooks/revolut',
    express.raw({ type: 'application/json', limit: '64kb' }),
    async (req, res) => {
      // Тайната от мастър настройките (резерва: REVOLUT_WEBHOOK_SECRET в .env); без нея — отказ.
      const secret = (await revolutSettings()).webhookSecret;
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const valid =
        secret !== null &&
        verifyRevolutSignature({
          secret,
          timestamp: req.get('revolut-request-timestamp'),
          signature: req.get('revolut-signature'),
          rawBody,
        });
      if (!valid) return res.status(401).end();
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).end();
      }
      const parsed = RevolutEvent.safeParse(payload);
      if (!parsed.success) return res.status(400).end();
      const { event, order_id: orderId } = parsed.data;
      const eventKey = `revolut:${event}:${orderId ?? sha256(rawBody.toString('utf8'))}`;
      // Записът е веднъж; „обработено“ се слага чак след успеха — повторената доставка след грешка
      // опитва пак, след успех не прави нищо.
      const seen = await prisma.webhookEvent.upsert({
        where: { eventKey },
        create: {
          provider: 'REVOLUT',
          eventKey,
          type: event,
          payloadHash: sha256(rawBody.toString('utf8')),
        },
        update: {},
      });
      if (seen.processedAt) return res.status(200).end();
      try {
        let final = true;
        if (event === 'ORDER_COMPLETED' && orderId) {
          // Събитието е само сигнал: състоянието и сумата се четат наново от Revolut (card.ts).
          const outcome = await settleRevolutOrder(orderId);
          if (outcome === 'activated') logger.info({ event }, 'плащане с карта — активирано');
          // Още неплатена (разминаване във времето) — повторната доставка или проверката я довършват.
          final = outcome !== 'notPaid';
        }
        if (final) {
          await prisma.webhookEvent.update({
            where: { eventKey },
            data: { processedAt: new Date() },
          });
        }
      } catch (error) {
        logger.error({ event, err: errorMessage(error) }, 'webhook на Revolut не се обработи');
        // Revolut опитва пак (3 пъти през 10 мин); после — проверката на висящите (card.ts).
        return res.status(503).end();
      }
      res.status(200).end();
    },
  );
  return router;
}
