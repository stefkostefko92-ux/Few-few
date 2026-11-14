import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { HttpError } from '../auth/guards.js';

/**
 * Решение по пълномощно на кантора (чл. 113, ал. 7 ЗДДС). Потвърждава собственикът/администраторът на
 * фирмата-клиент или мастър акаунтът (когато фирмата няма собствен профил — тогава мастърът е проверил
 * писменото пълномощно и фирмата става потвърдена). Условният UPDATE не позволява двойно решение.
 */
export async function decideMandate(input: {
  mandateId: string;
  actorId: string;
  decision: 'approve' | 'revoke';
  /** Фирмата, от чието име се решава (собственикът); null — мастър акаунтът. */
  clientOrgId: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const mandate = await tx.clientMandate.findUnique({
      where: { id: input.mandateId },
      include: { client: { select: { id: true, _count: { select: { memberships: true } } } } },
    });
    if (!mandate) throw new HttpError(404);
    if (input.clientOrgId !== null && mandate.clientId !== input.clientOrgId)
      throw new HttpError(404);
    const from = input.decision === 'approve' ? 'PENDING' : undefined;
    const updated = await tx.clientMandate.updateMany({
      where: {
        id: mandate.id,
        ...(from ? { status: from } : { status: { not: 'REVOKED' } }),
      },
      data:
        input.decision === 'approve'
          ? { status: 'ACTIVE' }
          : { status: 'REVOKED', revokedAt: new Date() },
    });
    if (updated.count !== 1) throw new HttpError(409);
    // Оттеглено пълномощно → и поканите на кантората към собственик по него падат (иначе поканеният
    // от нея имейл става собственик след оттеглянето).
    if (input.decision === 'revoke') {
      const invites = await tx.transferInvite.findMany({
        where: { mandateId: mandate.id, acceptedAt: null, revokedAt: null },
        select: { id: true },
      });
      if (invites.length > 0) {
        const now = new Date();
        await tx.transferInvite.updateMany({
          where: { id: { in: invites.map((invite) => invite.id) }, acceptedAt: null },
          data: { revokedAt: now },
        });
        for (const invite of invites) {
          await tx.notification.updateMany({
            where: {
              kind: 'transfer.invite',
              status: 'PENDING',
              payload: { path: ['inviteId'], equals: invite.id },
            },
            data: { status: 'FAILED', lastError: 'Пълномощното е оттеглено.' },
          });
        }
      }
    }
    // Мастърът потвърждава пълномощно за фирма без профил → проверил е и самата фирма.
    if (
      input.decision === 'approve' &&
      input.clientOrgId === null &&
      mandate.client._count.memberships === 0
    ) {
      await tx.organization.updateMany({
        where: { id: mandate.clientId, verifiedAt: null },
        data: { verifiedAt: new Date() },
      });
    }
    await audit(tx, {
      actorId: input.actorId,
      organizationId: mandate.clientId,
      action: input.decision === 'approve' ? 'mandate.approved' : 'mandate.revoked',
      targetType: 'ClientMandate',
      targetId: mandate.id,
      details: { firmId: mandate.firmId, byMaster: input.clientOrgId === null },
    });
  });
}
