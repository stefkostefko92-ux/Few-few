import { prisma } from '../db.js';
import { lockOrganization } from './transfer-core.js';
import { audit } from '../audit.js';
import { randomToken } from '../crypto.js';
import { hashPassword, verifyPassword } from '../auth/password.js';

/**
 * Правата на човека по ОРЗД от самия профил (SPEC 48; политиката — „Вашите права“): износ на личните му
 * данни (чл. 15 и 20) и закриване на профила (чл. 17). Документите на фирмите не са негови — остават при
 * фирмата (законът задължава нея да ги пази); профилът се псевдонимизира, не се трие, за да не се скъсат
 * одитът и веригата (кой е издал документа остава като „Закрит профил“).
 */
export class CloseError extends Error {
  constructor(readonly code: 'password' | 'master' | 'transferFirst') {
    super(code);
  }
}

/** Личните данни на профила като JSON (без хешове, тайни и токени). */
export async function personalData(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      locale: true,
      createdAt: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      totpEnabledAt: true,
      memberships: {
        select: {
          role: true,
          createdAt: true,
          organization: { select: { legalName: true, eik: true } },
        },
      },
      legalAcceptances: { select: { document: true, version: true, acceptedAt: true } },
    },
  });
  const [sessions, actions, apiKeys, invitesSent, invitesReceived] = await Promise.all([
    prisma.session.findMany({
      where: { userId },
      select: { createdAt: true, lastSeenAt: true, expiresAt: true },
    }),
    prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { at: 'asc' },
      select: { at: true, action: true, targetType: true },
    }),
    // Ключовете за API, които човекът е създал — без отпечатъка на ключа.
    prisma.apiKey.findMany({
      where: { createdById: userId },
      select: {
        name: true,
        prefix: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        organization: { select: { legalName: true } },
      },
    }),
    prisma.memberInvite.findMany({
      where: { createdById: userId },
      select: { email: true, role: true, createdAt: true, acceptedAt: true, revokedAt: true },
    }),
    prisma.memberInvite.findMany({
      where: { email: user.email },
      select: {
        role: true,
        createdAt: true,
        acceptedAt: true,
        revokedAt: true,
        organization: { select: { legalName: true } },
      },
    }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      email: user.email,
      name: user.name,
      locale: user.locale,
      createdAt: user.createdAt,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      twoFactorEnabled: user.totpEnabledAt !== null,
    },
    memberships: user.memberships,
    acceptedLegalDocuments: user.legalAcceptances,
    sessions,
    apiKeys,
    invitationsSent: invitesSent,
    invitationsReceived: invitesReceived,
    auditTrail: actions,
  };
}

/**
 * Закриване: паролата потвърждава. Единствен собственик на фирма с други членове първо урежда фирмата
 * (махане на членовете или прехвърляне) — иначе те остават без собственик. Мастър акаунт не се закрива
 * оттук.
 */
export async function closeAccount(input: { userId: string; password: string }): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    include: { memberships: { where: { role: 'OWNER' }, select: { organizationId: true } } },
  });
  if (user.platformRole !== 'NONE') throw new CloseError('master');
  if (!(await verifyPassword(input.password, user.passwordHash))) throw new CloseError('password');
  const unusable = await hashPassword(randomToken(32));
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Проверката е под заключването на всяка своя фирма (същото, което взема приемането на покана):
    // покана, приета междувременно, иначе би оставила фирма с членове и без собственик.
    for (const owned of user.memberships) {
      await lockOrganization(tx, owned.organizationId);
      const [owners, others] = await Promise.all([
        tx.membership.count({ where: { organizationId: owned.organizationId, role: 'OWNER' } }),
        tx.membership.count({
          where: { organizationId: owned.organizationId, userId: { not: user.id } },
        }),
      ]);
      if (owners === 1 && others > 0) throw new CloseError('transferFirst');
    }
    await tx.membership.deleteMany({ where: { userId: user.id } });
    await tx.apiKey.updateMany({
      where: { createdById: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.userToken.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { toEmail: user.email, status: 'PENDING' } });
    await tx.memberInvite.updateMany({
      where: { email: user.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: `closed+${user.id}@fakturist.invalid`,
        name: 'Закрит профил',
        passwordHash: unusable,
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: null,
        emailVerifiedAt: null,
        disabledAt: now,
        failedLogins: 0,
        lockouts: 0,
        lockedUntil: null,
      },
    });
    await audit(tx, {
      actorId: user.id,
      action: 'account.closed',
      targetType: 'User',
      targetId: user.id,
      details: { organizations: user.memberships.length },
    });
  });
}
