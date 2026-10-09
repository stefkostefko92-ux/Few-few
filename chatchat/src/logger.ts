import { pino, type Logger } from 'pino';

/**
 * Структуриран лог (pino → journald). НИКОГА съдържание на въпроси/отговори, имейли, IP или
 * токени — само идентификатори (случай, потребител, документ), кодове на решения и броячи.
 * `redact` е втора линия за полета, които някой би добавил по невнимание.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { svc: 'chatchat' },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'email',
        'password',
        'token',
        'question',
        'body',
        '*.email',
        '*.password',
        '*.token',
      ],
      censor: '[скрито]',
    },
  });
}
