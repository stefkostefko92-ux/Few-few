import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { canAssign, type MemberRole } from '../auth/roles.js';
import { lockOrganization } from './transfer-core.js';
import { MemberError, type Actor } from './member-core.js';
import { revokeOpenMemberInvites } from './member-invite-revoke.js';

/** Смяна на роля и махане на член (SPEC 45) — под своята роля; собственикът не се маха оттук. */
export async function changeMemberRole(input: {
  organizationId: string;
  membershipId: string;
  actor: Actor;
  role: MemberRole;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const member = await tx.membership.findFirst({
      where: { id: input.membershipId, organizationId: input.organizationId },
    });
    if (!member) throw new MemberError('notFound');
    if (member.userId === input.actor.userId) throw new MemberError('self');
    if (
      !canAssign(input.actor.role, member.role as MemberRole) ||
      !canAssign(input.actor.role, input.role)
    ) {
      throw new MemberError('forbiddenRole');
    }
    await tx.membership.update({ where: { id: member.id }, data: { role: input.role } });
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: input.organizationId,
      action: 'member.role.changed',
      targetType: 'Membership',
      targetId: member.id,
      details: { from: member.role, to: input.role },
    });
  });
}

/** Махане на член (под своята роля) или напускане (всеки освен собственика). */
export async function removeMember(input: {
  organizationId: string;
  membershipId: string;
  actor: Actor;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const member = await tx.membership.findFirst({
      where: { id: input.membershipId, organizationId: input.organizationId },
    });
    if (!member) throw new MemberError('notFound');
    const leaving = member.userId === input.actor.userId;
    if (
      leaving ? member.role === 'OWNER' : !canAssign(input.actor.role, member.role as MemberRole)
    ) {
      throw new MemberError('forbiddenRole');
    }
    await tx.membership.delete({ where: { id: member.id } });
    // Ключовете за API, създадени от него, спират заедно с членството (SPEC 53).
    await tx.apiKey.updateMany({
      where: { organizationId: input.organizationId, createdById: member.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // И поканите, които е пратил — иначе се връща през свой втори имейл.
    await revokeOpenMemberInvites(
      tx,
      { organizationId: input.organizationId, createdById: member.userId },
      'Поканилият вече не е член.',
    );
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: input.organizationId,
      action: leaving ? 'member.left' : 'member.removed',
      targetType: 'Membership',
      targetId: member.id,
      details: { role: member.role },
    });
  });
}
