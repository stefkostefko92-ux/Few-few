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

/** Износът на фирма (всичките ѝ снимки и клипове) — по акаунт, десет на час. */
export const esportaLimiter = limiter(60 * 60_000, 10, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
});

/**
 * Копието до подписалия при потвърждението (routes/firma-copia.ts) — същият таван като пращането по имейл
 * (20/ч. на акаунт), брои се само когато е поискано копие (Кодаджията, 12 ноември 2026).
 */
export const copiaLimiter = limiter(60 * 60_000, 20, {
  keyGenerator: (req) => (req.principal ? `u:${req.principal.user.id}` : networkKey(req)),
  skip: (req) => {
    const body = req.body as Record<string, unknown> | undefined;
    return typeof body?.copiaEmail !== 'string' || body.copiaEmail.trim() === '';
  },
});

/**
 * API-то (routes/api.ts): 600 заявки в час на ключ (префиксът от заглавката; без ключ — мрежата), отговорът — JSON.
 */
export const apiLimiter = limiter(60 * 60_000, 600, {
  keyGenerator: (req) => {
    const m = /^Bearer\s+rk_([a-z0-9]{12})_/.exec(req.get('authorization') ?? '');
    return m ? `k:${m[1]}` : `n:${networkKey(req)}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ errore: 'troppe_richieste' });
  },
});
