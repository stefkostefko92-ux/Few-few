import { pino, type Logger } from 'pino';

export type { Logger };

// Структурирани логове; бисквитки, токени и OAuth кодове никога не влизат.
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { app: 'semki' },
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'token', 'code', 'secret'],
      censor: '[скрито]',
    },
  });
}
