import { Prisma, type PrismaClient, type SsoConfig } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { appendAudit } from '../../audit.js';
import { announceRevocation, revokeUserSessions, type Principal } from '../../auth/sessions.js';
import {
  normalizeDomains,
  validIssuer,
  type CreateInputT,
  type UpdateInputT,
} from './admin-input.js';
import { passwordSessionUsers, replaceDomains, ssoSessionUsers } from './admin-store.js';
import { scopeKeyOf } from './policy.js';
import type { ProviderCache } from './provider.js';
import { entraIssuer, type SsoDeps } from './types.js';

/**
 * Управлението на доставчиците (TENANT_ADMIN / PLATFORM_ADMIN със `sso:manage`), всичко по
 * tenantId на администратора — чужд запис = 404. Секретът само влиза (шифрован); в одита — само
 * имената на сменените полета. Отслабване на доверието (изключване, друг издател/клиент, без
 * доверие в MFA на доставчика) отнема SSO сесиите на доставчика; преминаване към REQUIRED отнема
 * сесиите с парола на покритите хора — всичко през `revokeUserSessions`.
 */

export type AdminResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string };

export interface AdminCtx {
  db: PrismaClient;
  sso: SsoDeps;
  cache: ProviderCache;
  actor: Principal;
}

const fail = <T>(status: number, code: string): AdminResult<T> => ({ ok: false, status, code });

/** Домейн на друг доставчик — прекъсва транзакцията (нищо не се записва). */
class DomainConflict extends Error {}

/** Издателят според доставчика; невалиден вход → null. */
function issuerFor(
  sso: SsoDeps,
  provider: 'ENTRA' | 'OIDC',
  input: { entraTenantId?: string | undefined; issuer?: string | undefined },
): string | null {
  if (provider === 'ENTRA') {
    return input.entraTenantId ? entraIssuer(sso.entraAuthority, input.entraTenantId) : null;
  }
  return input.issuer ? validIssuer(input.issuer, sso.allowInsecureHttp) : null;
}

export async function createConfig(
  ctx: AdminCtx,
  input: CreateInputT,
): Promise<AdminResult<SsoConfig>> {
  const tenantId = ctx.actor.user.tenantId;
  const issuer = issuerFor(ctx.sso, input.provider, input);
  if (!issuer) return fail(400, 'sso_invalid_issuer');
  const domains = normalizeDomains(input.domains);
  if (!domains || domains.length === 0) return fail(400, 'sso_invalid_domain');
  if (input.companyId) {
    const company = await ctx.db.company.findFirst({ where: { id: input.companyId, tenantId } });
    if (!company) return fail(404, 'unknown_company');
  }
  const scopeKey = scopeKeyOf(input.companyId);
  const exists = await ctx.db.ssoConfig.findUnique({
    where: { tenantId_scopeKey: { tenantId, scopeKey } },
    select: { id: true },
  });
  if (exists) return fail(409, 'sso_scope_exists');
  // id-то е нужно преди записа: шифротекстът на секрета е вързан към него (AAD).
  const id = `sso${randomBytes(12).toString('hex')}`;
  return ctx.db
    .$transaction(async (tx): Promise<AdminResult<SsoConfig>> => {
      const cfg = await tx.ssoConfig.create({
        data: {
          id,
          tenantId,
          companyId: input.companyId,
          scopeKey,
          provider: input.provider,
          displayName: input.provider === 'ENTRA' ? '' : input.displayName,
          issuer,
          entraTenantId: input.provider === 'ENTRA' ? (input.entraTenantId ?? null) : null,
          clientId: input.clientId,
          clientSecretEnc: ctx.sso.box.seal(input.clientSecret, tenantId, id),
          trustIdpMfa: input.trustIdpMfa,
          idpLogout: input.idpLogout,
          enabled: input.enabled,
        },
      });
      if (await replaceDomains(tx, cfg, domains)) throw new DomainConflict();
      await appendAudit(tx, {
        tenantId,
        actorId: ctx.actor.user.id,
        action: 'sso.config_created',
        objectType: 'sso_config',
        objectId: cfg.id,
        detail: { provider: cfg.provider, scope: cfg.companyId ? 'company' : 'internal' },
      });
      return { ok: true, value: cfg };
    })
    .catch((err: unknown) => {
      if (err instanceof DomainConflict) return fail<SsoConfig>(409, 'sso_domain_taken');
      // Паралелно създаден доставчик за същия обхват (уникалният индекс tenantId + scopeKey).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return fail<SsoConfig>(409, 'sso_scope_exists');
      }
      throw err;
    });
}

/** Новите стойности на полетата (само сменените) — после стават `data` на Prisma. */
interface Changes {
  issuer?: string;
  entraTenantId?: string;
  clientId?: string;
  displayName?: string;
  mode?: 'OPTIONAL' | 'REQUIRED';
  trustIdpMfa?: boolean;
  idpLogout?: boolean;
  enabled?: boolean;
}

function changesOf(
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

/** Активира ли промяната REQUIRED сега — тогава важат проверките срещу заключване. */
async function requiredBlocked(
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

export async function updateConfig(
  ctx: AdminCtx,
  id: string,
  input: UpdateInputT,
): Promise<AdminResult<SsoConfig>> {
  const tenantId = ctx.actor.user.tenantId;
  const before = await ctx.db.ssoConfig.findFirst({ where: { id, tenantId } });
  if (!before) return fail(404, 'not_found');
  const diff = changesOf(ctx.sso, before, input);
  if (!diff.ok) return fail(400, diff.code);
  const c = diff.changes;
  const domains = input.domains ? normalizeDomains(input.domains) : null;
  if (input.domains && (!domains || domains.length === 0)) return fail(400, 'sso_invalid_domain');

  const identityChanged =
    c.issuer !== undefined || c.entraTenantId !== undefined || c.clientId !== undefined;
  const secretChanged = input.clientSecret !== undefined;
  const data: Prisma.SsoConfigUpdateInput = { ...c };
  if (input.clientSecret !== undefined) {
    data.clientSecretEnc = ctx.sso.box.seal(input.clientSecret, tenantId, id);
    data.secretUpdatedAt = new Date();
  }
  if (identityChanged || secretChanged) {
    // Друг доставчик/клиент/секрет → предишният тест вече не доказва нищо.
    data.lastTestAt = null;
    data.lastTestOk = null;
    data.lastTestReport = Prisma.JsonNull;
  }
  const mode = c.mode ?? before.mode;
  const enabled = c.enabled ?? before.enabled;
  const becomesRequired =
    mode === 'REQUIRED' && enabled && !(before.mode === 'REQUIRED' && before.enabled);
  if (becomesRequired) {
    const tested = !identityChanged && !secretChanged && before.lastTestOk === true;
    const blocked = await requiredBlocked(ctx, before, tested);
    if (blocked) return fail(409, blocked);
  }
  // По-малко доверие → SSO сесиите на доставчика се отнемат (смяната на секрета не е такава).
  const weakened =
    (before.enabled && !enabled) ||
    (before.trustIdpMfa && c.trustIdpMfa === false) ||
    identityChanged;
  const changed = [...Object.keys(c), ...(domains ? ['domains'] : [])].sort();

  const out = await ctx.db
    .$transaction(async (tx) => {
      const cfg = await tx.ssoConfig.update({ where: { id }, data });
      if (domains && (await replaceDomains(tx, cfg, domains))) throw new DomainConflict();
      const users = new Set<string>();
      if (weakened) for (const u of await ssoSessionUsers(tx, id)) users.add(u);
      // REQUIRED: покритите със сесия с парола излизат. Без самия администратор — той току-що
      // е доказал входа през доставчика (requiredBlocked); иначе би изгубил и тази си сесия.
      if (becomesRequired) {
        for (const u of await passwordSessionUsers(tx, cfg)) {
          if (u !== ctx.actor.user.id) users.add(u);
        }
      }
      const revocation = users.size
        ? await revokeUserSessions(tx, [...users], 'sso_changed')
        : null;
      await appendAudit(tx, {
        tenantId,
        actorId: ctx.actor.user.id,
        action: 'sso.config_updated',
        objectType: 'sso_config',
        objectId: id,
        detail: { changed, secretChanged, revokedUsers: revocation?.userIds.length ?? 0 },
      });
      return { cfg, revocation };
    })
    .catch((err: unknown) => {
      if (err instanceof DomainConflict) return null;
      throw err;
    });
  ctx.cache.forget(id);
  if (!out) return fail(409, 'sso_domain_taken');
  if (out.revocation) await announceRevocation(out.revocation);
  return { ok: true, value: out.cfg };
}

export async function deleteConfig(ctx: AdminCtx, id: string): Promise<AdminResult<null>> {
  const tenantId = ctx.actor.user.tenantId;
  const cfg = await ctx.db.ssoConfig.findFirst({ where: { id, tenantId } });
  if (!cfg) return fail(404, 'not_found');
  const revocation = await ctx.db.$transaction(async (tx) => {
    const users = await ssoSessionUsers(tx, id);
    const event = users.length ? await revokeUserSessions(tx, users, 'sso_changed') : null;
    await tx.ssoConfig.delete({ where: { id } });
    await appendAudit(tx, {
      tenantId,
      actorId: ctx.actor.user.id,
      action: 'sso.config_deleted',
      objectType: 'sso_config',
      objectId: id,
      detail: { provider: cfg.provider, revokedUsers: users.length },
    });
    return event;
  });
  if (revocation) await announceRevocation(revocation);
  ctx.cache.forget(id);
  return { ok: true, value: null };
}
