import type { Request, Response } from 'express';
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
/**
 * Връщането от доставчика на самоличност (D1) — свой таван по мрежа, по-широк от входа (един вход е едно
 * започване и едно връщане): всяко живо състояние минава веднъж (oidc-stato.ts), таванът реже засипването.
 */
export const ritornoLimiter = limiter(60_000, 30);
/** Известията на Revolut (#31) — подписани; таванът е само срещу засипване. */
export const webhookLimiter = limiter(60_000, 120);
/** Връзките с токен (покана, нова парола). Токенът е 256-битов — таванът е само срещу засипване. */
export const tokenLimiter = limiter(15 * 60_000, 20);
export const forgotLimiter = limiter(60 * 60_000, 5);
/** Заявките за достъп от публичната страница: пет на час от мрежа стигат и за грешно попълнена форма. */
export const requestLimiter = limiter(60 * 60_000, 5);
/** Сигналите за незаконно съдържание от публичната страница: десет на час от мрежа (и грешно попълнените). */
export const segnalazioniLimiter = limiter(60 * 60_000, 10);

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
 * API-то (routes/api.ts), отговорът — JSON. Два тавана (одитът от 12 ноември 2026: един таван по префикса от
 * заглавката, който пише нападателят — всяка заявка с нов префикс беше нов брояч, а чужд ключ се изтощаваше с
 * 600 невалидни заявки): първо мрежата, ПРЕДИ ключът да се чете — 1200 в час; после 600 в час на ПРОВЕРЕН ключ
 * (`res.locals.apiChiave`, сложен от `conChiave`).
 */
const troppeApi = (_req: Request, res: Response): void => {
  res.status(429).json({ errore: 'troppe_richieste' });
};
export const apiReteLimiter = limiter(60 * 60_000, 1200, {
  keyGenerator: (req) => `n:${networkKey(req)}`,
  handler: troppeApi,
});
export const apiLimiter = limiter(60 * 60_000, 600, {
  keyGenerator: (req, res) =>
    typeof res.locals.apiChiave === 'string' ? `k:${res.locals.apiChiave}` : `n:${networkKey(req)}`,
  handler: troppeApi,
});
