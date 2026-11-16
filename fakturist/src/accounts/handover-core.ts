import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { verifyPassword } from '../auth/password.js';
import { consumeTotpCode } from '../auth/step-up.js';
import { lockOrganization, TransferError } from './transfer-core.js';

/**
 * Общото на предаването на собственост (SPEC 84–88): грешките, потвърждението на собственика (паролата
 * преди транзакцията — Argon2 е бавен; 2FA кодът в нея — стъпката се записва) и проверката на фирмата
 * под заключването ѝ.
 */
export type HandoverErrorCode =
  | 'notFound'
  | 'notOwner'
  | 'password'
  | 'code'
  | 'reviewPending'
  | 'locked'
  | 'terminated'
  | 'sameUser'
  | 'invalidEmail'
  | 'noMandate'
  | 'notCompany'
  | 'notAllowed'
  | 'invalid'
  | 'expired'
  | 'reason'
  | 'notFirm'
  | 'disabled';

export class HandoverError extends Error {
  constructor(readonly code: HandoverErrorCode) {
    super(code);
  }
}

export type Tx = Prisma.TransactionClient;

export interface OwnerConfirmation {
  organizationId: string;
  actorId: string;
  password: string;
  code?: string;
}

/** Пряк собственик + вярна парола (преди транзакцията). Връща имейла и името му. */
export async function checkOwnerPassword(
  input: OwnerConfirmation,
): Promise<{ email: string; name: string }> {
  const [user, member] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.actorId },
      select: { email: true, name: true, passwordHash: true, disabledAt: true },
    }),
    prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: input.actorId, organizationId: input.organizationId },
      },
      select: { role: true },
    }),
  ]);
  if (!user || user.disabledAt || member?.role !== 'OWNER') throw new HandoverError('notOwner');
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new HandoverError('password');
  }
  return { email: user.email, name: user.name };
}

/**
 * Под заключването на фирмата: тя съществува, не е прекратена, не е заключена след отнемане, собственикът
 * не е „за проверка“ и още е собственик; с включен 2FA — кодът (еднократен).
 */
export async function lockOwnedOrganization(
  tx: Tx,
  input: OwnerConfirmation,
): Promise<{ kind: 'COMPANY' | 'ACCOUNTING_FIRM'; legalName: string }> {
  try {
    await lockOrganization(tx, input.organizationId);
  } catch (error) {
    if (error instanceof TransferError) throw new HandoverError('notFound');
    throw error;
  }
  const org = await tx.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: {
      kind: true,
      legalName: true,
      deletedAt: true,
      terminatedAt: true,
      ownershipLockedAt: true,
      ownerReviewPendingAt: true,
    },
  });
  if (org.deletedAt) throw new HandoverError('notFound');
  if (org.terminatedAt) throw new HandoverError('terminated');
  if (org.ownershipLockedAt) throw new HandoverError('locked');
  if (org.ownerReviewPendingAt) throw new HandoverError('reviewPending');
  const member = await tx.membership.findUnique({
    where: {
      userId_organizationId: { userId: input.actorId, organizationId: input.organizationId },
    },
    select: { role: true },
  });
  if (member?.role !== 'OWNER') throw new HandoverError('notOwner');
  const user = await tx.user.findUniqueOrThrow({
    where: { id: input.actorId },
    select: { totpEnabledAt: true },
  });
  if (user.totpEnabledAt && !(await consumeTotpCode(tx, input.actorId, input.code ?? ''))) {
    throw new HandoverError('code');
  }
  return { kind: org.kind, legalName: org.legalName };
}

/** Отменя всички отворени предавания на фирмата (покана към човек и предложение към кантора). */
export async function revokeOpenHandovers(
  tx: Tx,
  organizationId: string,
  now: Date,
): Promise<number> {
  const invites = await tx.transferInvite.updateMany({
    where: { organizationId, fromUserId: { not: null }, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  if (invites.count > 0) {
    await tx.notification.updateMany({
      where: { organizationId, kind: 'transfer.invite', status: 'PENDING' },
      data: { status: 'FAILED', lastError: 'Предаването е отменено.' },
    });
  }
  const firms = await tx.firmHandover.updateMany({
    where: { organizationId, status: 'PENDING' },
    data: { status: 'REVOKED', decidedAt: now },
  });
  return invites.count + firms.count;
}

/** Фирмата, предадена на човек от мастъра, без действащ абонамент — получава безплатния. */
export async function ensureSubscription(tx: Tx, organizationId: string, now: Date) {
  const active = await tx.subscription.findFirst({
    where: { organizationId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (active) return;
  const periodEnd = new Date(now);
  periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 100);
  await tx.subscription.create({
    data: {
      organizationId,
      planCode: 'free',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });
}

/** Имейлите на собствениците и администраторите на организация (писмата за предаването). */
export async function managerEmails(tx: Tx, organizationId: string): Promise<string[]> {
  const rows = await tx.membership.findMany({
    where: { organizationId, role: { in: ['OWNER', 'ADMIN'] }, user: { disabledAt: null } },
    select: { user: { select: { email: true } } },
  });
  return rows.map((r) => r.user.email);
}
