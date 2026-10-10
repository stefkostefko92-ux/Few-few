import type { SsoConfig } from '@prisma/client';
import { validIssuer, type UpdateInputT } from './admin-input.js';
import type { AdminCtx } from './admin.js';
import { entraIssuer, type SsoDeps } from './types.js';

/**
 * Решенията върху промяна на доставчик (без запис): издателят, сменените полета, кога промяната е
 * „нов доставчик“ (издател/директория/клиент) и кога REQUIRED може да се включи.
 */

/** Издателят според доставчика; невалиден вход → null. */
export function issuerFor(
  sso: SsoDeps,
  provider: 'ENTRA' | 'OIDC',
  input: { entraTenantId?: string | undefined; issuer?: string | undefined },
): string | null {
  if (provider === 'ENTRA') {
    return input.entraTenantId ? entraIssuer(sso.entraAuthority, input.entraTenantId) : null;
  }
  return input.issuer ? validIssuer(input.issuer, sso.allowInsecureHttp) : null;
}

/** Новите стойности на полетата (само сменените) — после стават `data` на Prisma. */
export interface Changes {
  issuer?: string;
  entraTenantId?: string;
  clientId?: string;
  displayName?: string;
  mode?: 'OPTIONAL' | 'REQUIRED';
  trustIdpMfa?: boolean;
  idpLogout?: boolean;
  enabled?: boolean;
}

export function changesOf(
  sso: SsoDeps,
  before: SsoConfig,
  input: UpdateInputT,
): { ok: true; changes: Changes } | { ok: false; code: string } {
  const c: Changes = {};
  if (before.provider === 'ENTRA' && input.entraTenantId !== undefined) {
    c.entraTenantId = input.entraTenantId;
    c.issuer = entraIssuer(sso.entraAuthority, input.entraTenantId);
  }
  if (before.provider === 'OIDC' && input.issuer !== undefined) {
    const issuer = validIssuer(input.issuer, sso.allowInsecureHttp);
    if (!issuer) return { ok: false, code: 'sso_invalid_issuer' };
    c.issuer = issuer;
  }
  if (input.clientId !== undefined) c.clientId = input.clientId;
  if (before.provider === 'OIDC' && input.displayName !== undefined) {
    c.displayName = input.displayName;
  }
  if (input.mode !== undefined) c.mode = input.mode;
  if (input.trustIdpMfa !== undefined) c.trustIdpMfa = input.trustIdpMfa;
  if (input.idpLogout !== undefined) c.idpLogout = input.idpLogout;
  if (input.enabled !== undefined) c.enabled = input.enabled;
  // Само реално сменените — одитът и решенията (тест, отнемане) гледат тях.
  for (const k of Object.keys(c) as Array<keyof Changes>) {
    if (c[k] === before[k]) delete c[k];
  }
  return { ok: true, changes: c };
}

/**
 * Смяна на издателя, директорията (tid) или клиента = НОВ доставчик: другият издател би получил
 * стария секрет (client_secret_basic към неговия token endpoint) и би твърдял имейлите в старите
 * домейни. Затова — нов секрет в същата заявка, нов тест, нови връзки и ново доказване на домейните.
 */
export function identityChanged(c: Changes): boolean {
  return c.issuer !== undefined || c.entraTenantId !== undefined || c.clientId !== undefined;
}

/** Активира ли промяната REQUIRED сега — тогава важат проверките срещу заключване. */
export async function requiredBlocked(
  ctx: AdminCtx,
  before: SsoConfig,
  tested: boolean,
): Promise<string | null> {
  // Само след успешен тест на ТЕКУЩИТЕ настройки и от човек, който самият е влязъл през този
  // доставчик (или е платформеният администратор — аварийният вход).
  if (!tested) return 'sso_test_required';
  if (ctx.actor.user.role === 'PLATFORM_ADMIN') return null;
  const own = await ctx.db.session.findUnique({
    where: { id: ctx.actor.session.id },
    select: { authMethod: true, ssoConfigId: true },
  });
  const coveredActor =
    before.companyId === null
      ? ctx.actor.user.kind === 'INTERNAL'
      : ctx.actor.user.companyId === before.companyId;
  return coveredActor && (own?.authMethod !== 'SSO' || own.ssoConfigId !== before.id)
    ? 'sso_actor_not_sso'
    : null;
}
