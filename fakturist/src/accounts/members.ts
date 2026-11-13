import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { encryptMemberInviteToken } from '../auth/keys.js';
import { hashPassword, passwordProblem } from '../auth/password.js';
import { canAssign, type MemberRole } from '../auth/roles.js';
import { recordRegistrationAcceptance } from '../legal/acceptance.js';
import { lockOrganization } from './transfer-core.js';
import { DAY } from '../time.js';

/**
 * Членовете на фирмата (SPEC 45). OWNER/ADMIN кани по имейл с роля под своята (никога OWNER — той идва
 * само с прехвърляне). Поканата е еднократна връзка за 7 дни: в базата е само SHA-256 на токена, в
 * опашката с писма — шифрован и вързан с id-то. Приема се само с имейла от поканата. Одитът е без имейли.
 */
export const MEMBER_INVITE_TTL_MS = 7 * DAY;
/** Покани от една фирма за едно денонощие — пощата е и чужда кутия. */
export const MEMBER_INVITES_PER_DAY = 20;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const InviteRoleSchema = z.enum(['ADMIN', 'ACCOUNTANT', 'ISSUER', 'VIEWER']);
export const MemberEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export class MemberError extends Error {
  constructor(
    readonly code:
      | 'notFound'
      | 'forbiddenRole'
      | 'alreadyMember'
      | 'rateLimited'
      | 'invalid'
      | 'wrongEmail'
      | 'loginRequired'
      | 'invalidName'
      | 'self'
      | `password.${string}`,
  ) {
    super(code);
  }
}

type Actor = { userId: string; role: MemberRole };

export async function inviteMember(input: {
  organizationId: string;
  actor: Actor;
  email: string;
  role: MemberRole;
  now?: Date;
}): Promise<{ inviteId: string }> {
  const now = input.now ?? new Date();
  if (!canAssign(input.actor.role, input.role)) throw new MemberError('forbiddenRole');
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const member = await tx.membership.findFirst({
      where: { organizationId: input.organizationId, user: { email: input.email } },
      select: { id: true },
    });
    if (member) throw new MemberError('alreadyMember');
    const today = await tx.memberInvite.count({
      where: {
        organizationId: input.organizationId,
        createdAt: { gt: new Date(now.getTime() - DAY) },
      },
    });
    if (today >= MEMBER_INVITES_PER_DAY) throw new MemberError('rateLimited');
    // Нова покана за същия имейл отменя старата — валидна е само последната връзка.
    await tx.memberInvite.updateMany({
      where: {
        organizationId: input.organizationId,
        email: input.email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    const token = randomToken(32);
    const invite = await tx.memberInvite.create({
      data: {
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        tokenHash: sha256Hex(token),
        createdById: input.actor.userId,
        expiresAt: new Date(now.getTime() + MEMBER_INVITE_TTL_MS),
        createdAt: now,
      },
    });
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        kind: 'member.invite',
        toEmail: input.email,
        payload: { inviteId: invite.id, tokenEnc: encryptMemberInviteToken(token, invite.id) },
      },
    });
    await audit(tx, {
      actorId: input.actor.userId,
      organizationId: input.organizationId,
      action: 'member.invited',
      targetType: 'MemberInvite',
      targetId: invite.id,
      details: { role: input.role },
    });
    return { inviteId: invite.id };
  });
}

export interface OpenMemberInvite {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
  organization: { id: string; legalName: string };
  existingUser: boolean;
}

/** Отворена покана по токена — иначе null (непозната, използвана, отменена, изтекла). */
export async function findMemberInvite(
  token: string,
  now: Date = new Date(),
): Promise<OpenMemberInvite | null> {
  if (!TOKEN.test(token)) return null;
  const invite = await prisma.memberInvite.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { organization: { select: { id: true, legalName: true, deletedAt: true } } },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) return null;
  if (invite.organization.deletedAt) return null;
  const existingUser = (await prisma.user.count({ where: { email: invite.email } })) > 0;
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role as MemberRole,
    expiresAt: invite.expiresAt,
    organization: { id: invite.organization.id, legalName: invite.organization.legalName },
    existingUser,
  };
}

/**
 * Приемане: вписан човек с имейла от поканата — неговият профил; без вход — нов профил (ако няма такъв).
 * Поканата се заема с условен UPDATE под заключването на фирмата. Новият профил приема общите условия
 * и политиката (отметката на формата); имейлът му е потвърден — връзката е стигнала до него.
 */
export async function acceptMemberInvite(input: {
  token: string;
  user: { userId: string } | { name: string; password: string };
  now?: Date;
}): Promise<{ userId: string; organizationId: string }> {
  const now = input.now ?? new Date();
  if (!TOKEN.test(input.token)) throw new MemberError('invalid');
  const tokenHash = sha256Hex(input.token);
  const pre = await prisma.memberInvite.findUnique({
    where: { tokenHash },
    select: { email: true },
  });
  if (!pre) throw new MemberError('invalid');
  let newUser: { name: string; passwordHash: string } | null = null;
  if ('password' in input.user) {
    const name = input.user.name.trim();
    if (name.length < 2 || name.length > 100) throw new MemberError('invalidName');
    const problem = passwordProblem(input.user.password, [pre.email, name]);
    if (problem) throw new MemberError(`password.${problem}`);
    newUser = { name, passwordHash: await hashPassword(input.user.password) };
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const invite = await tx.memberInvite.findUniqueOrThrow({ where: { tokenHash } });
      await lockOrganization(tx, invite.organizationId);
      if (invite.acceptedAt || invite.revokedAt || invite.expiresAt <= now) {
        throw new MemberError('invalid');
      }
      let userId: string;
      if (newUser) {
        if (await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
          throw new MemberError('loginRequired');
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
        await recordRegistrationAcceptance(tx, {
          userId,
          organizationId: invite.organizationId,
          now,
          documents: ['terms', 'privacy'],
        });
      } else {
        const id = 'userId' in input.user ? input.user.userId : '';
        const user = await tx.user.findUnique({ where: { id } });
        if (!user || user.disabledAt) throw new MemberError('invalid');
        if (user.email !== invite.email) throw new MemberError('wrongEmail');
        userId = user.id;
        if (!user.emailVerifiedAt) {
          await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
        }
      }
      const existing = await tx.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
      });
      if (existing) throw new MemberError('alreadyMember');
      const claimed = await tx.memberInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedById: userId },
      });
      if (claimed.count !== 1) throw new MemberError('invalid');
      await tx.membership.create({
        data: { userId, organizationId: invite.organizationId, role: invite.role },
      });
      await audit(tx, {
        actorId: userId,
        organizationId: invite.organizationId,
        action: 'member.joined',
        targetType: 'MemberInvite',
        targetId: invite.id,
        details: { role: invite.role, newAccount: newUser !== null },
      });
      return { userId, organizationId: invite.organizationId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new MemberError('loginRequired');
    }
    throw error;
  }
}

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

/** Смяна на роля: само на член под своята роля, към роля под своята; не и на себе си. */
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
