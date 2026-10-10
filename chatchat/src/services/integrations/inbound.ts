import type { HelpdeskIntegration } from '@prisma/client';
import { z } from 'zod';
import { loadConnector, type IntegrationDeps } from './deps.js';
import type { InboundRef } from './inbound-apply.js';
import { jiraFresh, verifyChatChat, verifyJira, verifyZendesk, type Headers } from './signature.js';
import { actionFromJira, actionFromZendesk, type InboundAction } from './status-map.js';

/**
 * Входящото известие от helpdesk-а: подписът се проверява ВЪРХУ СУРОВОТО ТЯЛО с входящата тайна
 * на конектора (по вида — общият HMAC, официалният подпис на Zendesk или X-Hub-Signature на Jira),
 * в прозореца за времевия печат; едва след това тялото се разчита (zod). Отговорът за непознат
 * адрес, изключен конектор, липсваща тайна и грешен подпис е един и същ — не издава кое е.
 */

export type InboundVerdict =
  | { ok: true; nonces: string[]; ref: InboundRef; action: InboundAction | null }
  | {
      ok: false;
      status: 400 | 401;
      code: 'invalid_signature' | 'stale_request' | 'invalid_payload';
    };

const ref = z.string().trim().min(1).max(200);

/** Общият webhook (версия 1): `{version:1, ticket:{number?|externalId?}, action:"close"|"reopen"}`. */
const ChatChatInbound = z.object({
  version: z.literal(1),
  ticket: z
    .object({ number: ref.optional(), externalId: ref.optional() })
    .refine((t) => t.number !== undefined || t.externalId !== undefined),
  action: z.enum(['close', 'reopen']),
});

/** Zendesk — тялото, което администраторът задава в webhook-а/тригера (виж админ UI). */
const ZendeskInbound = z.object({
  ticket_id: z.union([ref, z.number().int().nonnegative()]).transform(String),
  external_id: z.string().trim().max(200).optional(),
  status: z.string().trim().min(1).max(40),
});

/** Jira/JSM — събитието на webhook-а (само полетата, които ни трябват). */
const JiraInbound = z.object({
  timestamp: z.number().int().positive(),
  issue: z.object({
    id: ref,
    key: ref.optional(),
    fields: z
      .object({
        status: z
          .object({ statusCategory: z.object({ key: z.string().max(40) }).optional() })
          .optional(),
      })
      .optional(),
  }),
});

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

const BAD_SIGNATURE = { ok: false, status: 401, code: 'invalid_signature' } as const;
const BAD_PAYLOAD = { ok: false, status: 400, code: 'invalid_payload' } as const;

export function verifyInbound(
  deps: Pick<IntegrationDeps, 'keyring' | 'inboundToleranceSeconds'>,
  integration: HelpdeskIntegration,
  headers: Headers,
  rawBody: string,
  now = Date.now(),
): InboundVerdict {
  const loaded = loadConnector(deps, integration);
  const secret = 'error' in loaded ? '' : (loaded.secrets.inboundSecret ?? '');
  if (!secret) return BAD_SIGNATURE;
  const tolerance = deps.inboundToleranceSeconds;
  switch (integration.kind) {
    case 'WEBHOOK': {
      const v = verifyChatChat(secret, headers, rawBody, now, tolerance);
      if (!v.ok) return { ok: false, status: 401, code: v.code };
      const body = ChatChatInbound.safeParse(parseJson(rawBody));
      if (!body.success) return BAD_PAYLOAD;
      const t = body.data.ticket;
      return {
        ok: true,
        nonces: v.nonces,
        ref: {
          ...(t.number ? { number: t.number } : {}),
          ...(t.externalId ? { externalId: t.externalId } : {}),
        },
        action: body.data.action,
      };
    }
    case 'ZENDESK': {
      const v = verifyZendesk(secret, headers, rawBody, now, tolerance);
      if (!v.ok) return { ok: false, status: 401, code: v.code };
      const body = ZendeskInbound.safeParse(parseJson(rawBody));
      if (!body.success) return BAD_PAYLOAD;
      return {
        ok: true,
        nonces: v.nonces,
        ref: {
          externalId: body.data.ticket_id,
          ...(body.data.external_id ? { number: body.data.external_id } : {}),
        },
        action: actionFromZendesk(body.data.status),
      };
    }
    case 'JSM': {
      const v = verifyJira(secret, headers, rawBody);
      if (!v.ok) return { ok: false, status: 401, code: v.code };
      const body = JiraInbound.safeParse(parseJson(rawBody));
      if (!body.success) return BAD_PAYLOAD;
      // Печатът е в подписаното тяло — проверява се след подписа.
      if (!jiraFresh(body.data.timestamp, now, tolerance)) {
        return { ok: false, status: 401, code: 'stale_request' };
      }
      const issue = body.data.issue;
      const category = issue.fields?.status?.statusCategory?.key;
      return {
        ok: true,
        nonces: v.nonces,
        ref: { externalId: issue.id, ...(issue.key ? { externalKey: issue.key } : {}) },
        action: category ? actionFromJira(category) : null,
      };
    }
  }
}
