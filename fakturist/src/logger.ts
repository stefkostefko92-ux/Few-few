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

/**
 * Причината за лога от каквото е хвърлено — и когато не е Error. Имейл адресите се маскират: съобщенията
 * от пощенския сървър или от доставчик често съдържат адреса на получателя, а логът е без лични данни.
 */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+/g, '[адрес]');
}

/**
 * Пътят на заявката за лога: без заявката (`?…`) и без токена от връзката на покана, за нова парола или
 * за потвърждение на имейла — токенът в адреса е ключ за достъп и не трябва да остава в логовете.
 */
export function safeLogPath(url: string): string {
  return (url.split('?')[0] ?? '').replace(
    /^\/(pokana|chlen|nova-parola|potvardi-imeyl)\/[^/]+/i,
    (_match, prefix: string) => `/${prefix.toLowerCase()}/[токен]`,
  );
}
