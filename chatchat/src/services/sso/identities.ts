import { Prisma, type PrismaClient, type SsoConfig } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { roleRank } from '../../auth/rbac.js';
import { announceRevocation, revokeUserSessions, type Principal } from '../../auth/sessions.js';
import type { AdminResult } from './admin.js';

/**
 * Изгледите на доставчиците за конзолата (без секрета) и връзките с акаунти: списък и развързване
 * (акаунтът се свързва наново при следващия вход по проверен имейл). Резултатът от „Тест на
 * конфигурацията“ — само флагове, без лични данни и без токени.
 */

export function configView(
  cfg: SsoConfig & {
    domains: Array<{ domain: string }>;
    company: { name: string } | null;
    _count: { identities: number };
  },
) {
  return {
    id: cfg.id,
    companyId: cfg.companyId,
    companyName: cfg.company?.name ?? null,
    provider: cfg.provider,
    displayName: cfg.displayName,
    issuer: cfg.issuer,
    entraTenantId: cfg.entraTenantId,
    clientId: cfg.clientId,
    /** Само че го има и кога е сменен — стойността никога не излиза. */
    hasSecret: cfg.clientSecretEnc.length > 0,
    secretUpdatedAt: cfg.secretUpdatedAt,
    mode: cfg.mode,
    trustIdpMfa: cfg.trustIdpMfa,
    idpLogout: cfg.idpLogout,
    enabled: cfg.enabled,
    lastTestAt: cfg.lastTestAt,
    lastTestOk: cfg.lastTestOk,
    lastTestReport: cfg.lastTestReport,
    domains: cfg.domains.map((d) => d.domain).sort(),
    linkedUsers: cfg._count.identities,
  };
}

export const CONFIG_INCLUDE = {
  domains: { select: { domain: true } },
  company: { select: { name: true } },
  _count: { select: { identities: true } },
} as const;

export async function listIdentities(db: PrismaClient, tenantId: string, configId: string) {
  const cfg = await db.ssoConfig.findFirst({
    where: { id: configId, tenantId },
    select: { id: true },
  });
  if (!cfg) return null;
  const rows = await db.externalIdentity.findMany({
    where: { configId, tenantId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      createdAt: true,
      user: { select: { id: true, name: true, email: true, role: true, kind: true } },
    },
  });
  return rows.map((r) => ({ ...r.user, linkedAt: r.createdAt }));
}

export async function unlinkIdentity(
  db: PrismaClient,
  actor: Principal,
  userId: string,
): Promise<AdminResult<null>> {
  const tenantId = actor.user.tenantId;
  const identity = await db.externalIdentity.findFirst({
    where: { userId, tenantId },
    include: { user: { select: { role: true } } },
  });
  if (!identity) return { ok: false, status: 404, code: 'not_found' };
  if (userId === actor.user.id) return { ok: false, status: 409, code: 'cannot_modify_self' };
  if (roleRank(identity.user.role) > roleRank(actor.user.role)) {
    return { ok: false, status: 403, code: 'forbidden' };
  }
  const revocation = await db.$transaction(async (tx) => {
    await tx.externalIdentity.delete({ where: { id: identity.id } });
    const event = await revokeUserSessions(tx, [userId], 'sso_changed');
    await appendAudit(tx, {
      tenantId,
      actorId: actor.user.id,
      action: 'sso.identity_unlinked',
      objectType: 'user',
      objectId: userId,
      detail: { configId: identity.configId },
    });
    return event;
  });
  await announceRevocation(revocation);
  return { ok: true, value: null };
}

/** Флаговете от теста — кое от нужното за входа доставчикът реално връща. */
export interface TestReport {
  ok: boolean;
  /** Код на провала: state | idp_error | exchange | no_id_token | issuer_mismatch | tenant_mismatch | guest_account | no_subject */
  failure: string | null;
  emailVerified: boolean;
  domainAllowed: boolean;
  amrPresent: boolean;
  mfa: boolean;
}

export async function recordTest(
  db: PrismaClient,
  cfg: SsoConfig,
  actorId: string | null,
  report: TestReport,
): Promise<void> {
  // Само ако настройките са същите, с които е минал тестът (междувременна смяна го обезсилва).
  await db.ssoConfig.updateMany({
    where: {
      id: cfg.id,
      issuer: cfg.issuer,
      clientId: cfg.clientId,
      secretUpdatedAt: cfg.secretUpdatedAt,
    },
    data: {
      lastTestAt: new Date(),
      lastTestOk: report.ok,
      lastTestReport: report as unknown as Prisma.InputJsonValue,
    },
  });
  await appendAudit(db, {
    tenantId: cfg.tenantId,
    actorId,
    action: 'sso.config_tested',
    objectType: 'sso_config',
    objectId: cfg.id,
    detail: { ok: report.ok, failure: report.failure },
  });
}
