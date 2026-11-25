import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { canAssign, type MemberRole } from '../auth/roles.js';
import { lockOrganization } from './transfer-core.js';
import { MemberError, type Actor } from './member-core.js';

/** Отмяна на покани за член: една (от списъка на членовете) или всички отворени по условие. */
export async function revokeMemberInvite(input: {
  organizationId: string;
  inviteId: string;
  actor: Actor;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Под заключването на фирмата — същото, което взема приемането: отмяна и приемане не се разминават.
    await lockOrganization(tx, input.organizationId);
    const invite = await tx.memberInvite.findFirst({
      where: { id: input.inviteId, organizationId: input.organizationId },
    });
    if (!invite || invite.acceptedAt || invite.revokedAt) throw new MemberError('notFound');
    if (!canAssign(input.actor.role, invite.role as MemberRole)) {
      throw new MemberError('forbiddenRole');
    }
    const revoked = await tx.memberInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new MemberError('notFound');
    await tx.notification.updateMany({
      where: {
        kind: 'member.invite',
        status: 'PENDING',
        payload: { path: ['inviteId'], equals: invite.id },
      },
      data: { status: 'FAILED', lastError: 'Поканата е отменена.' },
    });
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: input.organizationId,
      action: 'member.invite.revoked',
      targetType: 'MemberInvite',
      targetId: invite.id,
    });
  });
}

/**
 * Отменя отворените покани за член (и чакащите им писма) по условие — при отнемане на собствеността (всички
 * на фирмата) и при махане на член (неговите). Иначе отстраненият се връща през покана, пратена преди това.
 */
export async function revokeOpenMemberInvites(
  tx: Prisma.TransactionClient,
  where: { organizationId: string; createdById?: string },
  reason: string,
): Promise<number> {
  const open = await tx.memberInvite.findMany({
    where: { ...where, acceptedAt: null, revokedAt: null },
    select: { id: true },
  });
  if (open.length === 0) return 0;
  const ids = open.map((invite) => invite.id);
  await tx.memberInvite.updateMany({
    where: { id: { in: ids }, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  for (const id of ids) {
    await tx.notification.updateMany({
      where: {
        kind: 'member.invite',
        status: 'PENDING',
        payload: { path: ['inviteId'], equals: id },
      },
      data: { status: 'FAILED', lastError: reason },
    });
  }
  return ids.length;
}
