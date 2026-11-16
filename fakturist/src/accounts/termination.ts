import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { setting } from '../admin/settings.js';
import { verifyPassword } from '../auth/password.js';
import { consumeTotpCode } from '../auth/step-up.js';
import { DAY } from '../time.js';
import { errorMessage, logger } from '../logger.js';
import { lockOrganization } from './transfer-core.js';
import { revokeOpenMemberInvites } from './member-invite-revoke.js';
import { accessPoint } from '../peppol/settings.js';
import { disableOrganization, participantFor } from '../peppol/participants.js';

/**
 * Прекратяване на фирма (SPEC 65–66; общите условия т. 11, договорът за обработване т. 11). Заявката
 * спира всеки запис във фирмата и започва 30-дневния срок за изтегляне; изтриването е в
 * termination-purge.ts. До `purgeAfter` собственикът или мастърът отменя.
 */
export const TERMINATION_GRACE_MS = 30 * DAY;

export class TerminationError extends Error {
  constructor(
    readonly code:
      | 'notFound'
      | 'notOwner'
      | 'password'
      | 'code'
      | 'already'
      | 'notTerminated'
      | 'expired'
      | 'supplier'
      | 'ownerlessClients',
  ) {
    super(code);
  }
}

/** Собственик (пряк член, паролата) или мастър (кодът от приложението за 2FA). */
export type TerminationActor = { userId: string; master: boolean };

type Confirmation = {
  organizationId: string;
  actor: TerminationActor;
  password?: string;
  code?: string;
};

/** Паролата се проверява преди транзакцията (Argon2 е бавен); кодът — в нея (записва стъпката). */
async function checkOwner(input: Confirmation): Promise<void> {
  if (input.actor.master) return;
  const [user, member] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.actor.userId },
      select: { passwordHash: true, disabledAt: true },
    }),
    prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: input.actor.userId, organizationId: input.organizationId },
      },
      select: { role: true },
    }),
  ]);
  if (!user || user.disabledAt || member?.role !== 'OWNER') throw new TerminationError('notOwner');
  if (!(await verifyPassword(input.password ?? '', user.passwordHash))) {
    throw new TerminationError('password');
  }
}

async function confirmInTx(tx: Prisma.TransactionClient, input: Confirmation): Promise<void> {
  if (input.actor.master) {
    const master = await tx.user.findUnique({
      where: { id: input.actor.userId },
      select: { platformRole: true },
    });
    if (master?.platformRole !== 'MASTER') throw new TerminationError('notOwner');
    if (!(await consumeTotpCode(tx, input.actor.userId, input.code ?? ''))) {
      throw new TerminationError('code');
    }
    return;
  }
  // Собствеността може да е отнета между проверката на паролата и заключването.
  const member = await tx.membership.findUnique({
    where: {
      userId_organizationId: { userId: input.actor.userId, organizationId: input.organizationId },
    },
    select: { role: true },
  });
  if (member?.role !== 'OWNER') throw new TerminationError('notOwner');
}

async function lockOrg(tx: Prisma.TransactionClient, organizationId: string) {
  try {
    await lockOrganization(tx, organizationId);
  } catch {
    throw new TerminationError('notFound');
  }
  return tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      id: true,
      kind: true,
      legalName: true,
      terminatedAt: true,
      purgeAfter: true,
      deletedAt: true,
    },
  });
}

/** До кого отива писмото за прекратяването: собствениците и администраторите на фирмата. */
async function queueOrgMail(
  tx: Prisma.TransactionClient,
  organizationId: string,
  kind: 'org.terminated' | 'org.termination.cancelled',
  payload: Prisma.InputJsonObject,
): Promise<void> {
  const members = await tx.membership.findMany({
    where: { organizationId, role: { in: ['OWNER', 'ADMIN'] }, user: { disabledAt: null } },
    select: { user: { select: { email: true } } },
  });
  if (members.length === 0) return;
  await tx.notification.createMany({
    data: members.map((m) => ({ kind, toEmail: m.user.email, organizationId, payload })),
  });
}

export async function requestTermination(
  input: Confirmation & { now?: Date },
): Promise<{ purgeAfter: Date }> {
  await checkOwner(input);
  const now = input.now ?? new Date();
  const purgeAfter = new Date(now.getTime() + TERMINATION_GRACE_MS);
  const supplier = await setting('billing.supplierOrgId');
  await prisma.$transaction(async (tx) => {
    const org = await lockOrg(tx, input.organizationId);
    if (org.deletedAt) throw new TerminationError('notFound');
    if (org.terminatedAt) throw new TerminationError('already');
    // Фирмата, която издава фактурите за плановете — нашето счетоводство, не се прекратява оттук.
    if (org.id === supplier) throw new TerminationError('supplier');
    if (org.kind === 'ACCOUNTING_FIRM') {
      // Фирма, създадена от кантората и още без собственик, би останала без никой, който да я
      // изтегли или прекрати: първо собственикът ѝ (покана) или мастърът.
      const ownerless = await tx.organization.count({
        where: {
          createdByFirmId: org.id,
          deletedAt: null,
          terminatedAt: null,
          memberships: { none: { role: 'OWNER' } },
        },
      });
      if (ownerless > 0) throw new TerminationError('ownerlessClients');
    }
    await confirmInTx(tx, input);
    await tx.organization.update({
      where: { id: org.id },
      data: { terminatedAt: now, purgeAfter },
    });
    await revokeOpenMemberInvites(tx, { organizationId: org.id }, 'terminated');
    await tx.transferInvite.updateMany({
      where: { organizationId: org.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.apiKey.updateMany({
      where: { organizationId: org.id, revokedAt: null },
      data: { revokedAt: now },
    });
    // И шаблоните на клиентите, които кантората издава по пълномощно.
    await tx.recurringInvoice.updateMany({
      where: { OR: [{ organizationId: org.id }, { viaFirmId: org.id }], status: 'ACTIVE' },
      data: { status: 'PAUSED', lastError: 'Фирмата е прекратена.' },
    });
    await queueOrgMail(tx, org.id, 'org.terminated', {
      legalName: org.legalName,
      purgeAfter: purgeAfter.toISOString(),
    });
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: org.id,
      action: 'org.terminated',
      targetType: 'Organization',
      targetId: org.id,
      details: {
        by: input.actor.master ? 'master' : 'owner',
        purgeAfter: purgeAfter.toISOString(),
      },
    });
  });
  await leavePeppol(input.organizationId, input.actor.userId);
  return { purgeAfter };
}

/**
 * Изключване от Peppol при доставчика (общите условия т. 11). Извън транзакцията — мрежа; неуспехът
 * само се записва: работникът не праща за прекратена фирма, а изтриването маха регистрацията.
 */
async function leavePeppol(organizationId: string, actorId: string): Promise<void> {
  try {
    const participant = await participantFor(organizationId);
    if (!participant || participant.status === 'REMOVED') return;
    await disableOrganization(
      { organizationId, role: 'OWNER', viaFirmId: null, mandateId: null },
      actorId,
      await accessPoint(),
    );
  } catch (error) {
    logger.warn({ err: errorMessage(error), organizationId }, 'изключването от Peppol не мина');
  }
}

export async function cancelTermination(input: Confirmation & { now?: Date }): Promise<void> {
  await checkOwner(input);
  const now = input.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    const org = await lockOrg(tx, input.organizationId);
    if (org.deletedAt) throw new TerminationError('notFound');
    if (!org.terminatedAt) throw new TerminationError('notTerminated');
    if (org.purgeAfter && org.purgeAfter.getTime() <= now.getTime()) {
      throw new TerminationError('expired');
    }
    await confirmInTx(tx, input);
    await tx.organization.update({
      where: { id: org.id },
      data: { terminatedAt: null, purgeAfter: null },
    });
    await queueOrgMail(tx, org.id, 'org.termination.cancelled', { legalName: org.legalName });
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: org.id,
      action: 'org.termination.cancelled',
      targetType: 'Organization',
      targetId: org.id,
      details: { by: input.actor.master ? 'master' : 'owner' },
    });
  });
}

/** Състоянието за изгледите и пазачите: прекратена (само четене) или изтрита. */
export type TerminationState = {
  terminatedAt: Date | null;
  purgeAfter: Date | null;
  deletedAt: Date | null;
};

export function isReadOnly(org: TerminationState): boolean {
  return org.terminatedAt !== null || org.deletedAt !== null;
}
