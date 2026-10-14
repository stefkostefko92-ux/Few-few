// Roles of a company: its owner (Titolare) and the colleagues the owner gives an account to, each with one of four
// roles — Capotecnico (CHIEF_TECHNICIAN), Progettista (ENGINEER), Tecnico (TECHNICIAN), Commerciale (SALES) —, and the
// platform's administrator. Rights are checked by capability, never by comparing role names in the pages. What a
// colleague's role may do starts from the default matrix below; the owner changes it for the company (round 42,
// CompanyRolePermission, src/server/permissions.ts) within hard rules kept here, never editable: the owner always has
// every right of the company; the management of the colleagues, of the rights, of the subscription and the platform are
// never given to a colleague; the company's data only to the Capotecnico. A company without a subscription after its
// trial reads but does not write (readOnly, src/lib/billing.ts).
import type { Role } from '@prisma/client';

/** Rank for who may manage whom: the colleagues are peers, the owner above them, the platform above all. */
export const ROLE_LEVEL: Readonly<Record<Role, number>> = {
  CHIEF_TECHNICIAN: 1,
  ENGINEER: 1,
  TECHNICIAN: 1,
  SALES: 1,
  OWNER: 2,
  SUPERADMIN: 3,
};

/** The roles in the order the screens list them: the owner, the colleagues from the Capotecnico down, the platform. */
export const ROLES: readonly Role[] = ['OWNER', 'CHIEF_TECHNICIAN', 'ENGINEER', 'TECHNICIAN', 'SALES', 'SUPERADMIN'];

/** The roles the owner gives to the colleagues (each takes one slot of the subscription), in the matrix's order. */
export const MEMBER_ROLES: readonly Role[] = ['CHIEF_TECHNICIAN', 'ENGINEER', 'TECHNICIAN', 'SALES'];
export type MemberRole = Exclude<Role, 'OWNER' | 'SUPERADMIN'>;
export const isMemberRole = (r: Role): r is MemberRole => MEMBER_ROLES.includes(r);

export const CAPABILITIES = [
  'rilievi:view', 'rilievi:edit', 'rilievi:trash', 'rilievi:trash-manage',
  'projects:view', 'calc:view', 'impianti:create', 'rilievi:link', 'projects:edit', 'projects:archive',
  'calc:create', 'records:refresh', 'calc:review',
  'progetto:edit', 'drawings:issue',
  'report:download',
  'prices:view', 'prices:edit',
  'audit:view', 'company:edit', 'company:export', 'users:manage', 'permissions:manage', 'billing:manage',
  'platform:admin',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Rights that follow another one and are not set apart: whoever sees the installations sees their calculations and
 *  designs; whoever makes the calculations makes again a record the running engines no longer reproduce. They stay
 *  apart in the code because read-only mode keeps the second and not the first (WRITES). */
const DERIVED: Readonly<Partial<Record<Capability, Capability>>> = { 'calc:view': 'projects:view', 'records:refresh': 'calc:create' };

/** The rights of the matrix: each one a row the owner sets per role (the derived ones and the platform's are not). */
export type MatrixCapability = Exclude<Capability, 'calc:view' | 'records:refresh' | 'platform:admin'>;
export const MATRIX_CAPABILITIES = CAPABILITIES.filter((c): c is MatrixCapability => !(c in DERIVED) && c !== 'platform:admin');
export const isMatrixCapability = (c: string): c is MatrixCapability => (MATRIX_CAPABILITIES as readonly string[]).includes(c);
export const isCapability = (c: unknown): c is Capability => typeof c === 'string' && (CAPABILITIES as readonly string[]).includes(c);

const C = 'CHIEF_TECHNICIAN', E = 'ENGINEER', T = 'TECHNICIAN', S = 'SALES';
type Members = readonly MemberRole[];
const EVERYONE: Members = [C, E, T, S], WORKERS: Members = [C, E, T], DESIGNERS: Members = [C, E], CHIEF: Members = [C], NOBODY: Members = [];

/** The default matrix (decision of 2026-10-14): which colleagues have each right until the company changes it. */
export const DEFAULT_GRANTS: Readonly<Record<MatrixCapability, Members>> = {
  // Rilievi: everyone sees the sheets; everyone but the Commerciale fills them in (supplier modules included); the
  // Progettista and above move one to the trash; the Capotecnico manages the trash
  'rilievi:view': EVERYONE, 'rilievi:edit': WORKERS, 'rilievi:trash': DESIGNERS, 'rilievi:trash-manage': CHIEF,
  // Impianti: everyone sees them; who works on them creates, links a survey, edits the data; the designers archive
  'projects:view': EVERYONE, 'impianti:create': WORKERS, 'rilievi:link': WORKERS, 'projects:edit': WORKERS, 'projects:archive': DESIGNERS,
  // Calcolo argano: made by who works, approved (visto) by the designers
  'calc:create': WORKERS, 'calc:review': DESIGNERS,
  // Progetto: drawn and issued (sets, revisions) by the designers
  'progetto:edit': DESIGNERS, 'drawings:issue': DESIGNERS,
  'report:download': EVERYONE,
  'prices:view': [C, S], 'prices:edit': NOBODY,
  // the company: the activity log also for the Capotecnico; the rest is the owner's
  'audit:view': CHIEF, 'company:edit': NOBODY, 'company:export': NOBODY,
  'users:manage': NOBODY, 'permissions:manage': NOBODY, 'billing:manage': NOBODY,
};

/** Never given to a colleague, whatever the company sets: the owner's management and the platform. */
export const NEVER_GRANTED: ReadonlySet<Capability> = new Set<Capability>(['users:manage', 'permissions:manage', 'billing:manage', 'platform:admin']);
/** Given to a colleague only when the role is the Capotecnico: the company's data. */
export const CHIEF_ONLY: ReadonlySet<Capability> = new Set<Capability>(['company:edit', 'company:export']);

/** Why a role's right cannot be set by the company (the hard rules), or null when it can. */
export function lockOf(role: Role, capability: Capability): 'owner' | 'platform' | 'never' | 'chiefOnly' | null {
  if (role === 'OWNER') return 'owner';
  if (role === 'SUPERADMIN') return 'platform';
  if (NEVER_GRANTED.has(capability) || !isMatrixCapability(capability)) return 'never';
  if (CHIEF_ONLY.has(capability) && role !== 'CHIEF_TECHNICIAN') return 'chiefOnly';
  return null;
}

/** The company may give or take this right of this role. */
export const grantable = (role: Role, capability: Capability): boolean => lockOf(role, capability) === null;

/** A right stands on another one: without it, it is not given (the screens behind it could not be opened). Each
 *  prerequisite is a view, which itself stands on nothing. */
export const REQUIRES: Readonly<Partial<Record<MatrixCapability, readonly MatrixCapability[]>>> = {
  'rilievi:edit': ['rilievi:view'], 'rilievi:trash': ['rilievi:view'], 'rilievi:trash-manage': ['rilievi:view'],
  'impianti:create': ['projects:view'], 'rilievi:link': ['projects:view', 'rilievi:view'], 'projects:edit': ['projects:view'],
  'projects:archive': ['projects:view'], 'calc:create': ['projects:view'], 'calc:review': ['projects:view'],
  'progetto:edit': ['projects:view'], 'drawings:issue': ['projects:view'], 'report:download': ['projects:view'],
  'prices:edit': ['prices:view'],
};

/** A right the company changed for a role (CompanyRolePermission); the capability as stored, checked here. */
export interface Override {
  role: Role;
  capability: string;
  granted: boolean;
}

/** Every right of the company (the owner's), and the platform's on top. */
const COMPANY: ReadonlySet<Capability> = new Set(CAPABILITIES.filter((c) => c !== 'platform:admin'));
const PLATFORM: ReadonlySet<Capability> = new Set(CAPABILITIES);

/** The rights a role's matrix column grants: the default, with the company's changes that the hard rules allow. Before
 *  the prerequisites and the derived rights (what the screen of the matrix shows). */
export function grantsOf(role: MemberRole, overrides: readonly Override[] = []): Set<MatrixCapability> {
  const set = new Set(MATRIX_CAPABILITIES.filter((c) => DEFAULT_GRANTS[c].includes(role)));
  for (const o of overrides) {
    if (o.role !== role || !isMatrixCapability(o.capability) || !grantable(role, o.capability)) continue;
    if (o.granted) set.add(o.capability);
    else set.delete(o.capability);
  }
  return set;
}

/** The effective rights of a role in a company: its column of the matrix, without what lacks its prerequisite, with the
 *  derived rights. The owner has every right of the company, the platform every right, whatever is stored. */
export function capsOf(role: Role, overrides: readonly Override[] = []): ReadonlySet<Capability> {
  if (role === 'SUPERADMIN') return PLATFORM;
  if (role === 'OWNER') return COMPANY;
  const granted = grantsOf(role, overrides);
  for (const c of [...granted]) if (REQUIRES[c]?.some((r) => !granted.has(r))) granted.delete(c);
  const out = new Set<Capability>(granted);
  for (const [derived, from] of Object.entries(DERIVED) as [Capability, Capability][]) if (out.has(from)) out.add(derived);
  return out;
}

const DEFAULT_CAPS = Object.fromEntries(ROLES.map((r) => [r, capsOf(r)])) as Readonly<Record<Role, ReadonlySet<Capability>>>;

/** What a company in read-only mode (no subscription after its trial, or the terms in force not accepted by its owner)
 *  may not do: it keeps reading, downloading, exporting its data, managing its colleagues and their rights and paying or
 *  cancelling. It also keeps making a record again with the running engines from what was entered ('records:refresh'):
 *  no new work, but the only way to the documents of a record the engines no longer reproduce (terms art. 10, Data Act
 *  art. 25). */
const WRITES: ReadonlySet<Capability> = new Set<Capability>(['impianti:create', 'rilievi:link', 'projects:edit', 'projects:archive',
  'calc:create', 'calc:review', 'progetto:edit', 'drawings:issue', 'prices:edit', 'company:edit',
  // the survey sheets: read-only is view only — not even the trash, which exists to restore or delete
  'rilievi:edit', 'rilievi:trash', 'rilievi:trash-manage']);

/** Who asks: a role, or a signed-in user with the company's state (read only without a subscription) and the rights
 *  resolved once for the request (src/lib/auth.ts); without them, the role's default rights. */
export interface Principal {
  role: Role;
  readOnly?: boolean;
  caps?: ReadonlySet<Capability>;
}

export const isRole = (x: unknown): x is Role => typeof x === 'string' && Object.prototype.hasOwnProperty.call(ROLE_LEVEL, x);

/** The role has the right in the company, whatever the subscription: can() without read-only mode. Only for what
 *  read-only mode keeps by rule (making a record again: remakes()); every other check is can(). */
export function holds(who: Role | Principal, capability: Capability): boolean {
  const p: Principal = typeof who === 'string' ? { role: who } : who;
  return (p.caps ?? DEFAULT_CAPS[p.role]).has(capability);
}

export function can(who: Role | Principal, capability: Capability): boolean {
  const p: Principal = typeof who === 'string' ? { role: who } : who;
  return holds(p, capability) && !(p.readOnly && WRITES.has(capability));
}

/** Who makes a saved record again with the running engines (src/server/refresh-actions.ts; read-only mode too): a
 *  replacement's calculation, whoever makes the calculations; a lift design (with its shaft design and calculation) or a
 *  machine room — records of the Progetto — only whoever also draws the project, the role holding 'progetto:edit'. */
export function remakes(who: Role | Principal, record: 'calc' | 'lift' | 'room'): boolean {
  return can(who, 'records:refresh') && (record === 'calc' || holds(who, 'progetto:edit'));
}

/** The row of the matrix that gives a right: itself, or the one a derived right follows; null for the platform's. */
export function matrixRightOf(capability: Capability): MatrixCapability | null {
  const c = DERIVED[capability] ?? capability;
  return isMatrixCapability(c) ? c : null;
}

/** `actor` may manage a user (or the rights of a role) `target` only when strictly above it. */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Roles `actor` may give: the colleagues' four, to whoever manages users; never OWNER or SUPERADMIN from the team. */
export function assignableRoles(actor: Role): Role[] {
  return can(actor, 'users:manage') ? [...MEMBER_ROLES] : [];
}

/** The roles whose rights `actor` may set: the colleagues', strictly below whoever manages the rights. */
export function editableRoles(actor: Role | Principal): MemberRole[] {
  const role = typeof actor === 'string' ? actor : actor.role;
  return can(actor, 'permissions:manage') ? MEMBER_ROLES.filter((r): r is MemberRole => isMemberRole(r) && outranks(role, r)) : [];
}

/** The right of a module's one form: the replacement's calculator, a whole project's /progetto. Creating an installation
 *  ('impianti:create') does not bring it: whoever creates one without it lands on the installation's page. */
export const formRightOf = (kind: 'REPLACEMENT' | 'FULL'): Capability => (kind === 'REPLACEMENT' ? 'calc:create' : 'progetto:edit');

/** Where a user's work starts: the installations, else the survey sheets, else the account (rights taken away). */
export function homeOf(who: Role | Principal): '/app' | '/app/rilievi' | '/app/account' {
  return can(who, 'projects:view') ? '/app' : can(who, 'rilievi:view') ? '/app/rilievi' : '/app/account';
}
