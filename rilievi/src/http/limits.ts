import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { SAFE_METHODS, sendError } from '../auth/guards.js';
import { ipNetwork } from './ip.js';

/** Ключът е мрежата на адреса (IPv6 — цялата /64), не самият адрес. */
const networkKey = (req: Request): string => ipNetwork(req.ip) ?? req.ip ?? 'unknown';

/**
 * Тавани на заявки по мрежа на IP (зад nginx IP-то идва през `trust proxy`). Паметта на процеса стига
 * за един процес; грешните пароли се броят и в базата (lockout.ts), така че рестарт не нулира защитата.
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
    handler: (req, res) => sendError(req, res, 429, 'error.tooManyTitle', 'error.tooMany'),
    ...extra,
  };
  return rateLimit(options);
}

export const loginLimiter = limiter(60_000, 10);
/** Връзките с токен (покана, нова парола). Токенът е 256-битов — таванът е само срещу засипване. */
export const tokenLimiter = limiter(15 * 60_000, 20);
export const forgotLimiter = limiter(60 * 60_000, 5);
/** Заявките за достъп от публичната страница: пет на час от мрежа стигат и за грешно попълнена форма. */
export const requestLimiter = limiter(60 * 60_000, 5);

/**
 * Записи от вписан човек — по акаунт, не по мрежа: откраднатата сесия не дава безкрайни промени, а
 * техниците зад един рутер не си пречат. Четенето (GET) не се брои.
 */
export const writeLimiter = limiter(60_000, 60, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
  skip: (req) => SAFE_METHODS.has(req.method),
});

/** PDF-ът се смята на сървъра — таван по акаунт срещу натоварване. */
export const pdfLimiter = limiter(60_000, 30, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
});

/**
 * Картинките на табелите (cartelli/vista.ts) — свой таван, отделен от PDF-ите: настройките са пет картинки
 * наведнъж, а повтореното идва от паметта на процеса. По акаунт.
 */
export const vistaLimiter = limiter(60_000, 120, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
});

/** Писмата с PDF на листа за интервенция — по акаунт, двадесет на час. */
export const mailLimiter = limiter(60 * 60_000, 20, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
});
