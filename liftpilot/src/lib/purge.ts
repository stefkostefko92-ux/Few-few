import 'server-only';
import { prisma } from './db';
import { UNCONFIRMED_DAYS } from './legal';
import { log } from './log';

// Accounts never confirmed and never used (a self-registration, or a user added by a company who never signed in) go
// after UNCONFIRMED_DAYS, unless one of their links is still alive; a company left without users goes with its last
// one. Called after the answer of a sign-in, a registration or a forgotten-password request, at most every 6 hours
// per process: the work never delays a page and never fails one.
const EVERY_MS = 6 * 3600_000;
let last = 0;

export async function purgeUnconfirmed(): Promise<void> {
  const now = Date.now();
  if (now - last < EVERY_MS) return;
  last = now;
  try {
    const stale = await prisma.user.findMany({
      where: {
        emailVerifiedAt: null, lastLoginAt: null, createdAt: { lt: new Date(now - UNCONFIRMED_DAYS * 24 * 3600_000) },
        authTokens: { none: { expiresAt: { gt: new Date(now) } } },
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
    if (stale.length) log.info({ count: stale.length }, 'unconfirmed accounts deleted');
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'purge of unconfirmed accounts failed');
  }
}
