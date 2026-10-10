import type { TicketQueue, TicketStatus } from '@prisma/client';
import type { TicketEventType } from '../../tickets/events.js';
import type { HttpClient, HttpResponse } from '../http.js';
import type { ExternalTicket } from '../payload.js';
import type { ExternalLang } from '../settings.js';
import type { SecretValues } from '../secrets.js';
import { NetFailure } from '../ssrf.js';

/** Общото за конекторите: контекстът на една доставка, резултатът и класификацията на грешките. */

export interface DeliveryEvent {
  id: string;
  type: TicketEventType;
  at: Date;
  from: TicketStatus | null;
  to: TicketStatus | null;
  queue: TicketQueue;
  /** „Възложен на роля“ (SUPPORT/ENGINEERING…) — никога име или id на човек. */
  assigneeRole: string | null;
}

export interface ExternalLink {
  externalId: string;
  externalKey: string | null;
}

export interface ConnectorContext<S> {
  http: HttpClient;
  settings: S & { language: ExternalLang };
  secrets: SecretValues;
}

export interface DeliveryContext<S> extends ConnectorContext<S> {
  /** id на реда в outbox-а — ключът за идемпотентност към отсрещната страна. */
  deliveryId: string;
  attempt: number;
  event: DeliveryEvent;
  ticket: ExternalTicket;
  link: ExternalLink | null;
}

export type DeliveryResult =
  | { ok: true; link?: ExternalLink; skipped?: string }
  | { ok: false; retry: boolean; code: string; retryAfterMs?: number };

export type TestResult = { ok: true } | { ok: false; code: string };

export interface Connector<S> {
  deliver(ctx: DeliveryContext<S>): Promise<DeliveryResult>;
  test(ctx: ConnectorContext<S>): Promise<TestResult>;
}

const RETRY_AFTER_MAX_MS = 60 * 60 * 1000;

/** Retry-After в секунди или HTTP дата → милисекунди (най-много час). */
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const ms = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, RETRY_AFTER_MAX_MS) : undefined;
}

/** Отговорът като резултат: 2xx — успех; 408/409/425/429/5xx — повтор; друго 4xx — окончателно. */
export function failureOf(res: HttpResponse): Extract<DeliveryResult, { ok: false }> {
  const retry = [408, 409, 425, 429].includes(res.status) || res.status >= 500;
  const after = retryAfterMs(res.headers.retryAfter);
  return {
    ok: false,
    retry,
    code: `http_${res.status}`,
    ...(after ? { retryAfterMs: after } : {}),
  };
}

/** Мрежовите кодове, при които има смисъл да се опита пак. */
const TRANSIENT = new Set(['timeout', 'network', 'dns_failed', 'tls_failed']);

/** Изключение от HTTP клиента → резултат (само код; съобщението може да носи адрес). */
export function thrownToResult(err: unknown): Extract<DeliveryResult, { ok: false }> {
  if (err instanceof NetFailure)
    return { ok: false, retry: TRANSIENT.has(err.code), code: err.code };
  return { ok: false, retry: true, code: 'error' };
}

export const ok2xx = (res: HttpResponse): boolean => res.status >= 200 && res.status < 300;

/** JSON от отговора без доверие — null при невалиден. */
export function jsonOf(res: HttpResponse): unknown {
  try {
    return JSON.parse(res.body) as unknown;
  } catch {
    return null;
  }
}

export const USER_AGENT = 'ChatChat-Helpdesk/1 (+https://carbonstealth.eu)';
