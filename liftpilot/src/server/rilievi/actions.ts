'use server';
// The survey sheets' writes from the pages, as rilievi's POST routes (src/routes/schede.ts, cestino.ts): the right first
// (can(), the company's read-only mode included), a bounded rate (60 a minute per person, rilievi's writeLimiter), the
// form read as rilievi read it (inputs.ts bodyOf), checked on the server (validation.ts) whatever the browser showed,
// written within the company of the session. On success they redirect with `?ok=<flash key>`; otherwise they answer
// with the state the form shows (action-state.ts). A sheet of another company is "not found". When the sheet and the
// suppliers' modules say different things (ordini/collegati.ts), the save waits for the confirmation of exactly those
// differences (rilievi's schede-form.ts controlloDiscrepanze, commit ae6329cb6): the fingerprint sent with «Salva
// comunque», or the one confirmed at the sheet's last save — new or changed differences are asked again.
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, holds, type Capability } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { CONFERMA_KEY, SCHEDA_KEY, type RilievoActionState, type RilievoFormState } from '@/lib/rilievi/action-state';
import { fmt } from '@/lib/rilievi/fmt';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { baseSchema, bodyOf, schedaIdSchema } from '@/lib/rilievi/inputs';
import { discrepanzeDi, improntaDi } from '@/lib/rilievi/ordini/collegati';
import { formValuesFromBody, parseScheda } from '@/lib/rilievi/validation';
import { str } from '../form';
import { formStart } from './pages';
import { getScheda } from './queries';
import { createScheda, purgeScheda, restoreScheda, trashScheda, updateScheda } from './service';

type Refusal = { error: 'forbidden' | 'readOnly' | 'tooMany' };

/** The signed-in user allowed to `capability`, within the write rate; the anonymous go to the login. A role that holds
 *  the right in a company that is read-only (no subscription, terms not accepted) is told so, not sent to the owner for a
 *  right it has (`readOnly`, as /app/permesso tells the two apart). */
async function actor(fd: FormData, capability: Capability): Promise<{ user: SessionUser; base: string } | Refusal> {
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword) return { error: 'forbidden' };
  if (!can(user, capability)) return { error: holds(user, capability) ? 'readOnly' : 'forbidden' };
  if (!rateLimit(`rilievi:${user.id}`, 60, 60 * 1000)) return { error: 'tooMany' };
  return { user, base: `/${locale}/app/rilievi` };
}

/** The values as sent, to show them again (the modules' prefill only where the form never showed them), with the names
 *  still following their source and the discrepancies as they stand. */
const sentBack = (user: SessionUser, body: unknown) => formStart(user, formValuesFromBody(body));

/**
 * The discrepancies on save: their fingerprint (null — none) and whether they still wait for the confirmation. They are
 * confirmed when the `conferma` sent, or the one confirmed at the sheet's last save (`confermate`), is exactly this
 * fingerprint. A forged answer of the sheet («constructor») is no answer (collegati.ts) — never a crash.
 */
function controlloDiscrepanze(body: Record<string, unknown>, confermate: string | null): { impronta: string | null; manca: boolean } {
  const discrepanze = discrepanzeDi(formValuesFromBody(body), rilieviTranslator());
  if (discrepanze.length === 0) return { impronta: null, manca: false };
  const impronta = improntaDi(discrepanze);
  return { impronta, manca: body[CONFERMA_KEY] !== impronta && confermate !== impronta };
}

/** The 'confirm' answer: the form as sent, the discrepancies on top and the fingerprint for «Salva comunque». */
function confirmState(user: SessionUser, body: unknown, base: string): RilievoFormState {
  const back = sentBack(user, body);
  return { status: 'confirm', ...back, base, impronta: improntaDi(back.discrepanze) };
}

/** «Salva scheda»: a new sheet of the user's company. */
export async function createRilievoAction(_prev: RilievoFormState, fd: FormData): Promise<RilievoFormState> {
  const a = await actor(fd, 'rilievi:edit');
  if ('error' in a) return { status: 'error', error: a.error };
  const body = bodyOf(fd);
  if (!body) return { status: 'error', error: 'tooLarge' };
  const parsed = parseScheda(body);
  if (!parsed.ok) return { status: 'invalid', ...sentBack(a.user, body), errors: parsed.errors, base: '' };
  // the sheet and the modules say different things: the save waits for the confirmation of exactly these differences
  const discrepanze = controlloDiscrepanze(body, null);
  if (discrepanze.manca) return confirmState(a.user, body, '');
  const scheda = await createScheda({ ...parsed.data, discrepanzeConfermate: discrepanze.impronta }, a.user.id, a.user.companyId);
  redirect(`${a.base}/${scheda.id}?ok=schedaCreated`);
}

/** «Salva modifiche»: the sheet `scheda`, over the version `base` the form was opened on. */
export async function updateRilievoAction(_prev: RilievoFormState, fd: FormData): Promise<RilievoFormState> {
  const a = await actor(fd, 'rilievi:edit');
  if ('error' in a) return { status: 'error', error: a.error };
  const id = schedaIdSchema.safeParse(str(fd, SCHEDA_KEY));
  const scheda = id.success ? await getScheda(a.user.companyId, id.data) : null;
  if (!id.success || !scheda) return { status: 'error', error: 'notFound' };
  const body = bodyOf(fd);
  if (!body) return { status: 'error', error: 'tooLarge' };
  const sent = baseSchema.safeParse(str(fd, 'base'));
  const base = sent.success ? sent.data : '';
  const parsed = parseScheda(body);
  if (!parsed.ok) return { status: 'invalid', ...sentBack(a.user, body), errors: parsed.errors, base };
  // the differences confirmed at the last save are not asked again — only new or changed ones
  const discrepanze = controlloDiscrepanze(body, scheda.discrepanzeConfermate);
  if (discrepanze.manca) return confirmState(a.user, body, base);
  const outcome = await updateScheda(a.user.companyId, scheda.id, base, { ...parsed.data, discrepanzeConfermate: discrepanze.impronta }, a.user.id);
  if (outcome === 'missing') return { status: 'error', error: 'notFound' };
  // the input stays on the screen; the person decides after seeing the new version — the one read here, before the
  // save, as rilievi read it for the page it drew again (its head names who saved it and when)
  if (outcome === 'conflict') {
    const updated = rilieviTranslator()('scheda.meta.updated', { name: scheda.updatedBy?.name ?? '—', at: fmt.dateTime(scheda.updatedAt) });
    return { status: 'conflict', ...sentBack(a.user, body), base: scheda.updatedAt.toISOString(), updated };
  }
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
