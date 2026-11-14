import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { lockOrganization, TransferError } from './transfer-core.js';
import { revokeOpenMemberInvites } from './member-invite-revoke.js';

/**
 * Проверката на собственост, дошла чрез покана от кантора (остатъчният риск в SECURITY.md: кантора може
 * да създаде нова фирма и да покани свой втори имейл). Приемането слага `ownerReviewPendingAt`: фирмата
 * е на таблото „за проверка“, докато мастърът не потвърди собственика. При спор — отнемане: фирмата се
 * заключва (`ownershipLockedAt`) и кантората не може да кани, докато собственик, поканен от мастъра, не
 * приеме.
 */
export const REVOKE_REASONS = ['disputed', 'mistake', 'other'] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

export class OwnershipError extends Error {
  constructor(
    readonly code: 'notFound' | 'notCompany' | 'noOwner' | 'invalidReason' | 'nothingToConfirm',
  ) {
    super(code);
  }
}

export function isRevokeReason(value: unknown): value is RevokeReason {
  return typeof value === 'string' && (REVOKE_REASONS as readonly string[]).includes(value);
}

async function lockOrThrow(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  organizationId: string,
): Promise<void> {
  try {
    await lockOrganization(tx, organizationId);
  } catch (error) {
    if (error instanceof TransferError) throw new OwnershipError('notFound');
    throw error;
  }
}

/**
 * Отнема собствеността на фирма (само COMPANY със собственик): всички членове губят достъп (дошли са
 * чрез собственика), действащите пълномощни стават чакащи (потвърдил ги е той), отворените покани се
 * отменят, изгледът на PDF (логото му) се нулира, фирмата става непотвърдена и заключена за покани от
 * кантора. Издадените документи остават — веригата не се пипа.
 */
export async function revokeOwnership(input: {
  organizationId: string;
  actorId: string;
  reason: RevokeReason;
}): Promise<{
  removedMembers: number;
  suspendedMandates: number;
  revokedInvites: number;
  revokedMemberInvites: number;
  revokedApiKeys: number;
  pdfStyleReset: number;
}> {
  if (!isRevokeReason(input.reason)) throw new OwnershipError('invalidReason');
  const reason = input.reason;
  return prisma.$transaction(async (tx) => {
    await lockOrThrow(tx, input.organizationId);
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
    // И поканите за член: иначе подставеният собственик кани свой имейл и се връща след отнемането.
    const memberInvites = await revokeOpenMemberInvites(
      tx,
      { organizationId: input.organizationId },
      'Собствеността е отнета.',
    );
    // Ключовете за API на махнатите — оттеглени, не само спрени (иначе оживяват при ново членство).
    const apiKeys = await tx.apiKey.updateMany({
      where: { organizationId: input.organizationId, revokedAt: null },
      data: { revokedAt: now },
    });
    const styles = await tx.pdfStyle.deleteMany({
      where: { organizationId: input.organizationId },
    });
    await tx.organization.update({
      where: { id: input.organizationId },
      data: { verifiedAt: null, ownerReviewPendingAt: null, ownershipLockedAt: now },
    });
    const result = {
      removedMembers: removed.count,
      suspendedMandates: suspended.count,
      revokedInvites: invites.count,
      revokedMemberInvites: memberInvites,
      revokedApiKeys: apiKeys.count,
      pdfStyleReset: styles.count,
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

/**
 * „Потвърди фирмата“ / „Собственикът е проверен“: фирмата става потвърдена и излиза от „за проверка“.
 * Нищо за потвърждаване (вече потвърдена и не чака проверка) — отказ.
 */
export async function confirmOwnerReview(input: {
  organizationId: string;
  actorId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrThrow(tx, input.organizationId);
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { verifiedAt: true, ownerReviewPendingAt: true },
    });
    if (org.verifiedAt && !org.ownerReviewPendingAt) throw new OwnershipError('nothingToConfirm');
    await tx.organization.update({
      where: { id: input.organizationId },
      data: { verifiedAt: org.verifiedAt ?? new Date(), ownerReviewPendingAt: null },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'organization.verified',
      targetType: 'Organization',
      targetId: input.organizationId,
      details: { ownerReviewed: org.ownerReviewPendingAt !== null },
    });
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
 * Фирмите за проверка (`ownerReviewPendingAt`) — най-старите първо, за да не се изгубят под нови. Броят
 * е целият; списъкът — до `limit`.
 */
export async function ownershipReviewQueue(
  limit = 100,
): Promise<{ items: ReviewItem[]; total: number }> {
  const where = {
    kind: 'COMPANY' as const,
    deletedAt: null,
    ownerReviewPendingAt: { not: null },
  };
  const [orgs, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      select: {
        id: true,
        legalName: true,
        eik: true,
        ownerReviewPendingAt: true,
        transferInvites: {
          where: { acceptedAt: { not: null }, mandateId: { not: null } },
          orderBy: { acceptedAt: 'desc' },
          take: 1,
          select: { mandate: { select: { firm: { select: { legalName: true } } } } },
        },
      },
      orderBy: { ownerReviewPendingAt: 'asc' },
      take: limit,
    }),
    prisma.organization.count({ where }),
  ]);
  return {
    total,
    items: orgs.map((org) => ({
      organizationId: org.id,
      legalName: org.legalName,
      eik: org.eik,
      firmName: org.transferInvites[0]?.mandate?.firm.legalName ?? '—',
      acceptedAt: org.ownerReviewPendingAt ?? new Date(0),
    })),
  };
}
