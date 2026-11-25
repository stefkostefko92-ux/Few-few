import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { sha256Hex } from '../crypto.js';
import { isOpen, ownerCount, TOKEN } from './transfer-core.js';

/**
 * Отворената покана по връзката от писмото (`/pokana/<токен>`): към фирма без собственик (от кантора
 * или мастъра) или предаване от собственика (SPEC 84–85). Приемането е в transfer-accept.ts.
 */
export interface OpenInvite {
  id: string;
  email: string;
  expiresAt: Date;
  organization: { id: string; legalName: string; eik: string | null };
  existingUser: boolean;
  /** Предаване от собственика (SPEC 84–85): името му; null — покана към фирма без собственик. */
  from: { name: string } | null;
  /** Поканата е от кантора по пълномощно — приелият може да го потвърди с една отметка. */
  mandate: {
    id: string;
    status: 'PENDING' | 'ACTIVE' | 'REVOKED';
    documentRef: string;
    validFrom: Date;
    firm: { legalName: string; eik: string | null };
  } | null;
}

/** Отворена покана по токена от връзката — иначе null (непознат, използван, отменен, изтекъл). */
export async function findOpenInvite(token: string, now = new Date()): Promise<OpenInvite | null> {
  if (!TOKEN.test(token)) return null;
  const invite = await prisma.transferInvite.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      organization: {
        select: { id: true, legalName: true, eik: true, deletedAt: true, terminatedAt: true },
      },
      mandate: {
        select: {
          id: true,
          status: true,
          documentRef: true,
          validFrom: true,
          firm: { select: { legalName: true, eik: true } },
        },
      },
      fromUser: { select: { name: true } },
    },
  });
  if (!invite || !isOpen(invite, now)) return null;
  if (invite.organization.deletedAt || invite.organization.terminatedAt) return null;
  if (invite.fromUserId) {
    // Предаване: предаващият трябва още да е собственик.
    if (!(await isOwner(prisma, invite.fromUserId, invite.organizationId))) return null;
  } else if ((await ownerCount(prisma, invite.organizationId)) > 0) {
    return null;
  }
  const existingUser = (await prisma.user.count({ where: { email: invite.email } })) > 0;
  const { deletedAt: _deleted, terminatedAt: _terminated, ...organization } = invite.organization;
  return {
    id: invite.id,
    email: invite.email,
    expiresAt: invite.expiresAt,
    organization,
    existingUser,
    from: invite.fromUser ? { name: invite.fromUser.name } : null,
    mandate: invite.mandate,
  };
}

export async function isOwner(
  db: Pick<Prisma.TransactionClient, 'membership'>,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const member = await db.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  });
  return member?.role === 'OWNER';
}
