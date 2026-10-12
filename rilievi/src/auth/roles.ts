import type { Role } from '@prisma/client';

/**
 * Седем нива както в ERP Ascensori: MASTER(1) > ADMIN(2) > DIREZIONE(3) > RESPONSABILE(4) >
 * TECNICO(5) > OPERATORE(6) > CLIENTE(7). По-малкото число включва правата на по-голямото.
 * Правата се проверяват по СПОСОБНОСТ, не по име на роля — и винаги на сървъра.
 */
export const ROLE_LEVEL: Readonly<Record<Role, number>> = {
  MASTER: 1,
  ADMIN: 2,
  DIREZIONE: 3,
  RESPONSABILE: 4,
  TECNICO: 5,
  OPERATORE: 6,
  CLIENTE: 7,
};

export type Capability =
  'schede:read' | 'schede:write' | 'schede:delete' | 'schede:trash' | 'users:manage' | 'audit:view';

/** Най-ниската роля (най-голямото число), която още има способността. */
const REQUIRED: Readonly<Record<Capability, Role>> = {
  'schede:read': 'CLIENTE',
  'schede:write': 'OPERATORE',
  'schede:delete': 'RESPONSABILE',
  'schede:trash': 'ADMIN',
  // Канят и управляват само хора под своя ранг (outranks) — RESPONSABILE кани техници и оператори.
  'users:manage': 'RESPONSABILE',
  'audit:view': 'ADMIN',
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_LEVEL[role] <= ROLE_LEVEL[REQUIRED[capability]];
}

/** Може ли `actor` да управлява акаунт с роля `target` — никога равен или по-висок. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] < ROLE_LEVEL[target];
}

/** Всички роли, от най-високата (MASTER) надолу. */
export const ALL_ROLES: readonly Role[] = (Object.keys(ROLE_LEVEL) as Role[]).sort(
  (a, b) => ROLE_LEVEL[a] - ROLE_LEVEL[b],
);

/** Ролите, които `actor` може да раздава — само под своята. MASTER не се създава с покана. */
export function assignableRoles(actor: Role): Role[] {
  return ALL_ROLES.filter((role) => outranks(actor, role));
}

export function isRole(value: unknown): value is Role {
  // Object.hasOwn: `in` би приело и наследени имена като „toString“.
  return typeof value === 'string' && Object.hasOwn(ROLE_LEVEL, value);
}

/** MASTER и ADMIN раздават най-силните права — сесиите им са по-кратки (sessions.ts). */
export function isPrivileged(role: Role): boolean {
  return ROLE_LEVEL[role] <= ROLE_LEVEL.ADMIN;
}
