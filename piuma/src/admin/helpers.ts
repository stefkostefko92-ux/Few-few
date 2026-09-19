import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
import type { Actor } from '../services/posts.js';
import { humanPrincipal } from '../auth/guards.js';
import type { AuditActor } from '../audit.js';

const FLASH_COOKIE = 'flash';

/** Превод в маршрут: `res.locals.t` е сложен от `attachLocale` преди всеки маршрут. */
export function tr(
  res: Response,
  key: string,
  params: Record<string, string | number> = {},
): string {
  return res.locals.t(key, params);
}

/** Еднократно съобщение през бисквитка — без сесийно състояние в паметта на процеса. */
export function setFlash(res: Response, kind: 'ok' | 'error' | 'info', text: string): void {
  res.cookie(FLASH_COOKIE, JSON.stringify({ kind, text }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction(),
    path: '/admin',
    maxAge: 60_000,
  });
}

export function readFlash(req: Request, res: Response, next: NextFunction): void {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  res.locals.flash = null;
  const raw = cookies[FLASH_COOKIE];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { kind?: string; text?: string };
      if (
        (parsed.kind === 'ok' || parsed.kind === 'error' || parsed.kind === 'info') &&
        typeof parsed.text === 'string'
      ) {
        res.locals.flash = { kind: parsed.kind, text: parsed.text };
      }
    } catch {
      /* повредена бисквитка — игнорирай */
    }
    res.clearCookie(FLASH_COOKIE, { path: '/admin' });
  }
  next();
}

/** Актьорът за услугите и одита — винаги човекът зад сесията. */
export function actorOf(req: Request): Actor & AuditActor {
  const principal = humanPrincipal(req);
  if (!principal) throw new Error('Няма вписан потребител.');
  return {
    type: 'HUMAN',
    id: principal.user.id,
    label: `${principal.user.name} <${principal.user.email}>`,
    ip: req.ip ?? null,
  };
}

/** Разделя „#таг1 #таг2, таг3" на нормализирани хаштагове. */
export function parseHashtags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
}

export function stringField(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function optionalField(body: unknown, key: string): string | undefined {
  const value = stringField(body, key);
  return value === '' ? undefined : value;
}

export function pageParam(req: Request): { page: number; take: number; skip: number } {
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
  const take = 25;
  return { page, take, skip: (page - 1) * take };
}

export function humanIdOf(req: Request): string {
  const principal = humanPrincipal(req);
  if (!principal) throw new Error('Няма вписан потребител.');
  return principal.user.id;
}
