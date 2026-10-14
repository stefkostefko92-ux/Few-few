import 'server-only';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from './db';
import { audit } from './audit';
import { publicBaseUrl } from './env';
import { mailConfigured, sendMail } from './mail';
import { accountMail } from './mail-templates';
import { INACTIVE_MONTHS, INACTIVE_NOTICE_DAYS } from './legal';

// A company without a subscription in force where nobody signed in for INACTIVE_MONTHS is deleted with all its data
// (privacy notice, «retention»): its owner is told by e-mail first, and the company goes from the day the e-mail names,
// INACTIVE_NOTICE_DAYS whole days later, if still nobody signed in; a sign-in or a subscription in between keeps it.
// Never the platform's company or one never billed (billingExempt), and never without the e-mail sent: a server without
// mail deletes nothing. Run with the other purges, after the answer of a page (src/lib/purge.ts).

const LIVE = ['active', 'trialing', 'past_due'];
const DAY_MS = 24 * 3600_000;
const BATCH = 20;

const startOfDay = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** The last day a sign-in counts: INACTIVE_MONTHS before `now`. */
export function inactiveCutoff(now: Date): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - INACTIVE_MONTHS);
  return d;
}

/** The day a company told at `noticeAt` may be deleted: the start of the day INACTIVE_NOTICE_DAYS whole days later. */
export const deletionDay = (noticeAt: Date): Date => new Date(startOfDay(noticeAt) + (INACTIVE_NOTICE_DAYS + 1) * DAY_MS);

/** The companies the rule reaches: made before the cutoff, no subscription in force, nobody signed in since. */
const inactive = (cutoff: Date) => ({
  billingExempt: false,
  createdAt: { lt: cutoff },
  OR: [{ subscriptionStatus: null }, { subscriptionStatus: { notIn: LIVE } }],
  users: { none: { OR: [{ role: 'SUPERADMIN' as const }, { lastLoginAt: { gte: cutoff } }] } },
});

export async function purgeInactive(now: Date = new Date()): Promise<{ told: number; deleted: number }> {
  const cutoff = inactiveCutoff(now);
  // a sign-in or a subscription since the e-mail keeps the company
  await prisma.company.updateMany({ where: { inactiveNoticeAt: { not: null }, NOT: inactive(cutoff) }, data: { inactiveNoticeAt: null } });

  let deleted = 0;
  const due = await prisma.company.findMany({
    where: { ...inactive(cutoff), inactiveNoticeAt: { lt: new Date(startOfDay(now) - INACTIVE_NOTICE_DAYS * DAY_MS) } },
    select: { id: true }, take: BATCH,
  });
  for (const { id } of due) {
    const told = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.company.findFirst({ where: { id, ...inactive(cutoff), inactiveNoticeAt: { not: null } }, select: { inactiveNoticeAt: true } });
      if (!row?.inactiveNoticeAt) return null;
      // the users go first (their sessions and links with them; the records keep no author): the company may then go,
      // and its projects, records, drawings, logos, price list and invitations with it
      await tx.auditLog.deleteMany({ where: { companyId: id } });
      await tx.user.deleteMany({ where: { companyId: id } });
      await tx.company.delete({ where: { id } });
      return row.inactiveNoticeAt;
    });
    if (told) {
      deleted += 1;
      // the company's own log went with it: this line keeps when its owner was told
      await audit({ companyId: null, userId: null, action: 'COMPANY_DELETED', entity: 'Company', entityId: id, meta: { reason: 'inactive', told: told.toISOString() } });
    }
  }

  let told = 0;
  if (!mailConfigured()) return { told, deleted };
  const fresh = await prisma.company.findMany({
    where: { ...inactive(cutoff), inactiveNoticeAt: null },
    select: { id: true, users: { where: { role: 'OWNER', active: true, emailVerifiedAt: { not: null } }, select: { email: true, locale: true }, take: 1 } },
    take: BATCH,
  });
  for (const c of fresh) {
    const owner = c.users[0];
    if (!owner) continue; // nobody to tell: the rule never deletes it
    const locale = isLocale(owner.locale) ? owner.locale : DEFAULT_LOCALE;
    // the e-mail first: a company is counted as told only once it went out
    if (!(await sendMail({ to: owner.email, ...accountMail({ kind: 'inactive', deletion: deletionDay(now) }, locale, publicBaseUrl()) }))) continue;
    await prisma.company.update({ where: { id: c.id }, data: { inactiveNoticeAt: now } });
    await audit({ companyId: c.id, userId: null, action: 'INACTIVE_NOTICE_SENT', entity: 'Company', entityId: c.id, meta: { deletion: deletionDay(now).toISOString() } });
    told += 1;
  }
  return { told, deleted };
}
