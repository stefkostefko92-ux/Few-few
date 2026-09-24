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

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: REDACT });

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
    req: (req: { url?: unknown }) => ({ ...req, url: stripQuery(req.url) }),
  },
};
