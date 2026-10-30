import 'server-only';
import { prisma } from './db';
import { UNCONFIRMED_DAYS } from './legal';
import { purgeInactive } from './inactive';
import { BETA_INVITE_KEEP_DAYS } from './token-shape';
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
// - The beta invitations never used, BETA_INVITE_KEEP_DAYS after their link ended, and the used ones whose company is
//   gone (src/lib/beta-invites.ts): the address and the administrator's note are kept no longer than the invitation's
//   e-mail says. Every path that deletes a company deletes its invitations in the same transaction; this catches the rest.
// - The reports of «Segnala un problema» handled more than FEEDBACK_KEEP_MONTHS ago (src/server/feedback-actions.ts).
const EVERY_MS = 6 * 3600_000, DAY_MS = 24 * 3600_000;

/** Months a handled report is kept after the administrator marked it handled. */
export const FEEDBACK_KEEP_MONTHS = 24;

/** The reports handled before this moment go. */
export function feedbackCutoff(now: Date): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - FEEDBACK_KEEP_MONTHS);
  return d;
}
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
        // the company left without users goes, with its beta invitations
        prisma.betaInvite.deleteMany({ where: { companyId: u.companyId, company: { users: { none: {} } } } }),
        prisma.company.deleteMany({ where: { id: u.companyId, users: { none: {} } } }),
      ]);
    }
    const registrations = await prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lte: at } } });
    const invites = await prisma.invite.deleteMany({ where: { expiresAt: { lte: at } } });
    const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lte: at } } });
    const companies = await purgeInactive(at);
    const betaInvites = await prisma.betaInvite.deleteMany({ where: { OR: [
      { usedAt: null, expiresAt: { lte: new Date(now - BETA_INVITE_KEEP_DAYS * DAY_MS) } },
      { usedAt: { not: null }, companyId: null },
    ] } });
    const reports = await prisma.feedback.deleteMany({ where: { handledAt: { lt: feedbackCutoff(at) } } });
    if (stale.length || registrations.count || invites.count || sessions.count || companies.told || companies.deleted || betaInvites.count || reports.count) {
      log.info({ accounts: stale.length, registrations: registrations.count, invites: invites.count, sessions: sessions.count,
        inactiveTold: companies.told, inactiveDeleted: companies.deleted, betaInvites: betaInvites.count, reports: reports.count }, 'stale records deleted');
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'purge of stale records failed');
  }
}
