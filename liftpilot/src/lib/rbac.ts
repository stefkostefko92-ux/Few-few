// Roles of a company: its owner (Titolare) and the colleagues the owner gives an account to, each with one of three
// roles — Progettista (ENGINEER), Commerciale (SALES), Tecnico (TECHNICIAN) —, and the platform's administrator.
// Rights are checked by capability, never by comparing role names in the pages. A company without a subscription
// after its trial reads but does not write (readOnly, src/lib/billing.ts).
import type { Role } from '@prisma/client';

/** Rank for who may manage whom: the colleagues are peers, the owner above them, the platform above all. */
export const ROLE_LEVEL: Readonly<Record<Role, number>> = {
  ENGINEER: 1,
  SALES: 1,
  TECHNICIAN: 1,
  OWNER: 2,
  SUPERADMIN: 3,
};

/** The roles in the order the screens list them. */
export const ROLES: readonly Role[] = ['ENGINEER', 'SALES', 'TECHNICIAN', 'OWNER', 'SUPERADMIN'];

/** The roles the owner gives to the colleagues (each takes one slot of the subscription). */
export const MEMBER_ROLES: readonly Role[] = ['ENGINEER', 'SALES', 'TECHNICIAN'];

export type Capability =
  | 'projects:view'
  | 'calc:view'
  | 'report:download'
  | 'projects:edit'
  | 'calc:create'
  | 'calc:review'
  | 'projects:archive'
  | 'prices:view'
  | 'prices:edit'
  | 'audit:view'
  | 'users:manage'
  | 'billing:manage'
  | 'company:edit'
  | 'company:export'
  | 'platform:admin';

const READ: readonly Capability[] = ['projects:view', 'calc:view', 'report:download'];
const WORK: readonly Capability[] = [...READ, 'projects:edit', 'calc:create'];
const OWNER: readonly Capability[] = [...WORK, 'calc:review', 'projects:archive', 'prices:view', 'prices:edit', 'audit:view', 'users:manage',
  'billing:manage', 'company:edit', 'company:export'];

/** What each role may do: the Commerciale sees, downloads and sees the prices; the Tecnico also edits the projects and
 *  makes the calculations; the Progettista also reviews them and archives projects; the owner everything of the company. */
const CAPS: Readonly<Record<Role, ReadonlySet<Capability>>> = {
  SALES: new Set([...READ, 'prices:view']),
  TECHNICIAN: new Set(WORK),
  ENGINEER: new Set([...WORK, 'calc:review', 'projects:archive']),
  OWNER: new Set(OWNER),
  SUPERADMIN: new Set([...OWNER, 'platform:admin']),
};

/** What a company in read-only mode (no subscription after its trial, or the terms in force not accepted by its owner)
 *  may not do: it keeps reading, downloading, exporting its data, managing its colleagues and paying or cancelling. */
const WRITES: ReadonlySet<Capability> = new Set(['projects:edit', 'calc:create', 'calc:review', 'projects:archive', 'prices:edit', 'company:edit']);

/** Who asks: a role, or a signed-in user with the company's state (read only without a subscription). */
export interface Principal {
  role: Role;
  readOnly?: boolean;
}

export const isRole = (x: unknown): x is Role => typeof x === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LEVEL, x);

export function can(who: Role | Principal, capability: Capability): boolean {
  const p: Principal = typeof who === 'string' ? { role: who } : who;
  return CAPS[p.role].has(capability) && !(p.readOnly && WRITES.has(capability));
}

/** `actor` may manage a user with role `target` only when strictly above it. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Roles `actor` may give: the colleagues' three, to whoever manages users; never OWNER or SUPERADMIN from the team. */
export function assignableRoles(actor: Role): Role[] {
  return can(actor, 'users:manage') ? [...MEMBER_ROLES] : [];
}
