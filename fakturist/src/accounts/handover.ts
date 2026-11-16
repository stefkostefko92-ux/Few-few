import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { encryptInviteToken } from '../auth/keys.js';
import { EmailSchema, INVITE_TTL_MS } from './transfer-core.js';
import {
  checkOwnerPassword,
  HandoverError,
  lockOwnedOrganization,
  revokeOpenHandovers,
  type OwnerConfirmation,
} from './handover-core.js';

/**
 * Предаване на собственост (SPEC 84–88; решение на собственика, 16.11.2026): собственикът кани човек по
 * имейл (тук; приемането е в transfer-accept.ts — общата страница `/pokana`) или предлага фирмата на
 * кантора с действащо пълномощно (handover-firm.ts); мастърът предава веднага (handover-master.ts).
 */
export { HandoverError, type HandoverErrorCode } from './handover-core.js';
export { startFirmHandover, decideFirmHandover, pendingFirmHandovers } from './handover-firm.js';
export { masterHandover, type MasterTarget } from './handover-master.js';

/**
 * Покана към човек: паролата (и 2FA), имейл ≠ своя. Новата покана отменя всяко отворено предаване на
 * фирмата. До приемането нищо не се сменя.
 */
export async function startPersonHandover(
  input: OwnerConfirmation & { email: string; now?: Date },
): Promise<{ inviteId: string; token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const parsed = EmailSchema.safeParse(input.email);
  if (!parsed.success) throw new HandoverError('invalidEmail');
  const email = parsed.data;
  const actor = await checkOwnerPassword(input);
  if (actor.email.toLowerCase() === email) throw new HandoverError('sameUser');
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  return prisma.$transaction(async (tx) => {
    await lockOwnedOrganization(tx, input);
    await revokeOpenHandovers(tx, input.organizationId, now);
    // Поканата към фирма без собственик (от кантора или мастъра) не може да е отворена тук — фирмата
    // има собственик; ако все пак е останала, отпада.
    await tx.transferInvite.updateMany({
      where: { organizationId: input.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const invite = await tx.transferInvite.create({
      data: {
        organizationId: input.organizationId,
        email,
        tokenHash: sha256Hex(token),
        createdById: input.actorId,
        fromUserId: input.actorId,
        createdAt: now,
        expiresAt,
      },
    });
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        kind: 'transfer.invite',
        toEmail: email,
        payload: { inviteId: invite.id, tokenEnc: encryptInviteToken(token, invite.id) },
      },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'organization.handover.created',
      targetType: 'TransferInvite',
      targetId: invite.id,
      details: { to: 'person' },
    });
    return { inviteId: invite.id, token, expiresAt };
  });
}

/** „Отмени предаването“ — само собственикът; връща колко отворени предавания са отменени. */
export async function cancelHandover(input: {
  organizationId: string;
  actorId: string;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const member = await tx.membership.findUnique({
      where: {
        userId_organizationId: { userId: input.actorId, organizationId: input.organizationId },
      },
      select: { role: true },
    });
    if (member?.role !== 'OWNER') throw new HandoverError('notOwner');
    const revoked = await revokeOpenHandovers(tx, input.organizationId, now);
    if (revoked > 0) {
      await audit(tx, {
        actorId: input.actorId,
        organizationId: input.organizationId,
        action: 'organization.handover.revoked',
        targetType: 'Organization',
        targetId: input.organizationId,
      });
    }
    return revoked;
  });
}

export interface HandoverStatus {
  person: { email: string; expiresAt: Date } | null;
  firm: { firmName: string; expiresAt: Date } | null;
  /** Кантори с действащо пълномощно — към тях може да се предложи фирмата. */
  firms: Array<{ id: string; legalName: string; eik: string | null }>;
  reviewPending: boolean;
  locked: boolean;
  kind: 'COMPANY' | 'ACCOUNTING_FIRM';
}

/** За страницата „Собственост“. */
export async function handoverStatus(
  organizationId: string,
  now: Date = new Date(),
): Promise<HandoverStatus> {
  const [org, invite, proposal, mandates] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { kind: true, ownerReviewPendingAt: true, ownershipLockedAt: true },
    }),
    prisma.transferInvite.findFirst({
      where: {
        organizationId,
        fromUserId: { not: null },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: { email: true, expiresAt: true },
    }),
    prisma.firmHandover.findFirst({
      where: { organizationId, status: 'PENDING', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { expiresAt: true, firm: { select: { legalName: true } } },
    }),
    prisma.clientMandate.findMany({
      where: {
        clientId: organizationId,
        status: 'ACTIVE',
        firm: { deletedAt: null, terminatedAt: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { firm: { select: { id: true, legalName: true, eik: true } } },
    }),
  ]);
  return {
    person: invite,
    firm: proposal ? { firmName: proposal.firm.legalName, expiresAt: proposal.expiresAt } : null,
    firms: org.kind === 'COMPANY' ? mandates.map((m) => m.firm) : [],
    reviewPending: org.ownerReviewPendingAt !== null,
    locked: org.ownershipLockedAt !== null,
    kind: org.kind,
  };
}
