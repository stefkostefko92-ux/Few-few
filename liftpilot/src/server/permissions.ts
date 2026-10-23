import 'server-only';
// The company's rights matrix as stored (CompanyRolePermission, round 42): the rows that differ from the default matrix
// and the version the screen was opened on (a hash of the rows: a save on an older version is refused — someone changed
// the matrix in the meantime). Always one company, by its id from the session or, for the platform, from the address.
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { matrixText } from '@/lib/permissions';
import type { Override } from '@/lib/rbac';

type Db = Prisma.TransactionClient | typeof prisma;

/** The company's rows (unknown rights included: rbac.ts ignores them). */
export function companyOverrides(db: Db, companyId: string): Promise<Override[]> {
  return db.companyRolePermission.findMany({ where: { companyId }, select: { role: true, capability: true, granted: true } });
}

/** The version of a matrix: SHA-256 of its rows in a fixed order. */
export const stampOf = (rows: readonly Override[]): string => createHash('sha256').update(matrixText(rows)).digest('hex');

/** The company the matrix belongs to, with its rows and their version; null when there is no such company. */
export async function companyMatrix(companyId: string): Promise<{ id: string; name: string; overrides: Override[]; stamp: string } | null> {
  const [company, overrides] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }),
    companyOverrides(prisma, companyId),
  ]);
  return company ? { ...company, overrides, stamp: stampOf(overrides) } : null;
}
