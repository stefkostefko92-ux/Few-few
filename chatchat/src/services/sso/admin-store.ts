import type { Prisma, SsoConfig } from '@prisma/client';

/**
 * Заявките на управлението на доставчиците в транзакция: домейните (уникални в платформата) и
 * кого засяга смяната на политиката (за `revokeUserSessions`).
 */

type Tx = Prisma.TransactionClient;

/** Заменя домейните на доставчика; домейн на ДРУГ доставчик → код на грешката (нищо не пипа). */
export async function replaceDomains(
  tx: Tx,
  cfg: { id: string; tenantId: string },
  domains: string[],
): Promise<string | null> {
  const taken = await tx.ssoDomain.findFirst({
    where: { domain: { in: domains }, configId: { not: cfg.id } },
    select: { id: true },
  });
  if (taken) return 'sso_domain_taken';
  await tx.ssoDomain.deleteMany({ where: { configId: cfg.id, domain: { notIn: domains } } });
  await tx.ssoDomain.createMany({
    data: domains.map((domain) => ({ tenantId: cfg.tenantId, configId: cfg.id, domain })),
    skipDuplicates: true,
  });
  // Паралелно заявен от друг доставчик домейн се пропуска тихо (ON CONFLICT) — броят го хваща,
  // викащият прекъсва транзакцията.
  const mine = await tx.ssoDomain.count({ where: { configId: cfg.id } });
  return mine === domains.length ? null : 'sso_domain_taken';
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
