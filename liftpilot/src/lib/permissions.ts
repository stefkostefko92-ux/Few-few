// The matrix of the rights as the company edits it (round 42, /app/permessi): the rows in their groups, the input the
// server takes (a column of granted rights per colleague role), and what a save changes — the rows to keep (only where
// the company differs from the default matrix) and each change for the activity log. Pure: the screen and the server
// share it; the hard rules are rbac.ts's.
import { z } from 'zod';
import {
  DEFAULT_GRANTS, MATRIX_CAPABILITIES, MEMBER_ROLES, REQUIRES, grantable, grantsOf, isMemberRole,
  type MatrixCapability, type MemberRole, type Override,
} from './rbac';
import { idSchema } from './schemas';

export type PermissionGroup = 'rilievi' | 'impianti' | 'calcolo' | 'progetto' | 'documenti' | 'prezzi' | 'azienda';

/** The rows of the matrix in their groups, in the order of the screen (each right once). */
export const PERMISSION_GROUPS: readonly { key: PermissionGroup; rows: readonly MatrixCapability[] }[] = [
  { key: 'rilievi', rows: ['rilievi:view', 'rilievi:edit', 'rilievi:trash', 'rilievi:trash-manage'] },
  { key: 'impianti', rows: ['projects:view', 'impianti:create', 'rilievi:link', 'projects:edit', 'projects:archive'] },
  { key: 'calcolo', rows: ['calc:create', 'calc:review'] },
  { key: 'progetto', rows: ['progetto:edit', 'drawings:issue'] },
  { key: 'documenti', rows: ['report:download'] },
  { key: 'prezzi', rows: ['prices:view', 'prices:edit'] },
  { key: 'azienda', rows: ['audit:view', 'company:edit', 'company:export', 'users:manage', 'permissions:manage', 'billing:manage'] },
];

/** The member roles in the matrix's order. */
export const MATRIX_ROLES = MEMBER_ROLES.filter(isMemberRole);

/** A column of the matrix: the rights granted to each colleague role. */
export type Grants = Record<MemberRole, MatrixCapability[]>;

/** The default column of a role (what «Ripristina predefiniti» puts back). */
export const defaultColumn = (role: MemberRole): MatrixCapability[] => MATRIX_CAPABILITIES.filter((c) => DEFAULT_GRANTS[c].includes(role));

/** A column without the rights that lack their prerequisite (what the screen keeps by itself; a form sent by hand may
 *  not): what is stored is what the colleagues get. */
export const standing = (col: readonly MatrixCapability[]): MatrixCapability[] =>
  col.filter((c) => !REQUIRES[c]?.some((r) => !col.includes(r)));

/** The columns as the company has them now (default with its changes, without a right whose prerequisite is not there —
 *  as rbac.ts capsOf grants them, so a box is ticked only for a right the role really has), in the matrix's order. */
export function columnsOf(overrides: readonly Override[]): Grants {
  return Object.fromEntries(MATRIX_ROLES.map((r) => {
    const g = grantsOf(r, overrides);
    return [r, standing(MATRIX_CAPABILITIES.filter((c) => g.has(c)))];
  })) as Grants;
}

/** The colleague roles whose column the company changed from the default matrix. */
export const changedRoles = (overrides: readonly Override[]): MemberRole[] => {
  const cols = columnsOf(overrides);
  return MATRIX_ROLES.filter((r) => cols[r].join() !== defaultColumn(r).join());
};

/** The rights that stand on `capability` (they go when it goes). */
export const dependentsOf = (capability: MatrixCapability): MatrixCapability[] =>
  MATRIX_CAPABILITIES.filter((c) => REQUIRES[c]?.includes(capability));

/** A box ticked or cleared on the screen, with what follows: a right ticked brings its prerequisites, a right cleared
 *  takes away what stands on it; a right the hard rules lock does not move. */
export function toggle(column: readonly MatrixCapability[], role: MemberRole, capability: MatrixCapability, on: boolean): MatrixCapability[] {
  if (!grantable(role, capability)) return [...column];
  const set = new Set(column);
  if (on) for (const c of [capability, ...(REQUIRES[capability] ?? [])]) { if (grantable(role, c)) set.add(c); }
  else for (const c of [capability, ...dependentsOf(capability)]) set.delete(c);
  return MATRIX_CAPABILITIES.filter((c) => set.has(c));
}

const column = z.array(z.enum(MATRIX_CAPABILITIES as unknown as [MatrixCapability, ...MatrixCapability[]])).max(MATRIX_CAPABILITIES.length);

/** What the screen sends: the company, the version of the matrix it was opened on, every colleague role's column. A
 *  right the hard rules lock in a column is a forged input, refused. */
export const permissionsInputSchema = z.object({
  companyId: idSchema,
  stamp: z.string().regex(/^[0-9a-f]{64}$/),
  grants: z.object({ CHIEF_TECHNICIAN: column, ENGINEER: column, TECHNICIAN: column, SALES: column }).strict(),
}).superRefine((v, ctx) => {
  for (const role of MATRIX_ROLES) {
    for (const c of v.grants[role]) if (!grantable(role, c)) ctx.addIssue({ code: 'custom', path: ['grants', role], message: 'locked' });
  }
});
export type PermissionsInput = z.infer<typeof permissionsInputSchema>;

/** One right of one role changed by a save (PERMISSIONS_CHANGED in the activity log). */
export interface PermissionChange {
  role: MemberRole;
  capability: MatrixCapability;
  from: boolean;
  to: boolean;
}

/** A save: the rows the company keeps afterwards (only where it differs from the default matrix) and each change from
 *  what it has now. A locked right never makes a row. */
export function planSave(current: readonly Override[], wanted: Grants): { rows: Override[]; changes: PermissionChange[] } {
  const now = columnsOf(current), rows: Override[] = [], changes: PermissionChange[] = [];
  for (const role of MATRIX_ROLES) {
    const want = new Set(standing(wanted[role])), had = new Set(now[role]);
    for (const c of MATRIX_CAPABILITIES) {
      if (!grantable(role, c)) continue;
      const to = want.has(c), from = had.has(c);
      if (to !== DEFAULT_GRANTS[c].includes(role)) rows.push({ role, capability: c, granted: to });
      if (to !== from) changes.push({ role, capability: c, from, to });
    }
  }
  return { rows, changes };
}

/** The version of a company's matrix: its rows in a fixed order (hashed by the server, src/server/permissions.ts). */
export const matrixText = (rows: readonly Override[]): string =>
  rows.map((r) => `${r.role}|${r.capability}|${r.granted ? 1 : 0}`).sort().join('\n');

/** What the screen changed from the saved columns: each right of each role whose box moved (the dialog lists them). */
export function columnChanges(from: Grants, to: Grants): PermissionChange[] {
  const out: PermissionChange[] = [];
  for (const role of MATRIX_ROLES) {
    for (const c of MATRIX_CAPABILITIES) {
      const a = from[role].includes(c), b = to[role].includes(c);
      if (a !== b) out.push({ role, capability: c, from: a, to: b });
    }
  }
  return out;
}
