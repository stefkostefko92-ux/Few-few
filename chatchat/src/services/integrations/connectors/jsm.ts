import { z } from 'zod';
import type { JsmConfig } from '../settings.js';
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
 * Jira Service Management — Service Desk REST API (developer.atlassian.com/cloud/jira/service-desk/rest,
 * групата „Request“):
 *   • създаване — POST /rest/servicedeskapi/request {serviceDeskId, requestTypeId,
 *     requestFieldValues:{summary, description}} → {issueId, issueKey};
 *   • преди създаване — GET /rest/servicedeskapi/request?searchTerm=<номер>&serviceDeskId=…&
 *     requestOwnership=OWNED_REQUESTS (searchTerm търси в summary — API-то няма ключ за
 *     идемпотентност, затова повтор след неясен изход не дублира заявката);
 *   • всяка следваща промяна — POST /rest/servicedeskapi/request/{issueIdOrKey}/comment
 *     {body, public:false} (вътрешен коментар; преходите са по workflow на клиента);
 *   • тест — GET /rest/servicedeskapi/servicedesk/{serviceDeskId}.
 * Удостоверяване (…/basic-auth-for-rest-apis): `Authorization: Basic base64(<имейл>:<API token>)`.
 */

const Created = z.object({ issueId: z.string().min(1), issueKey: z.string().optional() });
const Listed = z.object({
  values: z.array(
    z.object({
      issueId: z.string(),
      issueKey: z.string().optional(),
      summary: z.string().optional(),
    }),
  ),
});

const base = (ctx: ConnectorContext<JsmConfig>) => ctx.settings.baseUrl.replace(/\/+$/, '');

function headers(ctx: ConnectorContext<JsmConfig>): Record<string, string> | null {
  const { email, apiToken } = ctx.secrets;
  if (!email || !apiToken) return null;
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': USER_AGENT,
    authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
  };
}

async function findExisting(
  ctx: DeliveryContext<JsmConfig>,
  h: Record<string, string>,
): Promise<ExternalLink | null | DeliveryResult> {
  const number = ctx.ticket.ticket.number;
  const q = new URLSearchParams({
    searchTerm: number,
    serviceDeskId: ctx.settings.serviceDeskId,
    requestOwnership: 'OWNED_REQUESTS',
    limit: '10',
  });
  const res = await ctx.http({
    method: 'GET',
    url: `${base(ctx)}/rest/servicedeskapi/request?${q.toString()}`,
    headers: h,
  });
  if (!ok2xx(res)) return failureOf(res);
  const listed = Listed.safeParse(jsonOf(res));
  // searchTerm е текстово търсене — приемаме само точно съвпадение на номера в темата.
  const hit = listed.success
    ? listed.data.values.find((v) => (v.summary ?? '').includes(number))
    : undefined;
  return hit ? { externalId: hit.issueId, externalKey: hit.issueKey ?? null } : null;
}

async function create(
  ctx: DeliveryContext<JsmConfig>,
  h: Record<string, string>,
): Promise<DeliveryResult> {
  const status = ctx.event.to ?? ctx.ticket.ticket.status;
  const res = await ctx.http({
    method: 'POST',
    url: `${base(ctx)}/rest/servicedeskapi/request`,
    headers: h,
    body: JSON.stringify({
      serviceDeskId: ctx.settings.serviceDeskId,
      requestTypeId: ctx.settings.requestTypeId,
      requestFieldValues: {
        summary: subjectOf(ctx.ticket),
        description: describe(ctx.settings.language, ctx.ticket, status),
      },
    }),
  });
  if (!ok2xx(res)) return failureOf(res);
  const created = Created.safeParse(jsonOf(res));
  if (!created.success) return { ok: false, retry: false, code: 'bad_response' };
  return {
    ok: true,
    link: { externalId: created.data.issueId, externalKey: created.data.issueKey ?? null },
  };
}

async function comment(
  ctx: DeliveryContext<JsmConfig>,
  h: Record<string, string>,
  link: ExternalLink,
): Promise<DeliveryResult> {
  const body = commentOf(ctx.settings.language, ctx.event.type, ctx.ticket, {
    to: ctx.event.to,
    assigneeRole: ctx.event.assigneeRole,
  });
  const res = await ctx.http({
    method: 'POST',
    url: `${base(ctx)}/rest/servicedeskapi/request/${encodeURIComponent(link.externalKey ?? link.externalId)}/comment`,
    headers: h,
    body: JSON.stringify({ body, public: false }),
  });
  return ok2xx(res) ? { ok: true } : failureOf(res);
}

export const jsmConnector: Connector<JsmConfig> = {
  async deliver(ctx) {
    const h = headers(ctx);
    if (!h) return { ok: false, retry: false, code: 'secrets_missing' };
    try {
      let link = ctx.link;
      let linked: ExternalLink | undefined;
      if (!link) {
        const found = await findExisting(ctx, h);
        if (found !== null && 'ok' in found) return found;
        if (found === null) return await create(ctx, h);
        link = linked = found;
      }
      if (ctx.event.type === 'ticket.created') {
        return { ok: true, skipped: 'already_linked', ...(linked ? { link: linked } : {}) };
      }
      const res = await comment(ctx, h, link);
      return res.ok && linked ? { ...res, link: linked } : res;
    } catch (err) {
      return thrownToResult(err);
    }
  },

  async test(ctx) {
    const h = headers(ctx);
    if (!h) return { ok: false, code: 'secrets_missing' };
    try {
      const res = await ctx.http({
        method: 'GET',
        url: `${base(ctx)}/rest/servicedeskapi/servicedesk/${encodeURIComponent(ctx.settings.serviceDeskId)}`,
        headers: h,
      });
      return ok2xx(res) ? { ok: true } : { ok: false, code: `http_${res.status}` };
    } catch (err) {
      return { ok: false, code: thrownToResult(err).code };
    }
  },
};
