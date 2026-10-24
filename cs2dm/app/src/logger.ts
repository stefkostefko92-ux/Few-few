import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';

/**
 * Структурирани логове. Политиката за поверителност обещава, че посещението на сайта не оставя
 * IP адрес в дневниците — затова заявката се логва БЕЗ адреса на клиента (pino-http по
 * подразбиране пише `remoteAddress`) и с позитивен списък на заглавията (без X-Forwarded-For).
 */
export const REDACT = {
  paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  censor: '[скрито]',
};

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: REDACT });

const REQ_HEADERS = ['host', 'user-agent', 'accept-language', 'x-request-id'];
const RES_HEADERS = ['content-type', 'content-length', 'location', 'x-request-id'];

export function pickHeaders(headers: unknown, allow: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (allow.includes(key.toLowerCase())) out[key.toLowerCase()] = value;
  }
  return out;
}

/** Пътят без query низа — параметрите не носят нищо нужно за разбор на проблем. */
export function stripQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split('?')[0] : url;
}

export const httpLogOptions = {
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  serializers: {
    req: (req: { id?: unknown; method?: unknown; url?: unknown; headers?: unknown }) => ({
      id: req.id,
      method: req.method,
      url: stripQuery(req.url),
      headers: pickHeaders(req.headers, REQ_HEADERS),
    }),
    res: (res: { statusCode?: unknown; headers?: unknown }) => ({
      statusCode: res.statusCode,
      headers: pickHeaders(res.headers, RES_HEADERS),
    }),
  },
};
