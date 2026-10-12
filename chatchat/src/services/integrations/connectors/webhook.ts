import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CC_DELIVERY, CC_SIGNATURE, CC_TIMESTAMP, signChatChat } from '../signature.js';
import type { WebhookConfig } from '../settings.js';
import {
  failureOf,
  jsonOf,
  ok2xx,
  thrownToResult,
  USER_AGENT,
  type Connector,
  type ConnectorContext,
  type DeliveryResult,
} from './types.js';

/**
 * Общият подписан webhook (изходящ): POST с JSON (версия на формата `version`), подписан с
 * HMAC-SHA256 върху „<timestamp>.<тяло>“ (`X-ChatChat-Signature: v1=<hex>`,
 * `X-ChatChat-Timestamp`), `Idempotency-Key` = `X-ChatChat-Delivery` = id на доставката (повторът
 * носи същия ключ). Получателят може да върне `{ "externalId": "…" }` — пази се като връзка и
 * идва обратно в следващите доставки.
 */

const Ack = z.object({
  externalId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:/-]{1,200}$/),
  externalKey: z.string().trim().max(200).optional(),
});

async function post(
  ctx: ConnectorContext<WebhookConfig>,
  id: string,
  type: string,
  payload: Record<string, unknown>,
) {
  const secret = ctx.secrets.signingSecret ?? '';
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ version: 1, id, type, ...payload });
  return ctx.http({
    method: 'POST',
    url: ctx.settings.url,
    headers: {
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      'x-chatchat-event': type,
      [CC_DELIVERY]: id,
      'idempotency-key': id,
      [CC_TIMESTAMP]: String(timestamp),
      [CC_SIGNATURE]: signChatChat(secret, timestamp, body),
    },
    body,
  });
}

export const webhookConnector: Connector<WebhookConfig> = {
  async deliver(ctx): Promise<DeliveryResult> {
    if (!ctx.secrets.signingSecret) return { ok: false, retry: false, code: 'secrets_missing' };
    try {
      const res = await post(ctx, ctx.deliveryId, ctx.event.type, {
        occurredAt: ctx.event.at.toISOString(),
        attempt: ctx.attempt,
        change: {
          from: ctx.event.from,
          to: ctx.event.to,
          queue: ctx.event.queue,
          assigneeRole: ctx.event.assigneeRole,
        },
        externalId: ctx.link?.externalId ?? null,
        ticket: ctx.ticket,
      });
      if (!ok2xx(res)) return failureOf(res);
      if (ctx.link) return { ok: true };
      const ack = Ack.safeParse(jsonOf(res));
      return ack.success
        ? {
            ok: true,
            link: { externalId: ack.data.externalId, externalKey: ack.data.externalKey ?? null },
          }
        : { ok: true };
    } catch (err) {
      return thrownToResult(err);
    }
  },

  async test(ctx) {
    if (!ctx.secrets.signingSecret) return { ok: false, code: 'secrets_missing' };
    try {
      const res = await post(ctx, `ping-${randomUUID()}`, 'ping', {
        occurredAt: new Date().toISOString(),
      });
      return ok2xx(res) ? { ok: true } : { ok: false, code: `http_${res.status}` };
    } catch (err) {
      return { ok: false, code: thrownToResult(err).code };
    }
  },
};
