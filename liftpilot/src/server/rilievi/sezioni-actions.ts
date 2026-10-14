'use server';
// The company setting «Ordine delle sezioni della scheda» (rilievi's POST /impostazioni/sezioni, commit ae6329cb6): the
// whole order is sent every time (`ordine`, repeated, the movable sections); a section's «up/down» button (`sposta` =
// «funi:su») answers with the new order unsaved — so the page works without JavaScript too —, «Salva ordine» (`salva` =
// '1') saves it, «Ripristina l'ordine predefinito» (`ripristina` = '1') goes back to the default. Only 'company:edit'
// (the owner; the company's read-only mode refuses it), within the company of the session; 30 a minute per person.
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import type { SectionKey } from '@/lib/rilievi/fields';
import { ordineEffettivo, parseMossa, parseOrdine, sposta, type Verso } from '@/lib/rilievi/ordine';
import { str } from '../form';
import { setOrdineSezioni } from './sezioni';
import { prisma } from '@/lib/db';

/** The setting's answer: the order to show (`modificato` — moved, not saved yet; `focus` — the button pressed, to keep
 *  the focus on it), saved or reset (the page shows `rilievi.flash.sezioniSaved|sezioniReset`), or a refusal
 *  (`invalid`: «L'ordine inviato non è valido. Ecco quello salvato: riprova.» with the saved order). */
export type SezioniState =
  | { status: 'idle' }
  | { status: 'moved'; ordine: SectionKey[]; focus: { key: SectionKey; verso: Verso } }
  | { status: 'saved' | 'reset'; ordine: SectionKey[] }
  | { status: 'invalid'; ordine: SectionKey[] }
  | { status: 'error'; error: 'forbidden' | 'tooMany' };

export async function ordineSezioniAction(_prev: SezioniState, fd: FormData): Promise<SezioniState> {
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword || !can(user, 'company:edit')) return { status: 'error', error: 'forbidden' };
  if (!rateLimit(`rilievi-sezioni:${user.id}`, 30, 60 * 1000)) return { status: 'error', error: 'tooMany' };
  const saved = async (): Promise<SectionKey[]> => {
    const row = await prisma.company.findUnique({ where: { id: user.companyId }, select: { ordineSezioni: true } });
    return ordineEffettivo(row?.ordineSezioni ?? []);
  };
  if (str(fd, 'ripristina') === '1') {
    await setOrdineSezioni(user.companyId, user.id, null);
    return { status: 'reset', ordine: ordineEffettivo([]) };
  }
  const ordine = parseOrdine(fd.getAll('ordine'));
  if (!ordine) return { status: 'invalid', ordine: await saved() };
  const mossa = parseMossa(fd.get('sposta'));
  if (mossa) return { status: 'moved', ordine: sposta(ordine, mossa.key, mossa.verso), focus: mossa };
  if (str(fd, 'salva') !== '1') return { status: 'invalid', ordine: await saved() };
  if (!(await setOrdineSezioni(user.companyId, user.id, ordine))) return { status: 'error', error: 'forbidden' };
  return { status: 'saved', ordine };
}
