import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { isProduction } from '../config.js';
import { DEFAULT_LOCALE, hasKey } from '../i18n.js';
import { readCookie } from './cookies.js';

const FLASH_COOKIE = 'rd_flash';
/** Съобщението живее минута — достатъчно за пренасочването след действието. */
export const FLASH_MAX_AGE_MS = 60_000;

const FLASH_KINDS = ['ok', 'error', 'info'] as const;
export type FlashKind = (typeof FLASH_KINDS)[number];

/** Параметрите на съобщението — само текст (до 200 знака) и числа; другото се изхвърля. */
function plainParams(raw: Record<string, unknown>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') params[k] = v.slice(0, 200);
    else if (typeof v === 'number') params[k] = v;
  }
  return params;
}

/** Бисквитката идва от браузъра и не е доверена: само ключ, който го има в речника. */
const flashSchema = z.object({
  kind: z.enum(FLASH_KINDS),
  key: z
    .string()
    .regex(/^[a-zA-Z0-9_.]{1,80}$/)
    .refine((key) => hasKey(DEFAULT_LOCALE, key)),
  params: z.record(z.unknown()).catch({}).transform(plainParams),
});

export type Flash = z.infer<typeof flashSchema>;

/** Съобщението от бисквитката или null (повредена или подправена). */
export function parseFlash(raw: string): Flash | null {
  try {
    const parsed = flashSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

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
    maxAge: FLASH_MAX_AGE_MS,
  });
}

export function readFlash(req: Request, res: Response, next: NextFunction): void {
  res.locals.flash = null;
  const raw = readCookie(req, FLASH_COOKIE);
  if (raw) {
    res.locals.flash = parseFlash(raw);
    res.clearCookie(FLASH_COOKIE, { path: '/' });
  }
  next();
}
