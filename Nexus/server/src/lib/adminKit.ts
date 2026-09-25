/**
 * Общи помощници за админ API-то (routes/admin.ts):
 *  - `audit()` — одит-дневник „кой · какво · кога · от → към" за ВСЯКО
 *    мутиращо админ действие (event_log, category 'admin'/'moderation').
 *  - zod схеми за id/пагинация/търсене с горен таван.
 *  - `escapeLike()` — `%`/`_` от потребителския вход не стават wildcard-и.
 *  - `ipIsShielded()` — пази от бан на loopback/частен/админски IP (иначе
 *    ръчен бан на акаунт зад същия NAT/прокси заключва и администратора).
 *
 * Без странични ефекти при импорт — безопасно за тестове с `:memory:` база.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { logFromRequest, type LogCategory, type LogLevel } from './logger';

/* ===================== Валидация на входа ===================== */

/** Положително цяло id от path параметър (`/:id`). */
export const idParam = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Връща валидно id или праща 400 и връща null. */
export function parseId(req: Request, res: Response, name = 'id'): number | null {
  const r = idParam.safeParse(req.params[name]);
  if (!r.success) {
    res.status(400).json({ error: `Invalid ${name}` });
    return null;
  }
  return r.data;
}

/** Максимален размер на страница — горен таван за всеки списък. */
export const MAX_PAGE_SIZE = 100;

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  q: z.string().trim().max(80).optional().default(''),
});
export type PageQuery = z.infer<typeof pageQuery>;

/** Парсва query с дадена схема; при грешка праща 400 и връща null. */
export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const r = schema.safeParse(req.query);
  if (!r.success) {
    res.status(400).json({ error: r.error.flatten() });
    return null;
  }
  return r.data;
}

/** Екранира LIKE wildcard-ите; ползвай с `LIKE ? ESCAPE '\\'`. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Мета на страниран отговор (редовете са под собствен ключ). */
export function pageMeta(total: number, q: { page: number; pageSize: number }) {
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

/* ===================== Одит-дневник ===================== */

type Plain = Record<string, unknown>;

/** Ключовете, чиято стойност се е променила (от → към). */
export function changedKeys(before: Plain | null | undefined, after: Plain | null | undefined): string[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify((before || {})[k]) !== JSON.stringify((after || {})[k])) out.push(k);
  }
  return out;
}

// Полета, които НИКОГА не влизат в одит мета (тайни/хешове).
const REDACT = new Set(['password', 'password_hash', 'secret', 'token', 'reset_token']);

function redact(v: Plain | null | undefined): Plain | null {
  if (!v) return null;
  const out: Plain = {};
  for (const [k, val] of Object.entries(v)) {
    if (REDACT.has(k)) out[k] = val ? '[redacted]' : '';
    else if (typeof val === 'string' && val.length > 300) out[k] = `${val.slice(0, 300)}…`;
    else out[k] = val;
  }
  return out;
}

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: number | null;
  before?: Plain | null;
  after?: Plain | null;
  message?: string;
  level?: LogLevel;
  category?: Extract<LogCategory, 'admin' | 'moderation'>;
  meta?: Plain;
}

/**
 * Записва одит ред: кой (user_id = админът, ip/route от заявката), какво
 * (action/target), кога (ts), от → към (before/after + списък променени
 * полета). Маркира `res.locals.audited`, за да не дублира предпазната мрежа.
 */
export function audit(req: Request, res: Response, e: AuditEntry): void {
  const before = redact(e.before);
  const after = redact(e.after);
  logFromRequest(req, {
    category: e.category || 'admin',
    action: e.action,
    level: e.level || 'info',
    target_id: e.targetId ?? null,
    target_type: e.targetType,
    message: e.message || `${e.action} ${e.targetType}${e.targetId ? ` #${e.targetId}` : ''}`,
    meta: {
      admin_id: req.auth?.uid ?? null,
      admin: req.auth?.username ?? null,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
      ...(before || after ? { changed: changedKeys(before, after) } : {}),
      ...(e.meta || {}),
    },
  });
  res.locals.audited = true;
}

/* ===================== Защита от самозаключване при бан ===================== */

/** Loopback / частни / link-local / CGNAT адреси — никога не се банват по IP. */
export function isNonPublicIp(ip: string): boolean {
  const v = (ip || '').replace(/^::ffff:/, '').trim().toLowerCase();
  if (!v) return true;
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT — споделен от много абонати
    if (a >= 224) return true;
    return false;
  }
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v);
}

/**
 * true → този IP НЕ бива да се банва: непубличен, или съвпада с IP на
 * администратор (текущия заявител или друг админ). Иначе ръчният бан на
 * играч от същата мрежа заключва и админите (authRequired банва по IP).
 */
export function ipIsShielded(ip: string, adminIps: string[]): boolean {
  if (isNonPublicIp(ip)) return true;
  const norm = (s: string) => (s || '').replace(/^::ffff:/, '').trim();
  return adminIps.map(norm).filter(Boolean).includes(norm(ip));
}
