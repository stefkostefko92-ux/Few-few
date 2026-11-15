import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';

/**
 * URL без query низа. `req.query.code` се редактира, но същият OAuth code стои и в `req.url`
 * (`/auth/instagram/callback?code=…`) — затова пътят се логва без параметрите.
 */
export function stripQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split('?')[0] : url;
}

/** Структурирани логове. Никога PII/тайни — токените се редактират тук. */
export const REDACT = {
  paths: [
    'access_token',
    'accessToken',
    'accessTokenEnc',
    '*.access_token',
    '*.accessToken',
    'req.headers.authorization',
    'req.query.code',
    'req.query.access_token',
    // Сесийната бисквитка на админа и Set-Cookie на отговора — pino-http ги логваше изцяло
    // (Наблюдателя, 2026-09-24, възпроизведено с pino-http 10).
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'req.headers["x-agent-signature"]',
    'req.headers["x-piuma-signature"]',
  ],
  censor: '[скрито]',
};

/**
 * Опциите на logger-а — изнесени, за да се тестват (tests/logger.test.ts). Времето е ISO 8601 в UTC:
 * без `timestamp` pino пише милисекунди от epoch, които човек и SIEM разчитат с превод.
 */
export const logOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: REDACT,
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = pino(logOptions);

/**
 * Опциите на pino-http — тук, до redact-а, за да се тестват заедно (tests/logger.test.ts).
 * genReqId: уникален id (по подразбиране е брояч 1, 2, 3… — нулира се при рестарт); входящ
 * X-Request-Id се приема само ако е кратък и безопасен.
 */
export const httpLogOptions = {
  genReqId: (req: IncomingMessage, res: ServerResponse) => {
    const inc = req.headers['x-request-id'];
    const id = typeof inc === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(inc) ? inc : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  serializers: {
    req: (req: { url?: unknown; headers?: unknown }) => {
      // query се пропуска: пътят стига за разбор, а параметрите носят code/token.
      // remoteAddress/remotePort (pino-http ги добавя сам) — IP на връзката, личен данен.
      const {
        query: _query,
        remoteAddress: _remoteAddress,
        remotePort: _remotePort,
        ...rest
      } = req as Record<string, unknown>;
      return { ...rest, url: stripQuery(req.url), headers: pickHeaders(req.headers, REQ_HEADERS) };
    },
    res: (res: { headers?: unknown }) => {
      const headers = pickHeaders(res.headers, RES_HEADERS);
      if (typeof headers.location === 'string')
        headers.location = stripQuery(headers.location) as string;
      return { ...res, headers };
    },
  },
};

/**
 * Позитивен списък на хедърите, които стигат до лога. Черният списък в REDACT изпускаше всеки нов
 * носител на тайна (proxy-authorization, x-api-key, Location с ?code=) — Разбивача, 2026-09-24.
 */
const REQ_HEADERS = [
  'host',
  'user-agent',
  'content-type',
  'content-length',
  'accept',
  'accept-language',
  'x-request-id',
];
// x-forwarded-for и x-real-ip НЕ са тук: IP адресът е личен данен (ОРЗД), а логът се пази и
// се чете по-широко от одита (Стражата, 2026-11-15). За сигурността адресът е в одита — суров
// (заличим по срок) и като HMAC етикет във веригата (src/audit-chain.ts), не в лога.
const RES_HEADERS = ['content-type', 'content-length', 'location', 'x-request-id', 'cache-control'];

export function pickHeaders(headers: unknown, allow: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (allow.includes(k.toLowerCase())) out[k.toLowerCase()] = v;
  }
  return out;
}
