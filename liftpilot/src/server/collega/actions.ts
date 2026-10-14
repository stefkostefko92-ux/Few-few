'use server';
// «Collega a un impianto» and «Scollega» (round 44): plain forms of the survey's page (and «Scollega» of the
// installation's), checked here whatever the page showed — the right 'rilievi:link' (a role that holds it in a read-only
// company is told so), 60 writes a minute per person as the survey sheets', the ids read with zod, the company of the
// session. They end on the page they came from with `?lk=<esito>`, which the link panel turns into its message.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { can, holds } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { schedaIdSchema } from '@/lib/rilievi/inputs';
import { idSchema } from '@/lib/schemas';
import { str } from '../form';
import { collega, scollega } from './service';

/** The message the page shows after an action (messages: collega.flash.<esito>). */
export type Flash = 'linked' | 'unlinked' | 'forbidden' | 'readOnly' | 'tooMany' | 'notFound' | 'projectNotFound';

/** Where the action ends: the survey's page (the link panel), or the installation's (its surveys). */
function back(locale: string, fd: FormData, schedaId: string, projectId: string | null, flash: Flash): never {
  const toProject = str(fd, 'da') === 'impianto' && projectId ? idSchema.safeParse(projectId) : null;
  revalidatePath(`/${locale}/app`, 'layout');
  if (toProject?.success) redirect(`/${locale}/app/projects/${toProject.data}?lk=${flash}#rilievi`);
  redirect(`/${locale}/app/rilievi/${schedaId}?lk=${flash}#collegamento`);
}

/** The signed-in user who may link surveys, or the refusal to show. */
async function actor(fd: FormData) {
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const refusal: Flash | null = user.mustChangePassword ? 'forbidden'
    : !can(user, 'rilievi:link') ? (holds(user, 'rilievi:link') ? 'readOnly' : 'forbidden')
      : !rateLimit(`rilievi:${user.id}`, 60, 60 * 1000) ? 'tooMany' : null;
  return { user, locale, refusal };
}

/** «Collega»: the survey `scheda` to the installation `impianto`. */
export async function collegaRilievoAction(fd: FormData): Promise<void> {
  const { user, locale, refusal } = await actor(fd);
  const scheda = schedaIdSchema.safeParse(str(fd, 'scheda')), impianto = idSchema.safeParse(str(fd, 'impianto'));
  if (!scheda.success) redirect(`/${locale}/app/rilievi`);
  if (refusal) back(locale, fd, scheda.data, null, refusal);
  if (!impianto.success) back(locale, fd, scheda.data, null, 'projectNotFound');
  const esito = await collega(user.companyId, scheda.data, impianto.data, user.id);
  back(locale, fd, scheda.data, null, esito === 'ok' ? 'linked' : esito === 'notFound' ? 'notFound' : 'projectNotFound');
}

/** «Scollega»: the survey `scheda` off its installation. */
export async function scollegaRilievoAction(fd: FormData): Promise<void> {
  const { user, locale, refusal } = await actor(fd);
  const scheda = schedaIdSchema.safeParse(str(fd, 'scheda'));
  if (!scheda.success) redirect(`/${locale}/app/rilievi`);
  const from = str(fd, 'impianto') || null;
  if (refusal) back(locale, fd, scheda.data, from, refusal);
  const r = await scollega(user.companyId, scheda.data, user.id);
  back(locale, fd, scheda.data, r.projectId ?? from, r.esito === 'ok' ? 'unlinked' : 'notFound');
}
