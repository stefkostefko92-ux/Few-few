import { Prisma, type Role } from '@prisma/client';
import type { SessionUser } from '../types.js';
import { can, isPrivileged, ROLE_LEVEL, type Capability } from './roles.js';

/**
 * Обхватът на човека за една способност. Ролята е различна за всяка фирма (членствата), затова
 * обхватът е множеството фирми, в които ролята му има способността; MASTER — всички фирми. Всяка
 * заявка към карти, хора, покани, одит и лого минава оттук. Празен обхват значи „нищо“, никога „всичко“.
 */
export type Scope = { all: true } | { all: false; aziendaIds: readonly string[] };

export type AccessUser = Pick<SessionUser, 'master' | 'memberships'>;

/** Ролята на човека във фирмата: MASTER навсякъде, иначе от членството (null — не е във фирмата). */
export function roleIn(user: AccessUser, aziendaId: string | null): Role | null {
  if (user.master) return 'MASTER';
  if (!aziendaId) return null;
  return user.memberships.find((m) => m.aziendaId === aziendaId)?.role ?? null;
}

/** Способността във фирмата на конкретен запис (карта, покана, човек). */
export function canIn(user: AccessUser, capability: Capability, aziendaId: string | null): boolean {
  const role = roleIn(user, aziendaId);
  return role !== null && can(role, capability);
}

/** Способността поне в една фирма — за менюто и за входа в страницата; записът се проверява отделно. */
export function canAnywhere(user: AccessUser, capability: Capability): boolean {
  if (user.master) return can('MASTER', capability);
  return user.memberships.some((m) => can(m.role, capability));
}

export function scopeFor(user: AccessUser, capability: Capability): Scope {
  if (user.master) return { all: true };
  return {
    all: false,
    aziendaIds: user.memberships.filter((m) => can(m.role, capability)).map((m) => m.aziendaId),
  };
}

/** Най-високата роля на човека (MASTER, иначе най-силното членство) — за реда и за сесията. */
export function topRole(user: AccessUser): Role | null {
  if (user.master) return 'MASTER';
  let top: Role | null = null;
  for (const { role } of user.memberships) {
    if (top === null || ROLE_LEVEL[role] < ROLE_LEVEL[top]) top = role;
  }
  return top;
}

/** MASTER или ADMIN поне в една фирма раздават най-силните права — сесиите им са по-кратки. */
export function privilegedAccess(user: AccessUser): boolean {
  const top = topRole(user);
  return top !== null && isPrivileged(top);
}

/** Фирмата е в обхвата. */
export function inScope(scope: Scope, aziendaId: string | null): boolean {
  return scope.all || (aziendaId !== null && scope.aziendaIds.includes(aziendaId));
}

/** Повече от една фирма в обхвата: показват се филтърът и колоната „Azienda“. */
export function spansAziende(scope: Scope): boolean {
  return scope.all || scope.aziendaIds.length > 1;
}

/**
 * Условие за Prisma: само редовете на фирмите в обхвата (за MASTER — всички). Филтърът стеснява до една
 * фирма; фирма извън обхвата дава празен резултат, не грешка и не „всичко“.
 */
export function aziendaWhere(
  scope: Scope,
  filter?: string | null,
): { aziendaId?: string | { in: string[] } } {
  if (scope.all) return filter ? { aziendaId: filter } : {};
  const ids = filter ? scope.aziendaIds.filter((id) => id === filter) : [...scope.aziendaIds];
  return { aziendaId: { in: ids } };
}

/**
 * Същото за суров SQL (търсачката): null — без условие (MASTER без филтър); 'none' — празен обхват,
 * търсенето не се пуска изобщо (`IN ()` не е валиден SQL, а „без условие“ би било „всичко“).
 */
export function aziendaSql(scope: Scope, filter?: string | null): Prisma.Sql | null | 'none' {
  const where = aziendaWhere(scope, filter).aziendaId;
  if (where === undefined) return null;
  if (typeof where === 'string') return Prisma.sql`"aziendaId" = ${where}`;
  return where.in.length > 0 ? Prisma.sql`"aziendaId" IN (${Prisma.join(where.in)})` : 'none';
}

/** Същото за карта (типизирано за Prisma.SchedaWhereInput). */
export function schedaScope(scope: Scope, filter?: string | null): Prisma.SchedaWhereInput {
  return aziendaWhere(scope, filter);
}
