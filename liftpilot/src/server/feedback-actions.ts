'use server';
// «Segnala un problema» (/app/segnala): any signed-in user — also in a company that is read-only, also a role with few
// rights — sends a report to LiftPilot. The company and the user are the session's, never the form's; the kind, the
// message, the page and the error code are checked (zod, src/lib/feedback.ts); at most FEEDBACK_PER_HOUR reports an hour
// per person. One row in the company's activity log, without the text; then, after the answer, a short e-mail to every
// platform administrator — that a report arrived, its type, the way to the list; never the text. The administrators
// mark a report handled or open it again (/app/admin/segnalazioni), only with the platform's right.
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { FEEDBACK_PER_HOUR, feedbackSchema, type FeedbackState } from '@/lib/feedback';
import { log } from '@/lib/log';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { idSchema } from '@/lib/schemas';
import { str } from './form';
import { notifyAdmins } from './feedback';

const HOUR = 60 * 60 * 1000;

export async function sendFeedbackAction(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const values = { kind: str(fd, 'kind'), message: str(fd, 'message') };
  const user = await getSessionUser();
  // the session expired while the message was typed: it stays on the screen; sign in again in another tab, send again
  if (!user) return { status: 'error', error: 'sessionExpired', values };
  if (user.mustChangePassword) return { status: 'error', error: 'forbidden', values };
  const parsed = feedbackSchema.safeParse({ kind: values.kind, message: values.message, page: str(fd, 'page'), digest: str(fd, 'digest') });
  if (!parsed.success) {
    return { status: 'error', error: 'invalid', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))], values };
  }
  if (!rateLimit(`feedback:${user.id}`, FEEDBACK_PER_HOUR, HOUR)) return { status: 'error', error: 'rateLimited', values };
  const { kind, message, page, digest } = parsed.data;
  const row = await prisma.feedback.create({ data: { companyId: user.companyId, userId: user.id, kind, page, digest, message }, select: { id: true } });
  // the log keeps that a report went and its kind, never what it says
  await audit({ companyId: user.companyId, userId: user.id, action: 'FEEDBACK_SENT', entity: 'Feedback', entityId: row.id, meta: { kind } });
  after(async () => {
    try {
      await notifyAdmins(kind);
    } catch (err) {
      log.error({ err }, 'feedback notice not sent');
    }
  });
  return { status: 'sent' };
}

/** «Segna come gestita» / «Riapri»: the platform administrator only. */
export async function setFeedbackHandledAction(fd: FormData): Promise<void> {
  const me = await getSessionUser();
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || me.mustChangePassword || !can(me, 'platform:admin') || !id.success) return;
  const handled = str(fd, 'handled') === '1';
  const done = await prisma.feedback.updateMany({ where: { id: id.data, handledAt: handled ? null : { not: null } }, data: { handledAt: handled ? new Date() : null } });
  if (done.count) {
    await audit({ companyId: me.companyId, userId: me.id, action: handled ? 'FEEDBACK_HANDLED' : 'FEEDBACK_REOPENED', entity: 'Feedback', entityId: id.data });
  }
  const l = str(fd, 'locale');
  revalidatePath(`/${isLocale(l) ? l : DEFAULT_LOCALE}/app/admin/segnalazioni`);
}
