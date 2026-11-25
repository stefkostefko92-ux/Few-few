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
import { recordRevolutDispute } from '../billing/disputes.js';
import { DISPUTE_ID } from '../billing/revolut-client.js';

/** Събитията на Revolut Merchant API, които ползваме; останалите се записват и пропускат. */
const RevolutEvent = z
  .object({
    event: z.string().min(1).max(100),
    order_id: z.string().min(1).max(100).optional(),
    // Спорът носи само id-то си (`{event, dispute_id}`) — без него известието е негодно.
    dispute_id: z.string().regex(DISPUTE_ID).optional(),
  })
  .refine((e) => !e.event.startsWith('DISPUTE_') || e.dispute_id !== undefined);

/**
 * Кодът „опитай пак“. По `merchant.yaml` (webhooks → responses) 200–399 потвърждава доставката и Revolut НЕ
 * праща пак; повторно (3 пъти през 10 мин) праща само при 4XX или таймаут, а 5XX не е описан. Затова всичко,
 * което искаме да дойде отново (временна грешка, още неплатена поръчка, непрочетен спор), е 409 — като linketto.
 */
const RETRY = 409;

/**
 * Webhook на Revolut: суровото тяло (за подписа) → проверка на подписа → запис на събитието (уникален
 * ключ event:order_id — Revolut не праща id на събитието) → при ORDER_COMPLETED поръчката се чете наново
 * и се сверява (src/billing/card.ts) → активиране + фактура. Правата по плана се дават САМО оттук,
 * от проверката на висящите или от мастър панела, никога от пренасочването след плащането.
 * `DISPUTE_*` → спорът се чете от Revolut, записва се в одита и отива при мастъра (src/billing/disputes.ts);
 * планът не се пипа — решава човек. Лош подпис → 401, лошо тяло → 400 (и двете са 4XX: Revolut праща пак,
 * безвредно); за повторен опит — `RETRY`.
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
      let secret: string | null;
      try {
        secret = (await revolutSettings()).webhookSecret;
      } catch (error) {
        logger.error(
          { err: errorMessage(error) },
          'webhook на Revolut: настройките не се прочетоха',
        );
        return res.status(RETRY).end();
      }
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
      const { event, order_id: orderId, dispute_id: disputeId } = parsed.data;
      const eventKey = `revolut:${event}:${orderId ?? disputeId ?? sha256(rawBody.toString('utf8'))}`;
      try {
        // Записът е веднъж; „обработено“ се слага чак след успеха — повторената доставка след грешка
        // опитва пак, след успех не прави нищо. ON CONFLICT DO NOTHING: две доставки наведнъж не падат
        // на уникалния ключ (`upsert` с празно `update` чете, после създава — P2002).
        await prisma.webhookEvent.createMany({
          data: {
            provider: 'REVOLUT',
            eventKey,
            type: event,
            payloadHash: sha256(rawBody.toString('utf8')),
          },
          skipDuplicates: true,
        });
        const seen = await prisma.webhookEvent.findUniqueOrThrow({ where: { eventKey } });
        // Спорът минава в същото известие през няколко етапа (отговор → преглед → отговор при арбитраж);
        // повторението се пази от сравнението със записа в одита (disputes.ts), не от `processedAt`.
        if (seen.processedAt && !disputeId) return res.status(200).end();
        let final = true;
        if (disputeId) {
          await recordRevolutDispute(disputeId, event);
        } else if (event === 'ORDER_COMPLETED' && orderId) {
          // Събитието е само сигнал: състоянието и сумата се четат наново от Revolut (card.ts).
          const outcome = await settleRevolutOrder(orderId);
          if (outcome === 'activated') logger.info({ event }, 'плащане с карта — активирано');
          // Още неплатена (разминаване във времето): 4XX → Revolut праща пак до 3 пъти през 10 мин;
          // после остава проверката на висящите (card.ts, на 10 мин). С 200 повторна доставка няма.
          final = outcome !== 'notPaid';
        }
        if (!final) return res.status(RETRY).end();
        await prisma.webhookEvent.update({
          where: { eventKey },
          data: { processedAt: new Date() },
        });
      } catch (error) {
        logger.error({ event, err: errorMessage(error) }, 'webhook на Revolut не се обработи');
        // 4XX, не 5XX: Revolut опитва пак (3 пъти през 10 мин) само при 4XX или таймаут; после —
        // проверката на висящите (card.ts), а за спор — писмото до мастъра вече е тръгнало (disputes.ts).
        return res.status(RETRY).end();
      }
      res.status(200).end();
    },
  );
  return router;
}
