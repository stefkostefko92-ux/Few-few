import { z } from 'zod';
import { zendeskStatusFor } from '../status-map.js';
import type { ZendeskConfig } from '../settings.js';
import { commentOf, describe, subjectOf } from '../texts.js';
import {
  failureOf,
  jsonOf,
  ok2xx,
  thrownToResult,
  USER_AGENT,
  type Connector,
  type ConnectorContext,
  type DeliveryContext,
  type DeliveryResult,
  type ExternalLink,
} from './types.js';

/**
 * Zendesk Tickets API (developer.zendesk.com/api-reference/ticketing/tickets/tickets):
 *   • създаване — POST /api/v2/tickets {ticket:{subject, comment:{body, public:false}, status,
 *     external_id, tags}} с `Idempotency-Key` (ключовете живеят 2 ч. — ticketing/introduction);
 *     преди създаване — GET /api/v2/tickets?external_id=<номер> (повтор след 2 ч., възстановена връзка);
 *   • промяна — PUT /api/v2/tickets/{id} {ticket:{status, comment:{body, public:false}}};
 *   • тест — GET /api/v2/tickets/count („Allowed for Agents“ — анонимен достъп не минава).
 * Удостоверяване (api-reference/introduction/security-and-auth): OAuth access token
 * (`Authorization: Bearer`) — препоръчан; API token (`{email}/token:{token}`, Basic) — остарял.
 * Коментарите са вътрешни (public:false); заявител е акаунтът на интеграцията — без хора от ChatChat.
 */

export type ZendeskOrigin = (subdomain: string) => string;
export const zendeskOrigin: ZendeskOrigin = (subdomain) => `https://${subdomain}.zendesk.com`;

const Created = z.object({ ticket: z.object({ id: z.union([z.number(), z.string()]) }) });
const Listed = z.object({ tickets: z.array(z.object({ id: z.union([z.number(), z.string()]) })) });

function auth(ctx: ConnectorContext<ZendeskConfig>): string | null {
  const s = ctx.secrets;
  if (ctx.settings.authMode === 'oauth') {
    return s.accessToken ? `Bearer ${s.accessToken}` : null;
  }
  if (!s.email || !s.apiToken) return null;
  return `Basic ${Buffer.from(`${s.email}/token:${s.apiToken}`).toString('base64')}`;
}

function headers(authorization: string, extra: Record<string, string> = {}) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': USER_AGENT,
    authorization,
    ...extra,
  };
}

async function findByExternalId(
  ctx: DeliveryContext<ZendeskConfig>,
  base: string,
  authorization: string,
): Promise<string | null | DeliveryResult> {
  const q = new URLSearchParams({ external_id: ctx.ticket.ticket.number });
  const res = await ctx.http({
    method: 'GET',
    url: `${base}/api/v2/tickets?${q.toString()}`,
    headers: headers(authorization),
  });
  if (!ok2xx(res)) return failureOf(res);
  const listed = Listed.safeParse(jsonOf(res));
  const first = listed.success ? listed.data.tickets[0] : undefined;
  return first ? String(first.id) : null;
}

async function create(
  ctx: DeliveryContext<ZendeskConfig>,
  base: string,
  authorization: string,
): Promise<DeliveryResult> {
  const status = ctx.event.to ?? ctx.ticket.ticket.status;
  const lang = ctx.settings.language;
  const res = await ctx.http({
    method: 'POST',
    url: `${base}/api/v2/tickets`,
    headers: headers(authorization, { 'idempotency-key': ctx.deliveryId }),
    body: JSON.stringify({
      ticket: {
        subject: subjectOf(ctx.ticket),
        comment: { body: describe(lang, ctx.ticket, status), public: false },
        status: zendeskStatusFor(status, true),
        external_id: ctx.ticket.ticket.number,
        tags: ['chatchat', `chatchat_queue_${ctx.ticket.ticket.queue.toLowerCase()}`],
      },
    }),
  });
  if (!ok2xx(res)) return failureOf(res);
  const created = Created.safeParse(jsonOf(res));
  if (!created.success) return { ok: false, retry: false, code: 'bad_response' };
  return { ok: true, link: { externalId: String(created.data.ticket.id), externalKey: null } };
}

/** Промяна по свързан тикет: статусът на събитието + вътрешен коментар. */
async function update(
  ctx: DeliveryContext<ZendeskConfig>,
  base: string,
  authorization: string,
  link: ExternalLink,
): Promise<DeliveryResult> {
  const to = ctx.event.to;
  const comment = commentOf(ctx.settings.language, ctx.event.type, ctx.ticket, {
    to,
    assigneeRole: ctx.event.assigneeRole,
  });
  const res = await ctx.http({
    method: 'PUT',
    url: `${base}/api/v2/tickets/${encodeURIComponent(link.externalId)}`,
    headers: headers(authorization),
    body: JSON.stringify({
      ticket: {
        ...(to ? { status: zendeskStatusFor(to, false) } : {}),
        comment: { body: comment, public: false },
      },
    }),
  });
  return ok2xx(res) ? { ok: true } : failureOf(res);
}

export function zendeskConnector(origin: ZendeskOrigin = zendeskOrigin): Connector<ZendeskConfig> {
  return {
    async deliver(ctx) {
      const authorization = auth(ctx);
      if (!authorization) return { ok: false, retry: false, code: 'secrets_missing' };
      const base = origin(ctx.settings.subdomain);
      try {
        let link = ctx.link;
        let linked: ExternalLink | undefined;
        if (!link) {
          // Без връзка: първо търсене по external_id (повтор след изтекъл ключ, стара връзка),
          // иначе — нов тикет, който вече носи статуса на събитието.
          const found = await findByExternalId(ctx, base, authorization);
          if (typeof found === 'object' && found !== null) return found;
          if (found === null) return await create(ctx, base, authorization);
          link = linked = { externalId: found, externalKey: null };
        }
        if (ctx.event.type === 'ticket.created') {
          return { ok: true, skipped: 'already_linked', ...(linked ? { link: linked } : {}) };
        }
        const res = await update(ctx, base, authorization, link);
        return res.ok && linked ? { ...res, link: linked } : res;
      } catch (err) {
        return thrownToResult(err);
      }
    },

    async test(ctx) {
      const authorization = auth(ctx);
      if (!authorization) return { ok: false, code: 'secrets_missing' };
      try {
        const res = await ctx.http({
          method: 'GET',
          url: `${origin(ctx.settings.subdomain)}/api/v2/tickets/count`,
          headers: headers(authorization),
        });
        return ok2xx(res) ? { ok: true } : { ok: false, code: `http_${res.status}` };
      } catch (err) {
        return { ok: false, code: thrownToResult(err).code };
      }
    },
  };
}
