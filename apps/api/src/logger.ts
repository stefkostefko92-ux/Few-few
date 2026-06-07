import { pino } from 'pino';

import { env } from './env.js';

/**
 * Структурирано логване. Без PII в логовете — име/телефон на гражданина не
 * се записват; чувствителни полета се изрязват.
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
});
