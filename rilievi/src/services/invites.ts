import type { Invite, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { hashPassword, passwordProblem, type PasswordProblem } from '../auth/password.js';
import { outranks } from '../auth/roles.js';
import { aziendaWhere, inScope, scopeOf } from '../auth/scope.js';
import { activeAzienda } from '../aziende/service.js';
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
  | { ok: false; error: 'roleNotAllowed' | 'userExists' | 'azienda' };

/**
 * Покана от човек със `users:manage` — само за роля ПОД неговата и само в своята фирма; MASTER
 * избира фирмата (активна). Нова покана за същия имейл в същата фирма обезсилва старите (връзката
 * от старото писмо спира да работи).
 */
export async function createInvite(
  actor: SessionUser,
  input: { email: string; name: string; role: Role; locale: Locale; aziendaId: unknown },
): Promise<CreateInviteResult> {
  if (!outranks(actor.role, input.role)) return { ok: false, error: 'roleNotAllowed' };
  const scope = scopeOf(actor);
  // Администраторът кани само в своята фирма — каквото и да е дошло от формата.
  const azienda = await activeAzienda(scope.all ? input.aziendaId : scope.aziendaId);
  if (!azienda) return { ok: false, error: 'azienda' };
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { ok: false, error: 'userExists' };
  const { token, hash } = newToken();
  const invite = await prisma.$transaction(async (tx) => {
    await tx.invite.updateMany({
      where: { email: input.email, aziendaId: azienda.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const created = await tx.invite.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        locale: input.locale,
        aziendaId: azienda.id,
        tokenHash: hash,
        invitedById: actor.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * DAY),
      },
    });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'INVITE_CREATE',
        aziendaId: azienda.id,
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
      azienda: azienda.name,
      role: t(`role.${input.role}`),
      link,
      days: INVITE_DAYS,
    }),
  );
  return { ok: true, link, mail, invite };
}

/** Чакащите покани в обхвата (неприети, неотменени, неизтекли) — за страницата „Utenti“. */
export function pendingInvites(actor: SessionUser, filter?: string | null) {
  return prisma.invite.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...aziendaWhere(scopeOf(actor), filter),
    },
    include: { invitedBy: { select: { name: true } }, azienda: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Отмяна: от човек над ролята на поканата, в своята фирма (MASTER — във всяка). */
export async function revokeInvite(actor: SessionUser, inviteId: string): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.acceptedAt || invite.revokedAt) return false;
  if (!outranks(actor.role, invite.role) || !inScope(scopeOf(actor), invite.aziendaId))
    return false;
  return prisma.$transaction(async (tx) => {
    const revoked = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'INVITE_REVOKE',
        aziendaId: invite.aziendaId,
        targetType: 'invite',
        targetId: invite.id,
      },
      tx,
    );
    return true;
  });
}

export type ValidInvite = Invite & { azienda: { name: string } };

/** Поканата по токена от връзката, ако още важи (и фирмата ѝ не е деактивирана). */
export async function findValidInvite(token: unknown): Promise<ValidInvite | null> {
  const hash = tokenHash(token);
  if (!hash) return null;
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hash },
    include: { azienda: { select: { name: true, deactivatedAt: true } } },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.azienda.deactivatedAt) return null;
  if (invite.expiresAt.getTime() <= Date.now()) return null;
  return { ...invite, azienda: { name: invite.azienda.name } };
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
          aziendaId: invite.aziendaId,
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
          aziendaId: invite.aziendaId,
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
