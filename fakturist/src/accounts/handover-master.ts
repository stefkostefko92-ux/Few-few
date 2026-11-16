import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken } from '../crypto.js';
import { hashPassword } from '../auth/password.js';
import { consumeTotpCode } from '../auth/step-up.js';
import { isValidEik } from '../einvoice/bg-ids.js';
import { EmailSchema, lockOrganization, TransferError } from './transfer-core.js';
import { issueToken } from './tokens.js';
import { takeOverByFirm } from './handover-firm.js';
import { ensureSubscription, HandoverError, managerEmails } from './handover-core.js';

/**
 * Мастърът предава собствеността ВЕДНАГА (SPEC 87; решение на собственика, 16.11.2026): при спор или
 * изгубен достъп, с 2FA кода (еднократен) и основание (документ за представителство и т.н.) в одита.
 */
export type MasterTarget =
  | { kind: 'person'; email: string; name?: string; keepOldOwner: boolean }
  | { kind: 'firm'; eik: string };

export async function masterHandover(input: {
  organizationId: string;
  actorId: string;
  code: string;
  reason: string;
  target: MasterTarget;
  now?: Date;
}): Promise<{ userId?: string; created?: boolean; firmId?: string }> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 200) throw new HandoverError('reason');
  let email = '';
  if (input.target.kind === 'person') {
    const parsed = EmailSchema.safeParse(input.target.email);
    if (!parsed.success) throw new HandoverError('invalidEmail');
    email = parsed.data;
  } else if (!isValidEik(input.target.eik.trim())) {
    throw new HandoverError('notFound');
  }
  // Хешът е бавен — извън транзакцията; паролата е случайна и никой не я знае.
  const unusable = input.target.kind === 'person' ? await hashPassword(randomToken(32)) : '';
  const target = input.target;
  return prisma.$transaction(async (tx) => {
    try {
      await lockOrganization(tx, input.organizationId);
    } catch (error) {
      if (error instanceof TransferError) throw new HandoverError('notFound');
      throw error;
    }
    const master = await tx.user.findUnique({
      where: { id: input.actorId },
      select: { platformRole: true, disabledAt: true },
    });
    if (master?.platformRole !== 'MASTER' || master.disabledAt) {
      throw new HandoverError('notAllowed');
    }
    if (!(await consumeTotpCode(tx, input.actorId, input.code))) throw new HandoverError('code');
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { kind: true, legalName: true, deletedAt: true, terminatedAt: true },
    });
    if (org.deletedAt) throw new HandoverError('notFound');
    if (org.terminatedAt) throw new HandoverError('terminated');
    const oldOwners = await tx.membership.findMany({
      where: { organizationId: input.organizationId, role: 'OWNER' },
      select: { userId: true, user: { select: { email: true } } },
    });
    const mails: Array<{ email: string; role: string }> = [];
    let result: { userId?: string; created?: boolean; firmId?: string };

    if (target.kind === 'person') {
      let user = await tx.user.findUnique({ where: { email } });
      let created = false;
      if (user?.disabledAt) throw new HandoverError('disabled');
      if (!user) {
        const name = (target.name ?? '').trim() || email.split('@')[0]!;
        user = await tx.user.create({
          data: { email, name: name.slice(0, 100), passwordHash: unusable },
        });
        created = true;
        await issueToken(tx, { userId: user.id, email, purpose: 'PASSWORD_RESET', now });
      }
      for (const owner of oldOwners.filter((o) => o.userId !== user.id)) {
        const where = {
          userId_organizationId: { userId: owner.userId, organizationId: input.organizationId },
        };
        if (target.keepOldOwner) {
          await tx.membership.update({ where, data: { role: 'ADMIN' } });
          mails.push({ email: owner.user.email, role: 'oldOwnerAdmin' });
        } else {
          await tx.membership.delete({ where });
          await tx.apiKey.updateMany({
            where: {
              organizationId: input.organizationId,
              createdById: owner.userId,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          mails.push({ email: owner.user.email, role: 'oldOwnerRemoved' });
        }
      }
      await tx.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: input.organizationId } },
        create: { userId: user.id, organizationId: input.organizationId, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      await ensureSubscription(tx, input.organizationId, now);
      await tx.transferInvite.updateMany({
        where: { organizationId: input.organizationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.firmHandover.updateMany({
        where: { organizationId: input.organizationId, status: 'PENDING' },
        data: { status: 'REVOKED', decidedAt: now },
      });
      await tx.organization.update({
        where: { id: input.organizationId },
        data: { ownerReviewPendingAt: null, ownershipLockedAt: null },
      });
      mails.push({ email, role: 'newOwner' });
      result = { userId: user.id, created };
    } else {
      if (org.kind !== 'COMPANY') throw new HandoverError('notCompany');
      const firm = await tx.organization.findUnique({
        where: { eik: target.eik.trim() },
        select: { id: true, kind: true, deletedAt: true, terminatedAt: true },
      });
      if (!firm) throw new HandoverError('notFound');
      if (firm.kind !== 'ACCOUNTING_FIRM' || firm.deletedAt || firm.terminatedAt) {
        throw new HandoverError('notFirm');
      }
      await tx.clientMandate.upsert({
        where: { firmId_clientId: { firmId: firm.id, clientId: input.organizationId } },
        create: {
          firmId: firm.id,
          clientId: input.organizationId,
          status: 'ACTIVE',
          documentRef: reason,
          validFrom: now,
          createdById: input.actorId,
        },
        update: { status: 'ACTIVE', revokedAt: null },
      });
      for (const owner of oldOwners)
        mails.push({ email: owner.user.email, role: 'oldOwnerRemoved' });
      await takeOverByFirm(tx, { organizationId: input.organizationId, firmId: firm.id, now });
      for (const to of await managerEmails(tx, firm.id)) mails.push({ email: to, role: 'firm' });
      result = { firmId: firm.id };
    }

    for (const mail of mails) {
      await tx.notification.create({
        data: {
          organizationId: input.organizationId,
          kind: 'handover.master',
          toEmail: mail.email,
          payload: { legalName: org.legalName, role: mail.role },
        },
      });
    }
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'organization.handover.master',
      targetType: 'Organization',
      targetId: input.organizationId,
      details: {
        to: target.kind,
        ...(target.kind === 'person'
          ? {
              userId: result.userId ?? null,
              keepOldOwner: target.keepOldOwner,
              created: result.created ?? false,
            }
          : { firmId: result.firmId ?? null }),
        reason,
      },
    });
    return result;
  });
}
