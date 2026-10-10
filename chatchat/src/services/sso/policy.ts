import type { AccountKind, PrismaClient, Role, SsoConfig } from '@prisma/client';
import { tenantBySsoDomain } from '../../db/discovery.js';
import { INTERNAL_SCOPE } from './types.js';

/**
 * Кого покрива доставчикът и кога паролата е отказана. Доставчикът на клиента (без фирма) е за
 * вътрешните потребители; доставчикът на фирма — за порталните потребители на ТАЗИ фирма. Акаунти
 * не се създават от входа — само се свързват (администраторът ги създава, както досега).
 */

/** Домейн за сравнение: малки букви, без точка накрая; невалиден → null. */
export function normalizeDomain(raw: string): string | null {
  const d = raw.trim().toLowerCase().replace(/\.$/, '');
  if (d.length < 3 || d.length > 253) return null;
  // Етикети по RFC 1035 (+ IDN в punycode), поне една точка, TLD от букви/punycode.
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const parts = d.split('.');
  if (parts.length < 2 || !parts.every((p) => label.test(p))) return null;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(parts.at(-1) ?? '')) return null;
  return d;
}

/** Домейнът на имейл адрес (малки букви) или null. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  return normalizeDomain(email.slice(at + 1));
}

export function scopeKeyOf(companyId: string | null): string {
  return companyId ?? INTERNAL_SCOPE;
}

interface Coverable {
  kind: AccountKind;
  companyId: string | null;
}

/** Покрива ли доставчикът акаунта (вътрешен ↔ доставчик на клиента; портален ↔ на фирмата му). */
export function covers(config: Pick<SsoConfig, 'companyId'>, user: Coverable): boolean {
  return config.companyId === null
    ? user.kind === 'INTERNAL'
    : user.kind === 'PORTAL' && user.companyId === config.companyId;
}

/** Обхватът на акаунта — по него се търси доставчикът му (един на обхват в клиента). */
export function userScopeKey(user: Coverable): string | null {
  return user.kind === 'INTERNAL' ? INTERNAL_SCOPE : user.companyId;
}

/**
 * Паролата отказана ли е за човека (режим REQUIRED на включен доставчик, който го покрива)?
 * Платформеният администратор е изключение — операторът на платформата не е в директорията на
 * клиента и е аварийният вход, ако доставчикът падне (заедно с `npm run sso:off` на сървъра).
 */
export async function passwordRefused(
  db: PrismaClient,
  user: Coverable & { tenantId: string; role: Role },
): Promise<boolean> {
  if (user.role === 'PLATFORM_ADMIN') return false;
  const scopeKey = userScopeKey(user);
  if (!scopeKey) return false;
  const cfg = await db.ssoConfig.findUnique({
    where: { tenantId_scopeKey: { tenantId: user.tenantId, scopeKey } },
    select: { enabled: true, mode: true },
  });
  return cfg !== null && cfg.enabled && cfg.mode === 'REQUIRED';
}

/**
 * Доставчикът за имейла по домейна му (само включен). Не чете потребители — отговорът е еднакъв
 * за съществуващ и несъществуващ акаунт.
 */
export async function configForEmail(db: PrismaClient, email: string): Promise<SsoConfig | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const row = await db.ssoDomain.findUnique({ where: { domain }, include: { config: true } });
  return row && row.config.enabled ? row.config : null;
}

/**
 * Клиентът на включения доставчик за домейна на имейла — тесният път преди вход (само id на
 * клиента). `configForEmail` и потокът след нея текат в контекста му, под RLS.
 */
export async function tenantForEmailDomain(
  db: PrismaClient,
  email: string,
): Promise<string | null> {
  const domain = emailDomain(email);
  return domain ? tenantBySsoDomain(db, domain) : null;
}
