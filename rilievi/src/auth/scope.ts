import type { Prisma } from '@prisma/client';
import type { SessionUser } from '../types.js';

/**
 * Обхватът на човека: MASTER (собственикът на портала) вижда всички фирми, всеки друг — само своята.
 * Всяка заявка към карти, хора, покани и одит минава оттук; без фирма извън MASTER няма обхват изобщо
 * (CHECK в базата не го допуска — ако все пак се случи, заявката пада, вместо да види всичко).
 */
export type Scope = { all: true } | { all: false; aziendaId: string };

export function scopeOf(user: Pick<SessionUser, 'role' | 'aziendaId'>): Scope {
  if (user.role === 'MASTER') return { all: true };
  if (!user.aziendaId) throw new Error('Акаунт без фирма извън MASTER — отказано.');
  return { all: false, aziendaId: user.aziendaId };
}

/** Фирмата е в обхвата. */
export function inScope(scope: Scope, aziendaId: string | null): boolean {
  return scope.all || scope.aziendaId === aziendaId;
}

/** Условие за Prisma: само редовете на фирмата (за MASTER — всички, или избраната с филтъра). */
export function aziendaWhere(scope: Scope, filter?: string | null): { aziendaId?: string } {
  if (!scope.all) return { aziendaId: scope.aziendaId };
  return filter ? { aziendaId: filter } : {};
}

/** Същото за карта (типизирано за Prisma.SchedaWhereInput). */
export function schedaScope(scope: Scope, filter?: string | null): Prisma.SchedaWhereInput {
  return aziendaWhere(scope, filter);
}
