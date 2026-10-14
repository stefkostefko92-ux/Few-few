import 'server-only';
import { prisma } from './db';
import { UNCONFIRMED_DAYS } from './legal';
import { purgeInactive } from './inactive';
import { log } from './log';

// What is kept only for a while goes after the answer of a sign-in, a registration or a forgotten-password request, at
// most every 6 hours per process: the work never delays a page and never fails one.
// - Accounts never confirmed and never used (a colleague a company added who never signed in, or a registration from
//   before the registrations waited apart) after UNCONFIRMED_DAYS, once their last link is over: no new link is sent
//   for them after that time (`pastConfirmDeadline`), so signing in again does not keep them; a company left without
//   users goes with its last one.
// - The registrations waiting for their address, with their link (src/lib/registrations.ts).
// - The invitations of colleagues past their end (src/server/user-actions.ts).
// - The sessions past their end (src/lib/auth.ts).
// - The companies inactive without a subscription: their owner told, then the company deleted (src/lib/inactive.ts).
const EVERY_MS = 6 * 3600_000, DAY_MS = 24 * 3600_000;
let last = 0;

/** The account was made more than UNCONFIRMED_DAYS ago: no link confirms it any more. */
export const pastConfirmDeadline = (createdAt: Date, now: number = Date.now()): boolean => now - createdAt.getTime() > UNCONFIRMED_DAYS * DAY_MS;

export async function purgeStale(): Promise<void> {
  const now = Date.now();
  if (now - last < EVERY_MS) return;
  last = now;
  try {
    const at = new Date(now);
    const stale = await prisma.user.findMany({
      where: {
        emailVerifiedAt: null, lastLoginAt: null, createdAt: { lt: new Date(now - UNCONFIRMED_DAYS * DAY_MS) },
        authTokens: { none: { usedAt: null, expiresAt: { gt: at } } },
      },
      select: { id: true, companyId: true },
      take: 100,
    });
    for (const u of stale) {
      await prisma.$transaction([
        prisma.user.deleteMany({ where: { id: u.id, emailVerifiedAt: null, lastLoginAt: null } }),
        prisma.company.deleteMany({ where: { id: u.companyId, users: { none: {} } } }),
      ]);
    }
    const registrations = await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lte: at } } });
    const invites = await prisma.invite.deleteMany({ where: { expiresAt: { lte: at } } });
    const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lte: at } } });
    const companies = await purgeInactive(at);
    if (stale.length || registrations.count || invites.count || sessions.count || companies.told || companies.deleted) {
      log.info({ accounts: stale.length, registrations: registrations.count, invites: invites.count, sessions: sessions.count,
        inactiveTold: companies.told, inactiveDeleted: companies.deleted }, 'stale records deleted');
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'purge of stale records failed');
  }
}
