import 'server-only';
// «Segnala un problema» on the server, apart from the actions: the administrators' list and their e-mail. The list
// crosses companies — it is the platform's, as /app/admin's list of companies — and is read only behind the platform's
// right (the page and the actions check it). The e-mail says that a report arrived, its type and where to read it:
// never its text, which stays in the database (the mails carry nothing typed in a form, mail-templates.ts).
import type { FeedbackKind } from '@prisma/client';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import { mailAccount } from '@/lib/account-mail';
import { prisma } from '@/lib/db';
import { FEEDBACK_PAGE } from '@/lib/feedback';
import { mailConfigured } from '@/lib/mail';

/** The reports, newest first: only those still to handle, or all; with the company and the person who sent them. */
export function listFeedback(filter: 'open' | 'all') {
  return prisma.feedback.findMany({
    where: filter === 'open' ? { handledAt: null } : {},
    orderBy: { createdAt: 'desc' },
    take: FEEDBACK_PAGE,
    // every column of the report (none is the company's secret: it is the platform's list), with who sent it
    include: { company: { select: { name: true } }, user: { select: { name: true, email: true } } },
  });
}

/** How many reports wait to be handled (the admin page's link says it). */
export const openFeedbackCount = (): Promise<number> => prisma.feedback.count({ where: { handledAt: null } });

/** Each active platform administrator gets a short e-mail: a report of this type arrived. Nothing when the mail is off
 *  (the list is there anyway). */
export async function notifyAdmins(kind: FeedbackKind): Promise<number> {
  if (!mailConfigured()) return 0;
  const admins = await prisma.user.findMany({ where: { role: 'SUPERADMIN', active: true }, select: { email: true } });
  for (const a of admins) mailAccount(a.email, DEFAULT_LOCALE, { kind: 'feedback', type: kind });
  return admins.length;
}
