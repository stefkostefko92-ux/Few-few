import type { Invite, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { hashPassword, passwordProblem, type PasswordProblem } from '../auth/password.js';
import { outranks } from '../auth/roles.js';
import { translatorFor, type Locale } from '../i18n.js';
import { inviteMail } from '../mail/templates.js';
import { sendMail, type MailResult } from '../mail/mailer.js';
import { DAY } from '../time.js';
import type { SessionUser } from '../types.js';
import { inviteLink, newToken, tokenHash } from './tokens.js';

/** Поканата важи 7 дни; после се праща нова. */
export const INVITE_DAYS = 7;

export type CreateInviteResult =
  | { ok: true; link: string; mail: MailResult; invite: Invite }
  | { ok: false; error: 'roleNotAllowed' | 'userExists' };

/**
 * Покана от човек със `users:manage` — само за роля ПОД неговата. Нова покана за същия имейл
 * обезсилва старите (връзката от старото писмо спира да работи).
 */
export async function createInvite(
  actor: SessionUser,
  input: { email: string; name: string | null; role: Role; locale: Locale },
): Promise<CreateInviteResult> {
  if (!outranks(actor.role, input.role)) return { ok: false, error: 'roleNotAllowed' };
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { ok: false, error: 'userExists' };
  const { token, hash } = newToken();
  const invite = await prisma.$transaction(async (tx) => {
    await tx.invite.updateMany({
      where: { email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await tx.invite.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        locale: input.locale,
        tokenHash: hash,
        invitedById: actor.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * DAY),
      },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'INVITE_CREATE',
        targetType: 'invite',
        targetId: created.id,
        meta: { role: input.role },
      },
      tx,
    );
    return created;
  });
  const link = inviteLink(token);
  const t = translatorFor(input.locale);
  const mail = await sendMail(
    inviteMail(input.locale, {
      to: input.email,
      inviter: actor.name,
      role: t(`role.${input.role}`),
      link,
      days: INVITE_DAYS,
    }),
  );
  return { ok: true, link, mail, invite };
}

/** Чакащите покани (неприети, неотменени, неизтекли) — за страницата „Utenti“. */
export function pendingInvites() {
  return prisma.invite.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Отмяна: от човек над ролята на поканата. */
export async function revokeInvite(actor: SessionUser, inviteId: string): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.acceptedAt || invite.revokedAt) return false;
  if (!outranks(actor.role, invite.role)) return false;
  return prisma.$transaction(async (tx) => {
    const revoked = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) return false;
    await writeAudit(
      { actorId: actor.id, action: 'INVITE_REVOKE', targetType: 'invite', targetId: invite.id },
      tx,
    );
    return true;
  });
}

/** Поканата по токена от връзката, ако още важи. */
export async function findValidInvite(token: unknown): Promise<Invite | null> {
  const hash = tokenHash(token);
  if (!hash) return null;
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hash } });
  if (!invite || invite.acceptedAt || invite.revokedAt) return null;
  return invite.expiresAt.getTime() > Date.now() ? invite : null;
}

export type AcceptResult =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; error: 'invalid' | 'userExists' | PasswordProblem };

/**
 * Приемане: акаунтът се създава с имейла и ролята ОТ ПОКАНАТА (не от формата). Поканата се
 * изразходва в същата транзакция — две паралелни приемания дават един акаунт.
 */
export async function acceptInvite(
  token: unknown,
  input: { name: string; password: string },
): Promise<AcceptResult> {
  const invite = await findValidInvite(token);
  if (!invite) return { ok: false, error: 'invalid' };
  const problem = passwordProblem(input.password, [invite.email, input.name]);
  if (problem) return { ok: false, error: problem };
  const passwordHash = await hashPassword(input.password);
  return prisma
    .$transaction(async (tx) => {
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) return { ok: false, error: 'invalid' } as const;
      if (await tx.user.findUnique({ where: { email: invite.email } })) {
        throw new InviteConflict();
      }
      const user = await tx.user.create({
        data: {
          email: invite.email,
          name: input.name,
          role: invite.role,
          locale: invite.locale,
          passwordHash,
          invitedById: invite.invitedById,
          lastLoginAt: new Date(),
        },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedUserId: user.id } });
      await writeAudit(
        {
          actorId: user.id,
          action: 'INVITE_ACCEPT',
          targetType: 'invite',
          targetId: invite.id,
          meta: { role: invite.role },
        },
        tx,
      );
      return { ok: true, user: { id: user.id, role: user.role } } as const;
    })
    .catch((error: unknown) => {
      // Акаунт с този имейл се е появил междувременно — транзакцията се връща цялата (поканата остава).
      if (error instanceof InviteConflict) return { ok: false, error: 'userExists' } as const;
      throw error;
    });
}

class InviteConflict extends Error {}
