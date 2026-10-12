import type { AccountKind, PrismaClient, Role, SsoConfig, SsoLinkMethod } from '@prisma/client';
import { can, ROLES, roleRank } from '../../auth/rbac.js';
import { tenantBySsoDomain } from '../../db/discovery.js';
import { INTERNAL_SCOPE } from './types.js';

/**
 * Кого покрива доставчикът и кога паролата е отказана. Доставчикът на клиента (без фирма) е за
 * вътрешните потребители; доставчикът на фирма — за порталните потребители на ТАЗИ фирма. Акаунти
 * не се създават от входа — само се свързват (администраторът ги създава, както досега).
 *
 * Моделът на доверие (SECURITY.md, „Единен вход“): доставчикът се настройва от човек със
 * `sso:manage` — той избира издателя, т.е. КОЙ твърди имейлите. Затова:
 * - платформеният администратор НИКОГА не влиза през доставчик (аварийният вход на оператора);
 * - акаунт с ранг ≥ този на настройващите (администраторът на клиента) или с включен локален TOTP
 *   (фактор, който държи само собственикът) се свързва САМО от собственика — от сесия с парола +
 *   TOTP („Свържи“), никога по имейл при вход;
 * - останалите (техници, персонал без собствен фактор) — по проверен имейл в ДОКАЗАН домейн при
 *   първи вход: администраторът и без това им издава линк за парола и нулира MFA (шумно, в одита),
 *   а свързването по имейл също е в одита (`sso.identity_linked`) и в списъка с връзки.
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
 * Най-ниският ранг сред ролите със `sso:manage` — хората, които избират издателя. Изведен от
 * матрицата (днес TENANT_ADMIN): нова роля с правото автоматично мести границата.
 */
export const SSO_MANAGER_RANK = Math.min(
  ...ROLES.filter((r) => can(r, 'sso:manage')).map((r) => roleRank(r)),
);

interface Owned {
  role: Role;
  totpEnabledAt: Date | null;
}

/**
 * Свързва ли се акаунтът САМО от собственика (никога по имейл при вход): ранг ≥ настройващите
 * доставчика или включен локален TOTP (собственикът държи фактор, който администраторът не може
 * да ползва тихо — само да го нулира, шумно и в одита).
 */
export function ownerLinkRequired(user: Owned): boolean {
  return roleRank(user.role) >= SSO_MANAGER_RANK || user.totpEnabledAt !== null;
}

/**
 * Може ли тази връзка да вписва акаунта: платформеният администратор — никога; ранг ≥
 * настройващите — само връзка от собственика (SELF); останалите — всяка (по-стара връзка по имейл
 * на човек с TOTP остава, но НЕ замества локалния TOTP — виж `idpMfaAccepted`).
 */
export function linkUsable(user: Owned, method: SsoLinkMethod): boolean {
  if (user.role === 'PLATFORM_ADMIN') return false;
  if (roleRank(user.role) >= SSO_MANAGER_RANK) return method === 'SELF';
  return true;
}

/**
 * MFA при доставчика замества локалния TOTP само ако клиентът го е позволил, доставчикът го е
 * доказал (`amr` ∋ `mfa`) И акаунтът няма собствен фактор, или собственикът сам е направил връзката.
 * Иначе връзка по имейл (направена от който и да е контролира доставчика) би прескочила TOTP.
 */
export function idpMfaAccepted(
  cfg: Pick<SsoConfig, 'trustIdpMfa'>,
  idpMfa: boolean,
  user: Owned,
  method: SsoLinkMethod,
): boolean {
  if (user.role === 'PLATFORM_ADMIN') return false;
  return cfg.trustIdpMfa && idpMfa && (method === 'SELF' || user.totpEnabledAt === null);
}

/** Може ли човекът да влезе през доставчика с текущата си връзка (или да се свърже по имейл). */
export function canUseSso(user: Owned, link: { linkMethod: SsoLinkMethod } | null): boolean {
  if (link) return linkUsable(user, link.linkMethod);
  return user.role !== 'PLATFORM_ADMIN' && !ownerLinkRequired(user);
}

export type PasswordPolicy = 'allowed' | 'refused' | 'link_only';

/**
 * Паролата при вход: режим REQUIRED на включен доставчик, който покрива човека → отказана; но ако
 * той още НЕ може да влезе през доставчика (няма собствена връзка, а по имейл не се свързва) —
 * сесия само за свързването (`link_only`), иначе би останал заключен. Платформеният администратор е
 * изключение — операторът не е в директорията на клиента и е аварийният вход (с `npm run sso:off`).
 */
export async function passwordPolicy(
  db: PrismaClient,
  user: Coverable & Owned & { id: string; tenantId: string },
): Promise<PasswordPolicy> {
  if (user.role === 'PLATFORM_ADMIN') return 'allowed';
  const scopeKey = userScopeKey(user);
  if (!scopeKey) return 'allowed';
  const cfg = await db.ssoConfig.findUnique({
    where: { tenantId_scopeKey: { tenantId: user.tenantId, scopeKey } },
    select: { id: true, enabled: true, mode: true },
  });
  if (!cfg || !cfg.enabled || cfg.mode !== 'REQUIRED') return 'allowed';
  const link = await db.externalIdentity.findFirst({
    where: { userId: user.id, configId: cfg.id },
    select: { linkMethod: true },
  });
  return canUseSso(user, link) ? 'refused' : 'link_only';
}

/**
 * Доставчикът за имейла по ДОКАЗАНИЯ му домейн (само включен). Не чете потребители — отговорът е
 * еднакъв за съществуващ и несъществуващ акаунт. Заявен, но недоказан домейн не показва бутон.
 */
export async function configForEmail(db: PrismaClient, email: string): Promise<SsoConfig | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const row = await db.ssoDomain.findUnique({
    where: { verifiedDomain: domain },
    include: { config: true },
  });
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

/** Домейнът на имейла е доказан за ТОЗИ доставчик. */
export async function domainVerifiedFor(
  db: PrismaClient,
  configId: string,
  email: string | null,
): Promise<boolean> {
  const domain = email ? emailDomain(email) : null;
  if (!domain) return false;
  const row = await db.ssoDomain.findUnique({
    where: { verifiedDomain: domain },
    select: { configId: true },
  });
  return row?.configId === configId;
}
