'use server';

// The company's rights matrix saved (round 42, /app/permessi and, for the platform, /app/admin/permessi/<company>):
// only who manages the rights (the owner; the platform's administrator for any company), only the colleagues' roles
// (below the actor), only what the hard rules let the company set (src/lib/rbac.ts); on the version the screen was
// opened on (else 'conflict': someone changed it meanwhile, nothing is written). The rows and one PERMISSIONS_CHANGED per
// changed right (role, right, before → after, by the owner or the platform) commit together, under the company's lock.
// The new rights apply on the next request of every colleague: the session resolves them each time (src/lib/auth.ts).
import { prisma } from '@/lib/db';
import { auditTx } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { DEFAULT_GRANTS, can, editableRoles } from '@/lib/rbac';
import { permissionsInputSchema, planSave } from '@/lib/permissions';
import { rateLimit } from '@/lib/ratelimit';
import { lockCompany } from './billing';
import { companyOverrides, stampOf } from './permissions';

export type PermissionsResult =
  | { ok: true; changed: number; stamp: string }
  | { ok: false; error: 'unauthorized' | 'forbidden' | 'rateLimited' | 'invalidFields' | 'notFound' | 'conflict' };

const HOUR = 60 * 60 * 1000;

export async function savePermissionsAction(input: unknown): Promise<PermissionsResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user, 'permissions:manage')) return { ok: false, error: 'forbidden' };
  const parsed = permissionsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalidFields' };
  const { companyId, stamp, grants } = parsed.data;
  // the owner sets the company's own matrix; another company's is the platform's (an unknown one reads the same)
  if (companyId !== user.companyId && !can(user, 'platform:admin')) return { ok: false, error: 'notFound' };
  if (!rateLimit(`permissions:${user.id}`, 30, HOUR)) return { ok: false, error: 'rateLimited' };
  const roles = editableRoles(user), by = user.role === 'SUPERADMIN' ? 'platform' : 'owner';
  const out = await prisma.$transaction(async (tx) => {
    await lockCompany(tx, companyId);
    if (!(await tx.company.findUnique({ where: { id: companyId }, select: { id: true } }))) return 'notFound' as const;
    const current = await companyOverrides(tx, companyId);
    if (stampOf(current) !== stamp) return 'conflict' as const;
    const { changes } = planSave(current, grants);
    // never a role at or above the actor's (the matrix has only the colleagues' roles, below the owner)
    if (changes.some((c) => !roles.includes(c.role))) return 'forbidden' as const;
    for (const c of changes) {
      const where = { companyId_role_capability: { companyId, role: c.role, capability: c.capability } };
      // back to the default: no row; else the row says granted or taken away
      if (c.to === DEFAULT_GRANTS[c.capability].includes(c.role)) await tx.companyRolePermission.deleteMany({ where: where.companyId_role_capability });
      else await tx.companyRolePermission.upsert({ where, create: { ...where.companyId_role_capability, granted: c.to, updatedById: user.id }, update: { granted: c.to, updatedById: user.id } });
      await auditTx(tx, {
        companyId, userId: user.id, action: 'PERMISSIONS_CHANGED', entity: 'Permission', entityId: null,
        meta: { role: c.role, capability: c.capability, from: c.from, to: c.to, by },
      });
    }
    return { changed: changes.length, stamp: changes.length ? stampOf(await companyOverrides(tx, companyId)) : stamp };
  });
  return typeof out === 'string' ? { ok: false, error: out } : { ok: true, ...out };
}
