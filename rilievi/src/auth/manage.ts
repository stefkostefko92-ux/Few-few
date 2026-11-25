import type { Role } from '@prisma/client';
import { outranks } from './roles.js';
import { canIn, roleIn, type AccessUser } from './scope.js';

/**
 * Кой управлява кой човек — ЕДНО място, без база (тества се само). Ролята е различна за всяка фирма,
 * а акаунтът (име, имейл, парола, достъп) е общ за всичките фирми на човека.
 */

export type Actor = AccessUser & { id: string };

/** Човекът, над когото се действа: флагът и ВСИЧКИТЕ му членства (и тези в деактивирани фирми). */
export interface Target {
  id: string;
  master: boolean;
  memberships: ReadonlyArray<{ aziendaId: string; role: Role }>;
}

/**
 * Членството на човека във фирмата (ролята му в нея): MASTER — всяко; иначе само с `users:manage` в
 * същата фирма и само над по-ниска роля в нея. Себе си — никога; MASTER членства няма.
 */
export function canManageMembership(actor: Actor, target: Target, aziendaId: string): boolean {
  const membership = target.memberships.find((m) => m.aziendaId === aziendaId);
  if (!membership || target.master) return false;
  if (actor.master) return true;
  if (actor.id === target.id || !canIn(actor, 'users:manage', aziendaId)) return false;
  const own = roleIn(actor, aziendaId);
  return own !== null && outranks(own, membership.role);
}

/**
 * Акаунтът важи във всичките фирми на човека: MASTER управлява всеки акаунт извън MASTER, и своя (името;
 * имейла — с паролата си, services/users.ts); администратор — само ако управлява членството му във ВСЯКА
 * негова фирма. Иначе промяната би стигнала до фирма, която не е негова. Друг MASTER — никой: откраднатата
 * сесия на един не поема акаунта на другия (одит, 4 ноември 2026).
 */
export function canManageAccount(actor: Actor, target: Target): boolean {
  if (actor.master) return !target.master || actor.id === target.id;
  if (target.master || actor.id === target.id || target.memberships.length === 0) return false;
  return target.memberships.every((m) => canManageMembership(actor, target, m.aziendaId));
}

/** Достъпът (деактивиране) — като акаунта, но никога своя: MASTER не може да изключи себе си. */
export function canSetActive(actor: Actor, target: Target): boolean {
  return actor.id !== target.id && canManageAccount(actor, target);
}

/** Новата роля в членството: под ролята на човека в същата фирма (за MASTER — всичко под MASTER). */
export function canAssignRole(actor: Actor, aziendaId: string, role: Role): boolean {
  const own = roleIn(actor, aziendaId);
  return own !== null && outranks(own, role);
}
