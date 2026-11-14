import type { Prisma } from '@prisma/client';
import { HttpError, type OrgAccess } from '../auth/guards.js';
import { roleCan, weaker, type MemberRole } from '../auth/roles.js';

/**
 * Правото се проверява наново под заключването на фирмата: достъпът е сметнат от сесията в началото на
 * заявката, а междувременно собствеността може да е отнета или пълномощното — оттеглено.
 */
export async function recheckAccess(
  tx: Prisma.TransactionClient,
  access: OrgAccess,
  actorId: string,
): Promise<void> {
  // Прекратена фирма (или кантора, през която се издава) — нищо ново, и при заявка, започнала преди това.
  const ids = access.viaFirmId
    ? [access.organizationId, access.viaFirmId]
    : [access.organizationId];
  const stopped = await tx.organization.count({
    where: { id: { in: ids }, OR: [{ terminatedAt: { not: null } }, { deletedAt: { not: null } }] },
  });
  if (stopped > 0) throw new HttpError(409, 'terminated');
  if (access.viaFirmId === null) {
    const member = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId: access.organizationId } },
      select: { role: true },
    });
    if (!member || !roleCan(member.role as MemberRole, 'documents.issue')) throw new HttpError(404);
    return;
  }
  const now = new Date();
  const [mandate, member] = await Promise.all([
    access.mandateId
      ? tx.clientMandate.findUnique({ where: { id: access.mandateId } })
      : Promise.resolve(null),
    tx.membership.findUnique({
      where: { userId_organizationId: { userId: actorId, organizationId: access.viaFirmId } },
      select: { role: true },
    }),
  ]);
  const valid =
    mandate !== null &&
    mandate.status === 'ACTIVE' &&
    mandate.firmId === access.viaFirmId &&
    mandate.clientId === access.organizationId &&
    mandate.validFrom.getTime() <= now.getTime() &&
    (mandate.validTo === null || mandate.validTo.getTime() >= now.getTime());
  if (
    !valid ||
    !member ||
    !roleCan(weaker(member.role as MemberRole, 'ACCOUNTANT'), 'documents.issue')
  ) {
    throw new HttpError(404);
  }
}
