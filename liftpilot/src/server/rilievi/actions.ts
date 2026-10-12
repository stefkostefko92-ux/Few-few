'use server';
// The survey sheets' writes from the pages, as rilievi's POST routes (src/routes/schede.ts, cestino.ts): the right first
// (can(), the company's read-only mode included), a bounded rate (60 a minute per person, rilievi's writeLimiter), the
// form read as rilievi read it (inputs.ts bodyOf), checked on the server (validation.ts) whatever the browser showed,
// written within the company of the session. On success they redirect with `?ok=<flash key>`; otherwise they answer
// with the state the form shows (action-state.ts). A sheet of another company is "not found".
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import type { RilievoActionState, RilievoFormState } from '@/lib/rilievi/action-state';
import { baseSchema, bodyOf, schedaIdSchema } from '@/lib/rilievi/inputs';
import { withPrefill } from '@/lib/rilievi/ordini/form';
import { formValuesFromBody, parseScheda } from '@/lib/rilievi/validation';
import { str } from '../form';
import { prefillContext } from './pages';
import { getScheda } from './queries';
import { createScheda, purgeScheda, restoreScheda, trashScheda, updateScheda } from './service';

type Refusal = { error: 'forbidden' | 'tooMany' };

/** The signed-in user allowed to `capability`, within the write rate; the anonymous go to the login. */
async function actor(fd: FormData, capability: Capability): Promise<{ user: SessionUser; base: string } | Refusal> {
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword || !can(user, capability)) return { error: 'forbidden' };
  if (!rateLimit(`rilievi:${user.id}`, 60, 60 * 1000)) return { error: 'tooMany' };
  return { user, base: `/${locale}/app/rilievi` };
}

/** The values as sent, to show them again (the modules' prefill only where the form never showed them). */
const sentValues = (user: SessionUser, body: unknown) => withPrefill(formValuesFromBody(body), prefillContext(user));

/** «Salva scheda»: a new sheet of the user's company. */
export async function createRilievoAction(_prev: RilievoFormState, fd: FormData): Promise<RilievoFormState> {
  const a = await actor(fd, 'rilievi:edit');
  if ('error' in a) return { status: 'error', error: a.error };
  const body = bodyOf(fd);
  if (!body) return { status: 'error', error: 'tooLarge' };
  const parsed = parseScheda(body);
  if (!parsed.ok) return { status: 'invalid', values: sentValues(a.user, body), errors: parsed.errors, base: '' };
  const scheda = await createScheda(parsed.data, a.user.id, a.user.companyId);
  redirect(`${a.base}/${scheda.id}?ok=schedaCreated`);
}

/** «Salva modifiche»: the sheet `id`, over the version `base` the form was opened on. */
export async function updateRilievoAction(_prev: RilievoFormState, fd: FormData): Promise<RilievoFormState> {
  const a = await actor(fd, 'rilievi:edit');
  if ('error' in a) return { status: 'error', error: a.error };
  const id = schedaIdSchema.safeParse(str(fd, 'id'));
  const scheda = id.success ? await getScheda(a.user.companyId, id.data) : null;
  if (!id.success || !scheda) return { status: 'error', error: 'notFound' };
  const body = bodyOf(fd);
  if (!body) return { status: 'error', error: 'tooLarge' };
  const sent = baseSchema.safeParse(str(fd, 'base'));
  const base = sent.success ? sent.data : '';
  const parsed = parseScheda(body);
  if (!parsed.ok) return { status: 'invalid', values: sentValues(a.user, body), errors: parsed.errors, base };
  const outcome = await updateScheda(a.user.companyId, scheda.id, base, parsed.data, a.user.id);
  if (outcome === 'missing') return { status: 'error', error: 'notFound' };
  // the input stays on the screen; the person decides after seeing the new version
  if (outcome === 'conflict') return { status: 'conflict', values: sentValues(a.user, body), base: scheda.updatedAt.toISOString() };
  redirect(`${a.base}/${scheda.id}?ok=schedaSaved`);
}

/** «Sposta nel cestino». */
export async function trashRilievoAction(_prev: RilievoActionState, fd: FormData): Promise<RilievoActionState> {
  const a = await actor(fd, 'rilievi:trash');
  if ('error' in a) return a;
  const id = schedaIdSchema.safeParse(str(fd, 'id'));
  if (!id.success || !(await trashScheda(a.user.companyId, id.data, a.user.id))) return { error: 'notFound' };
  redirect(`${a.base}?ok=schedaTrashed`);
}

/** «Ripristina»: back from the trash. */
export async function restoreRilievoAction(_prev: RilievoActionState, fd: FormData): Promise<RilievoActionState> {
  const a = await actor(fd, 'rilievi:trash-manage');
  if ('error' in a) return a;
  const id = schedaIdSchema.safeParse(str(fd, 'id'));
  if (!id.success || !(await restoreScheda(a.user.companyId, id.data, a.user.id))) return { error: 'notFound' };
  redirect(`${a.base}/${id.data}?ok=schedaRestored`);
}

/** «Elimina definitivamente»: only from the trash. */
export async function purgeRilievoAction(_prev: RilievoActionState, fd: FormData): Promise<RilievoActionState> {
  const a = await actor(fd, 'rilievi:trash-manage');
  if ('error' in a) return a;
  const id = schedaIdSchema.safeParse(str(fd, 'id'));
  if (!id.success || !(await purgeScheda(a.user.companyId, id.data, a.user.id))) return { error: 'notFound' };
  redirect(`${a.base}/cestino?ok=schedaPurged`);
}
