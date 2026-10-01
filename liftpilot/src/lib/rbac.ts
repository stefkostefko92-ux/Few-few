// Seven roles, strictly ordered: a higher level includes the lower ones. Rights are checked by capability,
// never by comparing role names in the pages.
import type { Role } from '@prisma/client';

export const ROLE_LEVEL: Readonly<Record<Role, number>> = {
  VIEWER: 1,
  TECHNICIAN: 2,
  ENGINEER: 3,
  MANAGER: 4,
  ADMIN: 5,
  OWNER: 6,
  SUPERADMIN: 7,
};

export const ROLES: readonly Role[] = (Object.keys(ROLE_LEVEL) as Role[]).sort((a, b) => ROLE_LEVEL[a] - ROLE_LEVEL[b]);

export type Capability =
  | 'projects:view'
  | 'calc:view'
  | 'report:download'
  | 'projects:edit'
  | 'calc:create'
  | 'calc:review'
  | 'projects:archive'
  | 'audit:view'
  | 'users:manage'
  | 'company:edit'
  | 'platform:admin';

/** The lowest role that has the capability. */
const REQUIRED: Readonly<Record<Capability, Role>> = {
  'projects:view': 'VIEWER',
  'calc:view': 'VIEWER',
  'report:download': 'VIEWER',
  'projects:edit': 'TECHNICIAN',
  'calc:create': 'TECHNICIAN',
  'calc:review': 'ENGINEER',
  'projects:archive': 'MANAGER',
  'audit:view': 'MANAGER',
  'users:manage': 'ADMIN',
  'company:edit': 'OWNER',
  'platform:admin': 'SUPERADMIN',
};

export const isRole = (x: unknown): x is Role => typeof x === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LEVEL, x);

export function can(role: Role, capability: Capability): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[REQUIRED[capability]];
}

/** `actor` may manage a user with role `target` only when strictly above it. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Roles `actor` may give: those below its own; SUPERADMIN is never given from the interface. */
export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((r) => r !== 'SUPERADMIN' && ROLE_LEVEL[r] < ROLE_LEVEL[actor]);
}
