import pino from 'pino';

/** Структурирани логове. Никога PII/тайни — токените се редактират тук. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'access_token',
      'accessToken',
      'accessTokenEnc',
      '*.access_token',
      '*.accessToken',
      'req.headers.authorization',
      'req.query.code',
      'req.query.access_token',
    ],
    censor: '[скрито]',
  },
});
