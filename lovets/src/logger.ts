import pino from 'pino';

/** Структурирани логове без лични данни: без тела на заявки, без бисквитки, без IP. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
});
