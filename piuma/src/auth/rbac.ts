import type { Role } from '@prisma/client';

/**
 * Седем нива, строго подредени — по-високото число включва по-ниските.
 * Правата се проверяват по СПОСОБНОСТ, не по име на роля, за да не се разпръсват `if role ===`.
 */
export const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 1,
  ANALYST: 2,
  EDITOR: 3,
  REVIEWER: 4,
  MANAGER: 5,
  ADMIN: 6,
  OWNER: 7,
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Собственик',
  ADMIN: 'Администратор',
  MANAGER: 'Мениджър',
  REVIEWER: 'Ревюър',
  EDITOR: 'Редактор',
  ANALYST: 'Аналитик',
  VIEWER: 'Наблюдател',
};

export type Capability =
  | 'dashboard:view'
  | 'posts:view'
  | 'posts:create'
  | 'posts:edit'
  | 'posts:approve'
  | 'posts:schedule'
  | 'posts:publish'
  | 'posts:generate'
  | 'brands:view'
  | 'brands:manage'
  | 'insights:view'
  | 'autopilot:run'
  | 'accounts:view'
  | 'accounts:manage'
  | 'audit:view'
  | 'users:manage'
  | 'keys:manage'
  | 'settings:view';

/** Минималната роля, която има способността. */
const REQUIRED: Record<Capability, Role> = {
  'dashboard:view': 'VIEWER',
  'posts:view': 'VIEWER',
  'brands:view': 'VIEWER',
  'accounts:view': 'VIEWER',
  'audit:view': 'ANALYST',
  'settings:view': 'ANALYST',
  'insights:view': 'ANALYST',
  'posts:create': 'EDITOR',
  'posts:edit': 'EDITOR',
  'posts:generate': 'EDITOR',
  'posts:approve': 'REVIEWER',
  'posts:schedule': 'REVIEWER',
  'posts:publish': 'REVIEWER',
  'brands:manage': 'MANAGER',
  'autopilot:run': 'MANAGER',
  'accounts:manage': 'MANAGER',
  'users:manage': 'ADMIN',
  'keys:manage': 'ADMIN',
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[REQUIRED[capability]];
}

/** Може ли `actor` да управлява потребител с роля `target` (никога равен или по-висок). */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Ролите, които `actor` има право да раздава — само под своята. */
export function assignableRoles(actor: Role): Role[] {
  return (Object.keys(ROLE_LEVEL) as Role[])
    .filter((role) => outranks(actor, role))
    .sort((a, b) => ROLE_LEVEL[b] - ROLE_LEVEL[a]);
}

export const ALL_ROLES: Role[] = (Object.keys(ROLE_LEVEL) as Role[]).sort(
  (a, b) => ROLE_LEVEL[b] - ROLE_LEVEL[a],
);
