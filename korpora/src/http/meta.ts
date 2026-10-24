import type { Request } from 'express';
import { countryOf } from '../auth/geoip.js';
import { normalizeIp } from './ip.js';

export interface RequestMeta {
  ip: string | null;
  country: string | null;
  userAgent: string | null;
}

/** id на запис в базата (cuid) — всичко друго от адреса не стига до заявка (NUL в `text` дава 500). */
export function isRecordId(value: string): boolean {
  return /^[a-z0-9]{20,40}$/.test(value);
}

/** `:id` от адреса, ако е id на запис; иначе празно — заявката не намира нищо, вместо да падне. */
export function idParam(req: Request): string {
  const id = String(req.params.id ?? '');
  return isRecordId(id) ? id : '';
}

/** IP (през `trust proxy`), държава и User-Agent на заявката — за входовете и сесиите. */
export function requestMeta(req: Request): RequestMeta {
  const ip = normalizeIp(req.ip);
  const ua = (req.get('user-agent') ?? '').slice(0, 300);
  return { ip, country: countryOf(ip), userAgent: ua || null };
}

/**
 * Пренасочване след вход само към наш път: „/app…“, „/account…“ или „/admin…“. Никога към друг
 * хост („//evil“, „/\\evil“, „https:“) — иначе входът става отворен пренасочвач за фишинг.
 */
export function safeNext(value: unknown, fallback = '/app'): string {
  if (typeof value !== 'string' || value.length > 300) return fallback;
  if (!/^\/(app|account|admin)(\/|\?|$)/.test(value)) return fallback;
  if (value.includes('\\') || /[\r\n]/.test(value)) return fallback;
  return value;
}

export function stringField(body: unknown, key: string, max = 500): string {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Паролата НЕ се изрязва от интервали — те са част от нея. */
export function rawField(body: unknown, key: string, max = 300): string {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value.slice(0, max) : '';
}
