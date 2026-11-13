import express, { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { logger } from '../logger.js';
import { sha256 } from '../ledger/chain.js';
import { verifyRevolutSignature } from '../billing/revolut.js';
import { revolutSettings } from '../admin/integrations.js';

/** Събитията на Revolut Merchant API, които ползваме; останалите се записват и пропускат. */
const RevolutEvent = z.object({
  event: z.string().min(1).max(100),
  order_id: z.string().min(1).max(100).optional(),
});

/**
 * Webhook на Revolut: суровото тяло (за подписа) → проверка на подписа → запис на събитието веднъж
 * (уникален ключ — повторената доставка не прави нищо) → при ORDER_COMPLETED плащането с този номер на
 * поръчка става COMPLETED. Правата по плана се дават САМО оттук или от мастър панела, никога от redirect.
 */
export function webhooksRouter(): Router {
  const router = Router();
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
      try {
        await prisma.$transaction(async (tx) => {
          await tx.webhookEvent.create({
            data: {
              provider: 'REVOLUT',
              eventKey,
              type: event,
              payloadHash: sha256(rawBody.toString('utf8')),
            },
          });
          if (event === 'ORDER_COMPLETED' && orderId) {
            const payment = await tx.payment.findUnique({ where: { providerOrderId: orderId } });
            if (payment && payment.status === 'PENDING') {
              await tx.payment.update({
                where: { id: payment.id },
                data: { status: 'COMPLETED', paidAt: new Date() },
              });
              await audit(tx, {
                actorId: null,
                organizationId: payment.organizationId,
                action: 'billing.payment.completed',
                targetType: 'Payment',
                targetId: payment.id,
                details: { provider: 'REVOLUT', amountCents: payment.amountCents },
              });
            }
          }
          await tx.webhookEvent.update({ where: { eventKey }, data: { processedAt: new Date() } });
        });
      } catch (error) {
        // Вече обработено събитие — 200, за да не го праща пак.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return res.status(200).end();
        }
        logger.error({ event }, 'webhook на Revolut не се обработи');
        return res.status(500).end();
      }
      res.status(200).end();
    },
  );
  return router;
}
