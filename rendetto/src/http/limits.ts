import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { renderError, SAFE_METHODS, wantsJson } from '../auth/guards.js';
import { ipNetwork } from './ip.js';

/** Ключът е мрежата на адреса (IPv6 — цялата /64), не самият адрес. */
const networkKey = (req: Request): string => ipNetwork(req.ip) ?? req.ip ?? 'unknown';

/**
 * Тавани на заявки по мрежа на IP (зад nginx IP-то идва през `trust proxy`). Паметта на процеса стига
 * за един процес; неуспешните входове се броят и в базата (LoginEvent), така че рестарт не нулира защитата.
 */
function limiter(
  windowMs: number,
  limit: number,
  extra: Partial<Options> = {},
): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: networkKey,
    handler: (req, res) => {
      if (wantsJson(req)) {
        res.status(429).json({ error: res.locals.t('error.tooMany') as string, code: 'rate' });
        return;
      }
      renderError(res, 429, 'error.tooManyTitle', 'error.tooMany');
    },
    ...extra,
  };
  return rateLimit(options);
}

export const loginLimiter = limiter(60_000, 10);
export const mfaLimiter = limiter(60_000, 10);
export const registerLimiter = limiter(60 * 60_000, 5);
export const forgotLimiter = limiter(60 * 60_000, 5);
/**
 * Връзките от писмата (нова парола, потвърждение) — всяка със свой брояч: отхвърлена слаба парола не
 * изяжда заявките за нова връзка и обратно. Токенът е 256-битов; таванът е само срещу засипване.
 */
export const resetLimiter = limiter(15 * 60_000, 10);
export const verifyLimiter = limiter(15 * 60_000, 10);
export const resendLimiter = limiter(60 * 60_000, 5);
export const sensitiveLimiter = limiter(15 * 60_000, 30);
export const apiLimiter = limiter(60_000, 120);
export const exportLimiter = limiter(60_000, 30);

/**
 * Записи от вписан човек — по акаунт, не по мрежа: откраднатата сесия не дава безкрайни промени, а
 * хората зад едно IP не си пречат. Четенето (GET) не се брои.
 */
export const accountWriteLimiter = limiter(60_000, 60, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
  skip: (req) => SAFE_METHODS.has(req.method),
});
