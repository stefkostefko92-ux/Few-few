import type { Role } from '@prisma/client';

/**
 * Седем нива, строго подредени — по-високото включва по-ниските. CUSTOMER е клиентът; от VIEWER
 * нагоре е персоналът. Правата се проверяват по СПОСОБНОСТ, не по име на роля.
 */
const ROLE_LEVEL: Record<Role, number> = {
  CUSTOMER: 0,
  VIEWER: 1,
  ANALYST: 2,
  SUPPORT: 3,
  MANAGER: 4,
  ADMIN: 5,
  OWNER: 6,
};

export type Capability =
  | 'admin:access'
  | 'accounts:view'
  | 'logins:view'
  | 'audit:view'
  | 'accounts:ban'
  | 'accounts:security'
  | 'requests:handle'
  | 'accounts:plan'
  | 'accounts:edit'
  | 'accounts:create'
  | 'accounts:delete'
  | 'staff:manage';

/** Минималната роля за способността. */
const REQUIRED: Record<Capability, Role> = {
  'admin:access': 'VIEWER',
  'accounts:view': 'VIEWER',
  'logins:view': 'ANALYST',
  'audit:view': 'ANALYST',
  'accounts:ban': 'SUPPORT',
  'accounts:security': 'SUPPORT',
  'requests:handle': 'MANAGER',
  'accounts:plan': 'MANAGER',
  'accounts:edit': 'MANAGER',
  'accounts:create': 'ADMIN',
  'accounts:delete': 'ADMIN',
  'staff:manage': 'ADMIN',
};

export function isStaff(role: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL.VIEWER;
}

export function can(role: Role, capability: Capability): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[REQUIRED[capability]];
}

/** Може ли `actor` да управлява акаунт с роля `target` — никога равен или по-висок. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Всички роли, от най-високата надолу. */
export const ALL_ROLES: readonly Role[] = (Object.keys(ROLE_LEVEL) as Role[]).sort(
  (a, b) => ROLE_LEVEL[b] - ROLE_LEVEL[a],
);

/** Ролите, които `actor` може да раздава — само под своята. */
export function assignableRoles(actor: Role): Role[] {
  return ALL_ROLES.filter((role) => outranks(actor, role));
}

export function isRole(value: unknown): value is Role {
  // Object.hasOwn: `in` би приело и наследени имена като „toString“.
  return typeof value === 'string' && Object.hasOwn(ROLE_LEVEL, value);
}
