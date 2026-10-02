import rateLimit, { type Options } from 'express-rate-limit';
import { renderError, wantsJson } from '../auth/guards.js';

/**
 * Тавани на заявки по IP (зад nginx IP-то идва през `trust proxy`). Паметта на процеса стига за
 * един процес; неуспешните входове се броят и в базата (LoginEvent), така че рестарт не нулира защитата.
 */
function limiter(windowMs: number, limit: number): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      if (wantsJson(req)) {
        res.status(429).json({ error: res.locals.t('error.tooMany') as string, code: 'rate' });
        return;
      }
      renderError(res, 429, 'error.tooManyTitle', 'error.tooMany');
    },
  };
  return rateLimit(options);
}

export const loginLimiter = limiter(60_000, 10);
export const mfaLimiter = limiter(60_000, 10);
export const registerLimiter = limiter(60 * 60_000, 5);
export const forgotLimiter = limiter(60 * 60_000, 5);
export const resendLimiter = limiter(60 * 60_000, 5);
export const sensitiveLimiter = limiter(15 * 60_000, 30);
export const apiLimiter = limiter(60_000, 120);
export const exportLimiter = limiter(60_000, 30);
