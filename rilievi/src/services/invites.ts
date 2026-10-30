import type { Invite, Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { writeAudit } from '../audit.js';
import { hashPassword, passwordProblem, type PasswordProblem } from '../auth/password.js';
import { nomiDelleAziende } from '../auth/nomi-ruoli.js';
import { nomiSalvati, type RuoloAzienda } from '../auth/permessi.js';
import { isPrivileged, outranks } from '../auth/roles.js';
import { aziendaWhere, canIn, roleIn, scopeFor } from '../auth/scope.js';
import { activeAzienda } from '../aziende/service.js';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
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
 * Фирмата на поканата: MASTER избира всяка; администратор на една фирма кани винаги в нея, каквото и
 * да е дошло от формата; на няколко — само в избрана от тях.
 */
function inviteAzienda(actor: SessionUser, posted: unknown): string | null {
  const scope = scopeFor(actor, 'users:manage');
  if (scope.all) return typeof posted === 'string' ? posted : null;
  if (scope.aziendaIds.length === 1) return scope.aziendaIds[0]!;
  return typeof posted === 'string' && scope.aziendaIds.includes(posted) ? posted : null;
}

/**
 * Покана от човек със `users:manage` във фирмата — само за роля ПОД неговата в нея (ролята е различна
 * за всяка фирма). Нова покана за същия имейл в същата фирма обезсилва старите (връзката от старото
 * писмо спира да работи).
 */
export async function createInvite(
  actor: SessionUser,
  input: { email: string; name: string; role: Role; aziendaId: unknown },
): Promise<CreateInviteResult> {
  const aziendaId = inviteAzienda(actor, input.aziendaId);
  const azienda =
    aziendaId && canIn(actor, 'users:manage', aziendaId) ? await activeAzienda(aziendaId) : null;
  if (!azienda) return { ok: false, error: 'azienda' };
  const own = roleIn(actor, azienda.id);
  if (!own || !outranks(own, input.role)) return { ok: false, error: 'roleNotAllowed' };
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return { ok: false, error: 'userExists' };
  const { invite, token } = await prisma.$transaction((tx) =>
    insertInvite(tx, actor, { ...input, aziendaId: azienda.id }),
  );
  const ruolo = (await nomiDelleAziende([azienda.id])).get(azienda.id)?.[
    input.role as RuoloAzienda
  ];
  const { link, mail } = await sendInviteMail(actor, input, azienda.name, token, ruolo);
  return { ok: true, link, mail, invite };
}

/**
 * Записът на поканата в транзакцията на извикващия: старите неприети покани за същия имейл във фирмата
 * спират, новата влиза с одита си. Проверките (роля, фирма, съществуващ акаунт) са на извикващия.
 */
export async function insertInvite(
  tx: Prisma.TransactionClient,
  actor: SessionUser,
  input: { email: string; name: string; role: Role; aziendaId: string },
): Promise<{ invite: Invite; token: string }> {
  const { token, hash } = newToken();
  await tx.invite.updateMany({
    where: { email: input.email, aziendaId: input.aziendaId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const invite = await tx.invite.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      aziendaId: input.aziendaId,
      tokenHash: hash,
      invitedById: actor.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * DAY),
    },
  });
  await writeAudit(
    {
      actorId: actor.id,
      action: 'INVITE_CREATE',
      aziendaId: input.aziendaId,
      targetType: 'invite',
      targetId: invite.id,
      meta: { role: input.role },
    },
    tx,
  );
  return { invite, token };
}

/** Връзката и писмото с нея — след като поканата е в базата (без SMTP връзката само се показва). */
export async function sendInviteMail(
  actor: SessionUser,
  input: { email: string; role: Role },
  aziendaName: string,
  token: string,
  /** Името на ролята, записано от фирмата; без него — това от речника. */
  ruolo?: string,
): Promise<{ link: string; mail: MailResult }> {
  const link = inviteLink(token);
  const t = translatorFor(DEFAULT_LOCALE);
  const mail = await sendMail(
    inviteMail({
      to: input.email,
      inviter: actor.name,
      azienda: aziendaName,
      role: ruolo ?? t(`role.${input.role}`),
      link,
      days: INVITE_DAYS,
    }),
  );
  return { link, mail };
}

/** Чакащите покани в обхвата (неприети, неотменени, неизтекли) — за страницата „Utenti“. */
export function pendingInvites(actor: SessionUser, filter?: string | null) {
  return prisma.invite.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      ...aziendaWhere(scopeFor(actor, 'users:manage'), filter),
    },
    include: {
      invitedBy: { select: { name: true, master: true } },
      azienda: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Отмяна: от човек над ролята на поканата в нейната фирма (MASTER — във всяка). */
export async function revokeInvite(actor: SessionUser, inviteId: string): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.acceptedAt || invite.revokedAt) return false;
  const own = canIn(actor, 'users:manage', invite.aziendaId)
    ? roleIn(actor, invite.aziendaId)
    : null;
  if (!own || !outranks(own, invite.role)) return false;
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

/** `azienda.ruolo` — името на ролята, записано от фирмата (без него — това от речника). */
export type ValidInvite = Invite & { azienda: { name: string; ruolo?: string } };

/** Поканата по токена от връзката, ако още важи (и фирмата ѝ не е деактивирана). */
export async function findValidInvite(token: unknown): Promise<ValidInvite | null> {
  const hash = tokenHash(token);
  if (!hash) return null;
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hash },
    include: { azienda: { select: { name: true, deactivatedAt: true, nomiRuoli: true } } },
  });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.azienda.deactivatedAt) return null;
  if (invite.expiresAt.getTime() <= Date.now()) return null;
  const ruolo =
    invite.role === 'MASTER' ? undefined : nomiSalvati(invite.azienda.nomiRuoli)[invite.role];
  return { ...invite, azienda: { name: invite.azienda.name, ...(ruolo ? { ruolo } : {}) } };
}

export type AcceptResult =
  | { ok: true; user: { id: string; privileged: boolean } }
  | { ok: false; error: 'invalid' | 'userExists' | PasswordProblem };

/**
 * Приемане: акаунтът се създава с имейла, фирмата и ролята ОТ ПОКАНАТА (не от формата) — първото му
 * членство; другите фирми ги добавя само MASTER. Поканата се изразходва в същата транзакция — две
 * паралелни приемания дават един акаунт.
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
          memberships: { create: { aziendaId: invite.aziendaId, role: invite.role } },
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
      return {
        ok: true,
        user: { id: user.id, privileged: isPrivileged(invite.role) },
      } as const;
    })
    .catch((error: unknown) => {
      // Акаунт с този имейл се е появил междувременно — транзакцията се връща цялата (поканата остава).
      if (error instanceof InviteConflict) return { ok: false, error: 'userExists' } as const;
      throw error;
    });
}

class InviteConflict extends Error {}
