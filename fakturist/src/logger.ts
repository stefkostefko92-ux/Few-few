import pino from 'pino';

/**
 * Структурирани логове без лични данни: нито имейл, нито IP, нито бисквитка, нито токен, нито данни от
 * фактура стигат до лога. Кой какво е направил е в одита (база с права за достъп и срок), не в лога.
 */
const REDACT = {
  paths: [
    'password',
    '*.password',
    'passwordHash',
    '*.passwordHash',
    'token',
    '*.token',
    'email',
    '*.email',
    'ip',
    '*.ip',
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
  ],
  censor: '[скрито]',
};

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: REDACT });

/** Причината за лога от каквото е хвърлено — и когато не е Error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
