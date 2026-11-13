import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { encryptInviteToken } from '../auth/keys.js';
import { hashPassword, passwordProblem } from '../auth/password.js';
import { DAY } from '../time.js';

/**
 * Прехвърлянето на фирма, добавена от счетоводна кантора, към собственика ѝ. Регистрация с ЕИК на
 * такава фирма се отказва (`companyManaged`), иначе всеки би взел чужда фирма с документите ѝ. Затова:
 * мастърът проверява документ за представителство и праща еднократна покана до имейла на собственика;
 * той я приема с този имейл (нов профил или вход) и става OWNER. Пълномощното на кантората остава —
 * собственикът решава за него от профила си.
 */
export const INVITE_TTL_MS = 7 * DAY;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type TransferErrorCode =
  | 'notFound'
  | 'hasOwner'
  | 'invalid'
  | 'invalidEmail'
  | 'invalidName'
  | 'wrongEmail'
  | 'loginRequired'
  | `password.${string}`;

export class TransferError extends Error {
  constructor(readonly code: TransferErrorCode) {
    super(code);
  }
}

const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
  if (rows.length !== 1) throw new TransferError('notFound');
}

function ownerCount(tx: Prisma.TransactionClient, organizationId: string): Promise<number> {
  return tx.membership.count({ where: { organizationId, role: 'OWNER' } });
}

/**
 * Нова покана: само за фирма без собственик. Предишните отворени покани и непратените им писма се
 * отменят. В поканата е само SHA-256 на токена; писмото в опашката носи токена шифрован.
 */
export async function createTransferInvite(input: {
  organizationId: string;
  email: string;
  actorId: string;
  now?: Date;
}): Promise<{ inviteId: string; token: string; expiresAt: Date }> {
  const parsed = EmailSchema.safeParse(input.email);
  if (!parsed.success) throw new TransferError('invalidEmail');
  const email = parsed.data;
  const now = input.now ?? new Date();
  const token = randomToken(32);
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const org = await tx.organization.findUniqueOrThrow({
      where: { id: input.organizationId },
      select: { deletedAt: true },
    });
    if (org.deletedAt) throw new TransferError('notFound');
    if ((await ownerCount(tx, input.organizationId)) > 0) throw new TransferError('hasOwner');
    const replaced = await tx.transferInvite.updateMany({
      where: { organizationId: input.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.notification.updateMany({
      where: { organizationId: input.organizationId, kind: 'transfer.invite', status: 'PENDING' },
      data: { status: 'FAILED', lastError: 'Поканата е заменена с нова.' },
    });
    const invite = await tx.transferInvite.create({
      data: {
        organizationId: input.organizationId,
        email,
        tokenHash: sha256Hex(token),
        createdById: input.actorId,
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
      action: 'organization.transfer.invited',
      targetType: 'TransferInvite',
      targetId: invite.id,
      details: { replaced: replaced.count },
    });
    return { inviteId: invite.id, token, expiresAt };
  });
}

export async function revokeTransferInvite(input: {
  inviteId: string;
  actorId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invite = await tx.transferInvite.findUnique({ where: { id: input.inviteId } });
    if (!invite) throw new TransferError('notFound');
    const revoked = await tx.transferInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new TransferError('invalid');
    await tx.notification.updateMany({
      where: { organizationId: invite.organizationId, kind: 'transfer.invite', status: 'PENDING' },
      data: { status: 'FAILED', lastError: 'Поканата е отменена.' },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: invite.organizationId,
      action: 'organization.transfer.revoked',
      targetType: 'TransferInvite',
      targetId: invite.id,
    });
  });
}

export interface OpenInvite {
  id: string;
  email: string;
  expiresAt: Date;
  organization: { id: string; legalName: string; eik: string | null };
  existingUser: boolean;
}

function isOpen(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
) {
  return !invite.acceptedAt && !invite.revokedAt && invite.expiresAt.getTime() > now.getTime();
}

/** Отворена покана по токена от връзката — иначе null (непознат, използван, отменен, изтекъл). */
export async function findOpenInvite(token: string, now = new Date()): Promise<OpenInvite | null> {
  if (!TOKEN.test(token)) return null;
  const invite = await prisma.transferInvite.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: {
      organization: { select: { id: true, legalName: true, eik: true, deletedAt: true } },
    },
  });
  if (!invite || !isOpen(invite, now) || invite.organization.deletedAt) return null;
  if ((await ownerCount(prisma, invite.organizationId)) > 0) return null;
  const existingUser = (await prisma.user.count({ where: { email: invite.email } })) > 0;
  const { deletedAt: _deleted, ...organization } = invite.organization;
  return {
    id: invite.id,
    email: invite.email,
    expiresAt: invite.expiresAt,
    organization,
    existingUser,
  };
}

type Acceptor = { userId: string } | { name: string; password: string };

/**
 * Приемане: само с имейла от поканата. Вписан човек — неговият профил; без вход — нов профил, ако няма
 * такъв с този имейл (иначе първо вход). Всичко в една транзакция със заключена фирма: поканата се
 * „заема“ с условен UPDATE — две едновременни приемания не минават и двете.
 */
export async function acceptTransferInvite(input: {
  token: string;
  user: Acceptor;
  now?: Date;
}): Promise<{ userId: string; organizationId: string; created: boolean }> {
  const now = input.now ?? new Date();
  if (!TOKEN.test(input.token)) throw new TransferError('invalid');
  const tokenHash = sha256Hex(input.token);
  const pre = await prisma.transferInvite.findUnique({
    where: { tokenHash },
    select: { email: true },
  });
  if (!pre) throw new TransferError('invalid');

  // Хешът на паролата е бавен (Argon2id) — смята се преди заключването на фирмата.
  let newUser: { name: string; passwordHash: string } | null = null;
  if ('password' in input.user) {
    const name = input.user.name.trim();
    if (name.length < 2 || name.length > 100) throw new TransferError('invalidName');
    const problem = passwordProblem(input.user.password, [pre.email, name]);
    if (problem) throw new TransferError(`password.${problem}`);
    newUser = { name, passwordHash: await hashPassword(input.user.password) };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.transferInvite.findUniqueOrThrow({ where: { tokenHash } });
      await lockOrganization(tx, invite.organizationId);
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: invite.organizationId },
        select: { deletedAt: true },
      });
      if (!isOpen(invite, now) || org.deletedAt) throw new TransferError('invalid');
      if ((await ownerCount(tx, invite.organizationId)) > 0) throw new TransferError('invalid');

      let userId: string;
      if (newUser) {
        if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
          throw new TransferError('loginRequired');
        }
        const user = await tx.user.create({
          data: {
            email: invite.email,
            name: newUser.name,
            passwordHash: newUser.passwordHash,
            emailVerifiedAt: now,
          },
        });
        userId = user.id;
      } else {
        const id = 'userId' in input.user ? input.user.userId : '';
        const user = await tx.user.findUnique({ where: { id } });
        if (!user || user.disabledAt) throw new TransferError('invalid');
        if (user.email !== invite.email) throw new TransferError('wrongEmail');
        userId = user.id;
        // Връзката от писмото доказва, че имейлът е негов.
        if (!user.emailVerifiedAt) {
          await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
        }
      }

      const claimed = await tx.transferInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedById: userId },
      });
      if (claimed.count !== 1) throw new TransferError('invalid');

      await tx.membership.upsert({
        where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
        create: { userId, organizationId: invite.organizationId, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
      // Фирмата, добавена от кантора, няма собствен план — получава безплатния, както при регистрация.
      const active = await tx.subscription.findFirst({
        where: { organizationId: invite.organizationId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!active) {
        const periodEnd = new Date(now);
        periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 100);
        await tx.subscription.create({
          data: {
            organizationId: invite.organizationId,
            planCode: 'free',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        });
      }
      await audit(tx, {
        actorId: userId,
        organizationId: invite.organizationId,
        action: 'organization.transfer.accepted',
        targetType: 'TransferInvite',
        targetId: invite.id,
        details: { newAccount: newUser !== null },
      });
      return { userId, organizationId: invite.organizationId, created: newUser !== null };
    });
  } catch (error) {
    // Две покани (за различни фирми) към един нов имейл, приети едновременно: заключването е по фирма,
    // затова решава уникалният индекс — вторият вече има профил и трябва да влезе.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new TransferError('loginRequired');
    }
    throw error;
  }
}

/** За картата на фирмата в мастър панела: има ли собственик и чакаща покана. */
export async function transferStatus(organizationId: string): Promise<{
  hasOwner: boolean;
  openInvite: { id: string; email: string; expiresAt: Date } | null;
}> {
  const [owners, invite] = await Promise.all([
    ownerCount(prisma, organizationId),
    prisma.transferInvite.findFirst({
      where: {
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true },
    }),
  ]);
  return { hasOwner: owners > 0, openInvite: invite };
}
