import 'server-only';
import type { SessionUser } from './auth';
import { prisma } from './db';
import { TERMS_VERSION } from './legal';

// The specific approval of the clauses (arts. 1341–1342 c.c.) is signed with the password since round 48: at the
// e-mail link of a registration, and on the terms' page. An owner who accepted the version in force before, with a bare
// tick, has no such approval (User.clausesApprovedAt null): the app asks for it once, without blocking anything — a
// banner (src/components/TermsBanner.tsx) and the short form of the terms' page (src/server/terms-actions.ts
// approveClausesAction). An owner bound by an earlier version approves them when accepting the new one.

/** The signed-in owner still has the clauses of the version in force to approve with the password. */
export async function clausesDue(u: SessionUser): Promise<boolean> {
  if (u.role !== 'OWNER' || u.terms !== 'ok' || u.mustChangePassword) return false;
  const row = await prisma.user.findUnique({ where: { id: u.id }, select: { termsVersion: true, clausesApprovedAt: true } });
  return row?.termsVersion === TERMS_VERSION && row.clausesApprovedAt === null;
}
