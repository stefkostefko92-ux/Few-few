import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
import { DEFAULT_LOCALE, hasKey } from '../i18n.js';

const FLASH_COOKIE = 'rd_flash';

export type FlashKind = 'ok' | 'error' | 'info';

/**
 * Еднократно съобщение през бисквитка. Пази се КЛЮЧЪТ на превода (+ параметри), не готов текст —
 * така съобщението излиза на езика на следващата страница.
 */
export function setFlash(
  res: Response,
  kind: FlashKind,
  key: string,
  params: Record<string, string | number> = {},
): void {
  res.cookie(FLASH_COOKIE, JSON.stringify({ kind, key, params }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: 60_000,
  });
}

export function readFlash(req: Request, res: Response, next: NextFunction): void {
  res.locals.flash = null;
  const raw = ((req.cookies ?? {}) as Record<string, string | undefined>)[FLASH_COOKIE];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { kind?: unknown; key?: unknown; params?: unknown };
      const kindOk = parsed.kind === 'ok' || parsed.kind === 'error' || parsed.kind === 'info';
      // Само ключ, който го има в речника — бисквитката идва от браузъра и не е доверена.
      if (
        kindOk &&
        typeof parsed.key === 'string' &&
        /^[a-zA-Z0-9_.]{1,80}$/.test(parsed.key) &&
        hasKey(DEFAULT_LOCALE, parsed.key)
      ) {
        const params: Record<string, string | number> = {};
        if (parsed.params && typeof parsed.params === 'object') {
          for (const [k, v] of Object.entries(parsed.params as Record<string, unknown>)) {
            if (typeof v === 'string' || typeof v === 'number')
              params[k] = typeof v === 'string' ? v.slice(0, 200) : v;
          }
        }
        res.locals.flash = { kind: parsed.kind, key: parsed.key, params };
      }
    } catch {
      /* повредена бисквитка — игнорира се */
    }
    res.clearCookie(FLASH_COOKIE, { path: '/' });
  }
  next();
}
