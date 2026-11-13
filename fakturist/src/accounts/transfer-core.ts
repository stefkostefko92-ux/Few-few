import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { DAY } from '../time.js';

/** Общото за поканите към собственика (transfer.ts) и приемането им (transfer-accept.ts). */
export const INVITE_TTL_MS = 7 * DAY;
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type TransferErrorCode =
  | 'notFound'
  | 'hasOwner'
  | 'invalid'
  | 'invalidEmail'
  | 'invalidName'
  | 'wrongEmail'
  | 'loginRequired'
  | 'firmMember'
  | 'rateLimited'
  | 'notCreator'
  | 'invited'
  | `password.${string}`;

export class TransferError extends Error {
  constructor(readonly code: TransferErrorCode) {
    super(code);
  }
}

export const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export async function lockOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
  if (rows.length !== 1) throw new TransferError('notFound');
}

export function ownerCount(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
  return tx.membership.count({ where: { organizationId, role: 'OWNER' } });
}

/** Имейлът е на член на кантората — счетоводителят не може да стане собственик на клиента си. */
export async function isFirmMember(
  tx: Prisma.TransactionClient,
  firmId: string,
  email: string,
): Promise<boolean> {
  return (await tx.membership.count({ where: { organizationId: firmId, user: { email } } })) > 0;
}

export function isOpen(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
): boolean {
  return !invite.acceptedAt && !invite.revokedAt && invite.expiresAt.getTime() > now.getTime();
}
