import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';
import { writeUserAudit } from '../audit.js';
import {
  canManageAccount,
  canManageMembership,
  canSetActive,
  type Target,
} from '../auth/manage.js';
import { ROLE_LEVEL } from '../auth/roles.js';
import { aziendaWhere, inScope, scopeFor, type Scope } from '../auth/scope.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { isUniqueViolation } from '../aziende/service.js';
import { emailChangedMail, resetMail } from '../mail/templates.js';
import { sendMail, type MailResult } from '../mail/mailer.js';
import { HOUR } from '../time.js';
import type { SessionUser } from '../types.js';
import { ADMIN_RESET_HOURS } from './auth.js';
import { newToken, resetLink } from './tokens.js';

const USER_ID = /^[a-z0-9]{20,40}$/;

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  master: true,
  deactivatedAt: true,
  lastLoginAt: true,
  createdAt: true,
  invitedBy: { select: { name: true, master: true } },
  memberships: {
    select: { aziendaId: true, role: true, azienda: { select: { name: true } } },
    orderBy: { azienda: { name: 'asc' } },
  },
} as const satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Каквото вижда `actor` за един човек: фирмите само от неговия обхват и правата му над всяка. */
export interface UserView {
  id: string;
  name: string;
  email: string;
  master: boolean;
  deactivatedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Поканил го е MASTER, а гледа друг: показва се „Amministrazione del portale“, не името. */
  invitedBy: { name: string; portal: boolean } | null;
  memberships: Array<{ aziendaId: string; aziendaName: string; role: Role; manageable: boolean }>;
  /** Име, имейл, връзка за парола. */
  manageable: boolean;
  /** Деактивиране / активиране. */
  activable: boolean;
  self: boolean;
}

function viewOf(actor: SessionUser, row: UserRow, scope: Scope): UserView {
  const target: Target = { id: row.id, master: row.master, memberships: row.memberships };
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    master: row.master,
    deactivatedAt: row.deactivatedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    invitedBy: row.invitedBy && {
      name: row.invitedBy.master && !actor.master ? '' : row.invitedBy.name,
      portal: row.invitedBy.master && !actor.master,
    },
    // Фирмите извън обхвата на гледащия не се показват — нито името им, нито ролята.
    memberships: row.memberships
      .filter((m) => inScope(scope, m.aziendaId))
      .map((m) => ({
        aziendaId: m.aziendaId,
        aziendaName: m.azienda.name,
        role: m.role,
        manageable: canManageMembership(actor, target, m.aziendaId),
      })),
    manageable: canManageAccount(actor, target),
    activable: canSetActive(actor, target),
    self: actor.id === row.id,
  };
}

/** Условие „човекът е в някоя от фирмите на обхвата“; за MASTER без филтър — всички (и MASTER). */
function visibleWhere(scope: Scope, filter?: string | null): Prisma.UserWhereInput {
  const aziendaId = aziendaWhere(scope, filter).aziendaId;
  return aziendaId === undefined ? {} : { memberships: { some: { aziendaId } } };
}

/** Най-силната видима роля — за реда в списъка (MASTER горе, после по ранг, после по име). */
function rank(user: UserView): number {
  if (user.master) return 0;
  return Math.min(...user.memberships.map((m) => ROLE_LEVEL[m.role]), Number.MAX_SAFE_INTEGER);
}

/**
 * Хората, които `actor` вижда: тези от фирмите, в които той кани и управлява (`users:manage`); MASTER —
 * всички, с филтър по фирма. MASTER няма фирма, затова никой друг не го вижда в списъка.
 */
export async function listUsers(actor: SessionUser, filter?: string | null): Promise<UserView[]> {
  const scope = scopeFor(actor, 'users:manage');
  const rows = await prisma.user.findMany({
    where: visibleWhere(scope, filter),
    select: USER_SELECT,
  });
  return rows
    .map((row) => viewOf(actor, row, scope))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'it'));
}

/** Човек по id — само видим за `actor`: чужд е „няма такъв“, не „забранено“. */
export async function getUser(actor: SessionUser, id: string): Promise<UserView | null> {
  if (!USER_ID.test(id)) return null;
  const scope = scopeFor(actor, 'users:manage');
  const row = await prisma.user.findFirst({
    where: { id, ...visibleWhere(scope) },
    select: USER_SELECT,
  });
  return row ? viewOf(actor, row, scope) : null;
}

/** Човекът с ВСИЧКИТЕ му членства — проверката за управление гледа и фирмите извън обхвата. */
export function loadTarget(id: string) {
  if (!USER_ID.test(id)) return Promise.resolve(null);
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      master: true,
      name: true,
      email: true,
      deactivatedAt: true,
      memberships: { select: { aziendaId: true, role: true } },
    },
  });
}

/** Деактивиран акаунт не влиза, а сесиите му падат веднага. Данните (схемите) остават. Себе си — не. */
export async function setActive(
  actor: SessionUser,
  targetId: string,
  active: boolean,
): Promise<boolean> {
  const target = await loadTarget(targetId);
  if (!target || !canSetActive(actor, target)) return false;
  if (active === (target.deactivatedAt === null)) return true;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: active
        ? { deactivatedAt: null, failedLogins: 0, lockedUntil: null }
        : { deactivatedAt: new Date() },
    });
    if (!active) await destroyAllSessions(target.id, undefined, tx);
    await writeUserAudit(
      {
        actorId: actor.id,
        action: active ? 'USER_REACTIVATE' : 'USER_DEACTIVATE',
        targetType: 'user',
        targetId: target.id,
      },
      target.id,
      tx,
    );
  });
  return true;
}

/**
 * Връзка за нова парола, дадена от управляващия акаунта (работи и без поща — показва се на екрана).
 * Старите неизползвани връзки на човека се обезсилват.
 */
export async function createResetLink(
  actor: SessionUser,
  targetId: string,
): Promise<{ link: string; mail: MailResult } | null> {
  const target = await loadTarget(targetId);
  if (!target || !canManageAccount(actor, target) || target.deactivatedAt) return null;
  const { token, hash } = newToken();
  await prisma.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({
      where: { userId: target.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordReset.create({
      data: {
        userId: target.id,
        tokenHash: hash,
        createdById: actor.id,
        expiresAt: new Date(Date.now() + ADMIN_RESET_HOURS * HOUR),
      },
    });
    await writeUserAudit(
      { actorId: actor.id, action: 'PASSWORD_RESET_LINK', targetType: 'user', targetId: target.id },
      target.id,
      tx,
    );
  });
  const link = resetLink(token);
  const mail = await sendMail(resetMail({ to: target.email, link, hours: ADMIN_RESET_HOURS }));
  return { link, mail };
}

export type AccountOutcome =
  { ok: true; changed: boolean } | { ok: false; error: 'notAllowed' | 'emailTaken' };

/**
 * Име и имейл на акаунта (стойностите са вече проверени). Нов имейл: старите връзки за парола спират
 * (пратени са на стария адрес), а старият адрес получава известие — ако не е било по желание на
 * собственика, ще разбере. В одита — кои полета, никога стойностите.
 */
export async function updateAccount(
  actor: SessionUser,
  targetId: string,
  input: { name: string; email: string },
): Promise<AccountOutcome> {
  const target = await loadTarget(targetId);
  if (!target || !canManageAccount(actor, target)) return { ok: false, error: 'notAllowed' };
  const fields = [
    ...(input.name !== target.name ? ['name'] : []),
    ...(input.email !== target.email ? ['email'] : []),
  ];
  if (fields.length === 0) return { ok: true, changed: false };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { name: input.name, email: input.email },
      });
      if (fields.includes('email')) {
        await tx.passwordReset.updateMany({
          where: { userId: target.id, usedAt: null },
          data: { usedAt: new Date() },
        });
      }
      await writeUserAudit(
        {
          actorId: actor.id,
          action: 'USER_EDIT',
          targetType: 'user',
          targetId: target.id,
          meta: { fields },
        },
        target.id,
        tx,
      );
    });
  } catch (error) {
    // Имейлът е зает (уникалният индекс) — нищо не е записано.
    if (isUniqueViolation(error)) return { ok: false, error: 'emailTaken' };
    throw error;
  }
  if (fields.includes('email')) await sendMail(emailChangedMail({ to: target.email }));
  return { ok: true, changed: true };
}
