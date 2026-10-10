import type { Prisma, SsoConfig } from '@prisma/client';
import { randomToken } from '../../crypto.js';

/**
 * Заявките на управлението на доставчиците в транзакция: домейните (заявки; доказаният домейн е
 * уникален в платформата), нулирането при смяна на доставчика и кого засяга смяната на политиката
 * (за `revokeUserSessions`).
 */

type Tx = Prisma.TransactionClient;

/**
 * Заменя заявените домейни на доставчика. Домейн, ДОКАЗАН от друг доставчик → код на грешката (нищо
 * не пипа). Недоказана заявка на друг НЕ пречи — доказва първият, който покаже DNS записа. Новите
 * заявки са недоказани; махнатите се изтриват (с доказването си — повторно добавен домейн се
 * доказва наново).
 */
export async function replaceDomains(
  tx: Tx,
  cfg: { id: string; tenantId: string },
  domains: string[],
): Promise<string | null> {
  const taken = await tx.ssoDomain.findFirst({
    where: { verifiedDomain: { in: domains }, configId: { not: cfg.id } },
    select: { id: true },
  });
  if (taken) return 'sso_domain_taken';
  await tx.ssoDomain.deleteMany({ where: { configId: cfg.id, domain: { notIn: domains } } });
  await tx.ssoDomain.createMany({
    data: domains.map((domain) => ({
      tenantId: cfg.tenantId,
      configId: cfg.id,
      domain,
      tokenNonce: randomToken(),
    })),
    skipDuplicates: true,
  });
  return null;
}

/**
 * Смяна на доставчика (издател, директория, клиент) = нов доставчик: връзките с акаунти се изтриват
 * (правят се наново), домейните се доказват наново (нов nonce → нов TXT токен), започнатите входове
 * се обезсилват. Секретът, тестът и изключването — в `updateConfig`.
 */
export async function resetProviderIdentity(
  tx: Tx,
  configId: string,
): Promise<{ identities: number; domains: number }> {
  const identities = await tx.externalIdentity.deleteMany({ where: { configId } });
  const rows = await tx.ssoDomain.findMany({ where: { configId }, select: { id: true } });
  for (const r of rows) {
    await tx.ssoDomain.update({
      where: { id: r.id },
      data: { verifiedAt: null, verifiedDomain: null, tokenNonce: randomToken() },
    });
  }
  await tx.ssoLoginState.deleteMany({ where: { configId, usedAt: null } });
  return { identities: identities.count, domains: rows.length };
}

/** Хората с активна SSO сесия от доставчика. */
export async function ssoSessionUsers(tx: Tx, configId: string): Promise<string[]> {
  const rows = await tx.session.findMany({
    where: { ssoConfigId: configId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}

/** Покритите хора с активна сесия с ПАРОЛА (без платформения администратор — аварийният вход). */
export async function passwordSessionUsers(tx: Tx, cfg: SsoConfig): Promise<string[]> {
  const rows = await tx.session.findMany({
    where: {
      authMethod: 'PASSWORD',
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: {
        tenantId: cfg.tenantId,
        role: { not: 'PLATFORM_ADMIN' },
        ...(cfg.companyId === null
          ? { kind: 'INTERNAL' as const }
          : { kind: 'PORTAL' as const, companyId: cfg.companyId }),
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  return rows.map((r) => r.userId);
}
