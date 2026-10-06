import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { hashToken } from './token-hash';
import { tokenShapeOk } from './token-shape';

// The invitations of colleagues (Invite in prisma/schema.prisma): an invitation waiting takes a slot of the
// subscription, so the slots count the colleagues and the invitations not yet ended.

type Db = Prisma.TransactionClient | typeof prisma;

/** The company's invitations still waiting (not past their end). */
export const pendingInvites = (companyId: string, db: Db = prisma): Promise<number> =>
  db.invite.count({ where: { companyId, expiresAt: { gt: new Date() } } });

/** The invitation of a link still good, with its company's name; null for an unknown, ended or malformed link, or a
 *  company no longer active. Reading it changes nothing. */
export async function inviteOfToken(token: string) {
  if (!tokenShapeOk(token)) return null;
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { company: { select: { name: true, active: true } } } });
  return invite && invite.expiresAt > new Date() && invite.company.active ? invite : null;
}
