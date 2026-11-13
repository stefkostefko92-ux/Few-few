import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { lockOrganization, TransferError } from './transfer-core.js';

/**
 * Проверката на собственост, дошла чрез покана от кантора (остатъчният риск в SECURITY.md: кантора може
 * да създаде нова фирма и да покани свой втори имейл). Мастърът вижда тези фирми „за проверка“, докато
 * не ги потвърди, и при спор отнема собствеността — после кани истинския собственик с „Прехвърли“.
 */
export const REVOKE_REASONS = ['disputed', 'mistake', 'other'] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

export class OwnershipError extends Error {
  constructor(readonly code: 'notFound' | 'notCompany' | 'noOwner' | 'invalidReason') {
    super(code);
  }
}

export function isRevokeReason(value: unknown): value is RevokeReason {
  return typeof value === 'string' && (REVOKE_REASONS as readonly string[]).includes(value);
}

/**
 * Отнема собствеността на фирма (само COMPANY със собственик): всички членове губят достъп (дошли са
 * чрез собственика), действащите пълномощни стават чакащи (потвърдил ги е той), отворените покани се
 * отменят, фирмата става непотвърдена. Издадените документи остават — веригата не се пипа.
 */
export async function revokeOwnership(input: {
  organizationId: string;
  actorId: string;
  reason: RevokeReason;
}): Promise<{ removedMembers: number; suspendedMandates: number; revokedInvites: number }> {
  if (!isRevokeReason(input.reason)) throw new OwnershipError('invalidReason');
  const reason = input.reason;
  return prisma.$transaction(async (tx) => {
    try {
      await lockOrganization(tx, input.organizationId);
    } catch (error) {
      if (error instanceof TransferError) throw new OwnershipError('notFound');
      throw error;
    }
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { kind: true, deletedAt: true },
    });
    if (org.deletedAt) throw new OwnershipError('notFound');
    if (org.kind !== 'COMPANY') throw new OwnershipError('notCompany');
    const owners = await tx.membership.count({
      where: { organizationId: input.organizationId, role: 'OWNER' },
    });
    if (owners === 0) throw new OwnershipError('noOwner');

    const removed = await tx.membership.deleteMany({
      where: { organizationId: input.organizationId },
    });
    const suspended = await tx.clientMandate.updateMany({
      where: { clientId: input.organizationId, status: 'ACTIVE' },
      data: { status: 'PENDING' },
    });
    const now = new Date();
    const invites = await tx.transferInvite.updateMany({
      where: { organizationId: input.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.notification.updateMany({
      where: { organizationId: input.organizationId, kind: 'transfer.invite', status: 'PENDING' },
      data: { status: 'FAILED', lastError: 'Собствеността е отнета.' },
    });
    await tx.organization.update({
      where: { id: input.organizationId },
      data: { verifiedAt: null },
    });
    const result = {
      removedMembers: removed.count,
      suspendedMandates: suspended.count,
      revokedInvites: invites.count,
    };
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'organization.ownership.revoked',
      targetType: 'Organization',
      targetId: input.organizationId,
      details: { reason, ...result },
    });
    return result;
  });
}

export interface ReviewItem {
  organizationId: string;
  legalName: string;
  eik: string | null;
  firmName: string;
  acceptedAt: Date;
}

/**
 * Фирмите за проверка: собственикът е приел покана от кантора, а мастърът още не е потвърдил фирмата.
 * Фирма без собственик (отнета собственост) не е в списъка.
 */
export async function ownershipReviewQueue(limit = 50): Promise<ReviewItem[]> {
  const orgs = await prisma.organization.findMany({
    where: {
      kind: 'COMPANY',
      verifiedAt: null,
      deletedAt: null,
      memberships: { some: { role: 'OWNER' } },
      transferInvites: { some: { acceptedAt: { not: null }, mandateId: { not: null } } },
    },
    select: {
      id: true,
      legalName: true,
      eik: true,
      transferInvites: {
        where: { acceptedAt: { not: null }, mandateId: { not: null } },
        orderBy: { acceptedAt: 'desc' },
        take: 1,
        select: {
          acceptedAt: true,
          mandate: { select: { firm: { select: { legalName: true } } } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return orgs.map((org) => {
    const invite = org.transferInvites[0];
    return {
      organizationId: org.id,
      legalName: org.legalName,
      eik: org.eik,
      firmName: invite?.mandate?.firm.legalName ?? '—',
      acceptedAt: invite?.acceptedAt ?? new Date(0),
    };
  });
}
