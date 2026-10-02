import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';

/** URL без query низа: токените за потвърждаване и смяна на парола пътуват в него. */
export function stripQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split('?')[0] : url;
}

/**
 * Структурирани логове без лични данни: нито имейл, нито IP, нито бисквитка стигат до лога.
 * IP и устройството се пазят в базата (LoginEvent), където има срок и права за достъп.
 */
export const REDACT = {
  paths: [
    'password',
    '*.password',
    'passwordHash',
    '*.passwordHash',
    'totpSecretEnc',
    '*.totpSecretEnc',
    'token',
    '*.token',
    'email',
    '*.email',
    'ip',
    '*.ip',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
  ],
  censor: '[скрито]',
};

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: REDACT });

/** Позитивен списък на хедърите, които стигат до лога — новият носител на тайна не изтича по подразбиране. */
const REQ_HEADERS = [
  'host',
  'user-agent',
  'content-type',
  'content-length',
  'accept',
  'x-request-id',
];
const RES_HEADERS = ['content-type', 'content-length', 'location', 'x-request-id', 'cache-control'];

export function pickHeaders(headers: unknown, allow: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!headers || typeof headers !== 'object') return out;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (allow.includes(key.toLowerCase())) out[key.toLowerCase()] = value;
  }
  return out;
}

/** Опциите на pino-http: собствен id на заявката, пътят без параметри, без адреса на клиента. */
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
    res: (res: { statusCode?: unknown; headers?: unknown }) => {
      const headers = pickHeaders(res.headers, RES_HEADERS);
      if (typeof headers.location === 'string') headers.location = stripQuery(headers.location);
      return { statusCode: res.statusCode, headers };
    },
  },
};
