import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { INVITE_TTL_MS, lockOrganization, TransferError } from './transfer-core.js';
import { revokeOpenMemberInvites } from './member-invite-revoke.js';
import { LEGAL_DOCUMENTS } from '../legal/documents.js';
import {
  checkOwnerPassword,
  HandoverError,
  lockOwnedOrganization,
  managerEmails,
  revokeOpenHandovers,
  type OwnerConfirmation,
  type Tx,
} from './handover-core.js';

/**
 * Фирмата се предава на кантора (SPEC 86): само кантора с ДЕЙСТВАЩО пълномощно — собственикът вече я е
 * потвърдил като обработващ; грешно въведен ЕИК не може да даде фирмата на чужд. Кантората приема или
 * отказва; до решението нищо не се сменя.
 */
export async function startFirmHandover(
  input: OwnerConfirmation & { firmId: string; now?: Date },
): Promise<{ id: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  await checkOwnerPassword(input);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  return prisma.$transaction(async (tx) => {
    const org = await lockOwnedOrganization(tx, input);
    if (org.kind !== 'COMPANY') throw new HandoverError('notCompany');
    const mandate = await tx.clientMandate.findUnique({
      where: { firmId_clientId: { firmId: input.firmId, clientId: input.organizationId } },
      select: {
        status: true,
        firm: { select: { kind: true, legalName: true, deletedAt: true, terminatedAt: true } },
      },
    });
    if (
      mandate?.status !== 'ACTIVE' ||
      mandate.firm.kind !== 'ACCOUNTING_FIRM' ||
      mandate.firm.deletedAt ||
      mandate.firm.terminatedAt
    ) {
      throw new HandoverError('noMandate');
    }
    await revokeOpenHandovers(tx, input.organizationId, now);
    const proposal = await tx.firmHandover.create({
      data: {
        organizationId: input.organizationId,
        firmId: input.firmId,
        fromUserId: input.actorId,
        createdAt: now,
        expiresAt,
      },
    });
    for (const email of await managerEmails(tx, input.firmId)) {
      await tx.notification.create({
        data: {
          organizationId: input.firmId,
          kind: 'handover.firmProposal',
          toEmail: email,
          // Идентификаторът, не името: името се чете при изпращането (закрит профил не остава в опашката).
          payload: {
            legalName: org.legalName,
            fromUserId: input.actorId,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
    }
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'organization.handover.created',
      targetType: 'FirmHandover',
      targetId: proposal.id,
      details: { to: 'firm', firmId: input.firmId },
    });
    return { id: proposal.id, expiresAt };
  });
}

/**
 * Кантората поема фирмата (приемане на предложението или решение на мастъра): всички членства на
 * фирмата отпадат (дошли са чрез собственика), API ключовете се оттеглят, поканите и другите
 * предавания се отменят; кантората става „създала“ фирмата — може да покани нов собственик.
 */
export async function takeOverByFirm(
  tx: Tx,
  input: { organizationId: string; firmId: string; now: Date },
): Promise<{ removed: Array<{ userId: string; email: string; role: string }> }> {
  // Кой излиза — за писмата (DSA чл. 17, т. 10 ОУ: всеки засегнат научава какво е станало).
  const members = await tx.membership.findMany({
    where: { organizationId: input.organizationId, user: { disabledAt: null } },
    select: { userId: true, role: true, user: { select: { email: true } } },
  });
  await tx.membership.deleteMany({ where: { organizationId: input.organizationId } });
  await tx.apiKey.updateMany({
    where: { organizationId: input.organizationId, revokedAt: null },
    data: { revokedAt: input.now },
  });
  await revokeOpenMemberInvites(tx, { organizationId: input.organizationId }, 'handover');
  await revokeOpenHandovers(tx, input.organizationId, input.now);
  await tx.transferInvite.updateMany({
    where: { organizationId: input.organizationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: input.now },
  });
  await tx.organization.update({
    where: { id: input.organizationId },
    data: { createdByFirmId: input.firmId, ownerReviewPendingAt: null, ownershipLockedAt: null },
  });
  return { removed: members.map((m) => ({ userId: m.userId, email: m.user.email, role: m.role })) };
}

/**
 * Декларацията на кантората по т. 1а от договора за обработване при поемане (ОРЗД чл. 28(2), (4)) — като
 * при добавяне на клиент: записана за фирмата-клиент от името на приелия.
 */
export async function recordFirmDeclaration(
  tx: Tx,
  input: { userId: string; organizationId: string; now: Date },
): Promise<void> {
  await tx.legalAcceptance.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      document: 'dpa',
      version: LEGAL_DOCUMENTS.dpa.version,
      acceptedAt: input.now,
    },
  });
}

/** Писмото до излезлите членове (без предаващия — той получава своето). */
export async function mailRemovedMembers(
  tx: Tx,
  input: {
    organizationId: string;
    legalName: string;
    firmName: string;
    removed: Array<{ userId: string; email: string }>;
    except: string | null;
    reason: string | null;
  },
): Promise<void> {
  for (const member of input.removed.filter((m) => m.userId !== input.except)) {
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        kind: 'handover.memberRemoved',
        toEmail: member.email,
        payload: { legalName: input.legalName, firmName: input.firmName, reason: input.reason },
      },
    });
  }
}

/**
 * Решението на кантората — собственикът или администраторът ѝ (пряк член). Заключване кантора → фирма
 * (като поканата на собственик от кантора). При приемане пълномощното трябва още да е действащо и
 * предаващият — още собственик.
 */
export async function decideFirmHandover(input: {
  handoverId: string;
  firmId: string;
  actorId: string;
  accept: boolean;
  /** Декларацията по т. 1а от договора за обработване — задължителна при приемане. */
  declaration?: boolean;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.$transaction(async (tx) => {
    try {
      await lockOrganization(tx, input.firmId);
    } catch (error) {
      if (error instanceof TransferError) throw new HandoverError('notFound');
      throw error;
    }
    const proposal = await tx.firmHandover.findUnique({
      where: { id: input.handoverId },
      include: {
        organization: { select: { legalName: true, deletedAt: true, terminatedAt: true } },
        firm: { select: { legalName: true } },
        fromUser: { select: { email: true } },
      },
    });
    if (!proposal || proposal.firmId !== input.firmId) throw new HandoverError('notFound');
    const member = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: input.actorId, organizationId: input.firmId } },
      select: { role: true },
    });
    if (member?.role !== 'OWNER' && member?.role !== 'ADMIN') {
      throw new HandoverError('notAllowed');
    }
    if (proposal.status !== 'PENDING') throw new HandoverError('invalid');
    if (proposal.expiresAt.getTime() <= now.getTime()) throw new HandoverError('expired');
    await lockOrganization(tx, proposal.organizationId);
    const claim = (status: 'ACCEPTED' | 'DECLINED') =>
      tx.firmHandover.updateMany({
        where: { id: proposal.id, status: 'PENDING' },
        data: { status, decidedAt: now, decidedById: input.actorId },
      });
    const mailOwner = async (kind: 'handover.firmAccepted' | 'handover.firmDeclined') => {
      if (!proposal.fromUser) return;
      await tx.notification.create({
        data: {
          organizationId: proposal.organizationId,
          kind,
          toEmail: proposal.fromUser.email,
          payload: {
            legalName: proposal.organization.legalName,
            firmName: proposal.firm.legalName,
          },
        },
      });
    };
    if (!input.accept) {
      if ((await claim('DECLINED')).count !== 1) throw new HandoverError('invalid');
      await mailOwner('handover.firmDeclined');
      await audit(tx, {
        actorId: input.actorId,
        organizationId: proposal.organizationId,
        action: 'organization.handover.declined',
        targetType: 'FirmHandover',
        targetId: proposal.id,
      });
      return;
    }
    if (input.declaration !== true) throw new HandoverError('declaration');
    if (proposal.organization.deletedAt || proposal.organization.terminatedAt) {
      throw new HandoverError('invalid');
    }
    const mandate = await tx.clientMandate.findUnique({
      where: { firmId_clientId: { firmId: input.firmId, clientId: proposal.organizationId } },
      select: { status: true },
    });
    if (mandate?.status !== 'ACTIVE') throw new HandoverError('noMandate');
    const owner = proposal.fromUserId
      ? await tx.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: proposal.fromUserId,
              organizationId: proposal.organizationId,
            },
          },
          select: { role: true },
        })
      : null;
    if (owner?.role !== 'OWNER') throw new HandoverError('invalid');
    if ((await claim('ACCEPTED')).count !== 1) throw new HandoverError('invalid');
    const result = await takeOverByFirm(tx, {
      organizationId: proposal.organizationId,
      firmId: input.firmId,
      now,
    });
    await recordFirmDeclaration(tx, {
      userId: input.actorId,
      organizationId: proposal.organizationId,
      now,
    });
    await mailOwner('handover.firmAccepted');
    await mailRemovedMembers(tx, {
      organizationId: proposal.organizationId,
      legalName: proposal.organization.legalName,
      firmName: proposal.firm.legalName,
      removed: result.removed,
      except: proposal.fromUserId,
      reason: null,
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: proposal.organizationId,
      action: 'organization.handover.firmAccepted',
      targetType: 'FirmHandover',
      targetId: proposal.id,
      details: { firmId: input.firmId, removedMembers: result.removed.length },
    });
  });
}

/** За началната страница на кантората: чакащите предложения (неизтекли). */
export async function pendingFirmHandovers(firmId: string, now: Date = new Date()) {
  return prisma.firmHandover.findMany({
    where: { firmId, status: 'PENDING', expiresAt: { gt: now } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      expiresAt: true,
      organization: { select: { id: true, legalName: true, eik: true } },
      fromUser: { select: { name: true } },
    },
  });
}
