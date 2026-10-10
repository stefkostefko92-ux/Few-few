import { Prisma, type PrismaClient, type SsoConfig } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { appendAudit } from '../../audit.js';
import { announceRevocation, revokeUserSessions, type Principal } from '../../auth/sessions.js';
import {
  changesOf,
  identityChanged as isIdentityChange,
  issuerFor,
  requiredBlocked,
} from './admin-changes.js';
import { normalizeDomains, type CreateInputT, type UpdateInputT } from './admin-input.js';
import {
  passwordSessionUsers,
  replaceDomains,
  resetProviderIdentity,
  ssoSessionUsers,
} from './admin-store.js';
import { scopeKeyOf } from './policy.js';
import type { ProviderCache } from './provider.js';
import type { SsoDeps } from './types.js';

/**
 * Управлението на доставчиците (TENANT_ADMIN / PLATFORM_ADMIN със `sso:manage`), всичко по
 * tenantId на администратора — чужд запис = 404. Секретът само влиза (шифрован); в одита — само
 * имената на сменените полета. Доставчикът се ВКЛЮЧВА само след успешен тест на текущите настройки;
 * нов доставчик се създава изключен. Смяна на издател/директория/клиент = нов доставчик (нов секрет
 * в същата заявка, изключен, нов тест, нови връзки, ново доказване на домейните). Отслабване на
 * доверието отнема SSO сесиите на доставчика; преминаване към REQUIRED отнема сесиите с парола на
 * покритите хора — всичко през `revokeUserSessions`.
 */

export type AdminResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string };

export interface AdminCtx {
  db: PrismaClient;
  sso: SsoDeps;
  cache: ProviderCache;
  actor: Principal;
}

const fail = <T>(status: number, code: string): AdminResult<T> => ({ ok: false, status, code });

/** Домейн, доказан от друг доставчик — прекъсва транзакцията (нищо не се записва). */
class DomainConflict extends Error {}
/** Доставчикът е сменен междувременно (от друг администратор) — прекъсва транзакцията. */
class ConcurrentChange extends Error {}

export async function createConfig(
  ctx: AdminCtx,
  input: CreateInputT,
): Promise<AdminResult<SsoConfig>> {
  const tenantId = ctx.actor.user.tenantId;
  // Включва се след успешен тест (а тестът иска доказан домейн) — не при създаване.
  if (input.enabled) return fail(409, 'sso_test_required');
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
          enabled: false,
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

/** Заявените домейни след промяната; същият набор (UI праща всичко) → null (не е промяна). */
async function newDomains(
  ctx: AdminCtx,
  id: string,
  input: UpdateInputT,
): Promise<{ ok: true; domains: string[] | null } | { ok: false }> {
  if (!input.domains) return { ok: true, domains: null };
  const domains = normalizeDomains(input.domains);
  if (!domains || domains.length === 0) return { ok: false };
  const current = await ctx.db.ssoDomain.findMany({
    where: { configId: id },
    select: { domain: true },
  });
  const same =
    current.length === domains.length && current.every((d) => domains.includes(d.domain));
  return { ok: true, domains: same ? null : domains };
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
  const dom = await newDomains(ctx, id, input);
  if (!dom.ok) return fail(400, 'sso_invalid_domain');
  const domains = dom.domains;

  const identityChanged = isIdentityChange(c);
  const secretChanged = input.clientSecret !== undefined;
  // Старият секрет никога не отива към новия издател: смяната иска нов секрет в същата заявка.
  if (identityChanged && !secretChanged) return fail(400, 'sso_secret_required');
  // Нов доставчик се включва само след нов успешен тест (не в същата заявка).
  if (identityChanged && input.enabled === true) return fail(409, 'sso_test_required');
  // `updatedAt` изрично: и промяна само на домейните мести версията (празно `data` не би обновило
  // реда → оптимистичната проверка би отказала с `sso_conflict`).
  const data: Prisma.SsoConfigUpdateManyMutationInput = { ...c, updatedAt: new Date() };
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
  if (identityChanged) data.enabled = false;
  const mode = c.mode ?? before.mode;
  const enabled = identityChanged ? false : (c.enabled ?? before.enabled);
  const tested = !identityChanged && !secretChanged && before.lastTestOk === true;
  // Включване (изключен → включен) — само след успешен тест на ТЕКУЩИТЕ настройки.
  if (enabled && !before.enabled && !tested) return fail(409, 'sso_test_required');
  const becomesRequired =
    mode === 'REQUIRED' && enabled && !(before.mode === 'REQUIRED' && before.enabled);
  if (becomesRequired) {
    const blocked = await requiredBlocked(ctx, before, tested);
    if (blocked) return fail(409, blocked);
  }
  // По-малко доверие → SSO сесиите на доставчика се отнемат (смяната на секрета не е такава).
  const weakened =
    (before.enabled && !enabled) ||
    (before.trustIdpMfa && c.trustIdpMfa === false) ||
    identityChanged;
  const changed = [
    ...new Set([
      ...Object.keys(c),
      ...(domains ? ['domains'] : []),
      ...(before.enabled && !enabled ? ['enabled'] : []),
    ]),
  ].sort();

  const out = await ctx.db
    .$transaction(async (tx) => {
      // Оптимистично: решенията (тест, REQUIRED) са взети върху `before` — паралелна промяна → 409.
      const saved = await tx.ssoConfig.updateMany({
        where: { id, updatedAt: before.updatedAt },
        data,
      });
      if (saved.count !== 1) throw new ConcurrentChange();
      const cfg = await tx.ssoConfig.findUniqueOrThrow({ where: { id } });
      const reset = identityChanged ? await resetProviderIdentity(tx, id) : null;
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
        detail: {
          changed,
          secretChanged,
          revokedUsers: revocation?.userIds.length ?? 0,
          ...(reset ? { identitiesReset: reset.identities, domainsReset: reset.domains } : {}),
        },
      });
      return { cfg, revocation };
    })
    .catch((err: unknown) => {
      if (err instanceof DomainConflict) return 'sso_domain_taken' as const;
      if (err instanceof ConcurrentChange) return 'sso_conflict' as const;
      throw err;
    });
  ctx.cache.forget(id);
  if (typeof out === 'string') return fail(409, out);
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
