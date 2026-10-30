'use server';
// The company setting «Ordine delle sezioni della scheda» (rilievi's POST /impostazioni/sezioni, commit 988f3cf37): the
// whole order is sent every time (`ordine`, repeated, the movable sections); a section's «up/down» button (`sposta` =
// «funi:su») answers with the new order unsaved — so the page works without JavaScript too —, «Salva ordine» (`salva` =
// '1') saves it, «Ripristina l'ordine predefinito» (`ripristina` = '1') goes back to the default. Only 'company:edit'
// (the owner; the Capotecnico when the company gives it — round 42), within the company of the session; a role holding it
// in a read-only company is told so (`readOnly`, as the sheets' actions), not sent to the owner for a right it has; 60
// a minute per person, as rilievi's own limit on every write (src/http/limits.ts `writeLimiter`): a section moved to the
// far end one step at a time takes up to ten presses. A refusal — no right, read-only, over the limit, the session
// expired while the page was open (`sessionExpired`: sign in again in another tab, then press again) — does nothing and
// the order on screen stays, unsaved moves included.
import { getSessionUser } from '@/lib/auth';
import { can, holds } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import type { SectionKey } from '@/lib/rilievi/fields';
import { ordineEffettivo, parseMossa, parseOrdine, sposta, type Verso } from '@/lib/rilievi/ordine';
import { str } from '../form';
import { setOrdineSezioni } from './sezioni';
import { prisma } from '@/lib/db';

/** The setting's answer: the order to show (`moved` — moved, not saved yet; `focus` — the button pressed, to keep the
 *  focus on it), saved or reset (the page shows `rilievi.flash.sezioniSaved|sezioniReset`), or a refusal (`invalid`:
 *  «L’ordine inviato non è valido. Ecco quello salvato: riprova.» with the saved order; `forbidden`, `readOnly` and
 *  `tooMany` with the order that was on screen, `modificato` when it holds moves not saved yet). */
export type SezioniState =
  | { status: 'idle' }
  | { status: 'moved'; ordine: SectionKey[]; focus: { key: SectionKey; verso: Verso } }
  | { status: 'saved' | 'reset'; ordine: SectionKey[] }
  | { status: 'invalid'; ordine: SectionKey[] }
  | { status: 'error'; error: SezioniRefusal; ordine?: SectionKey[]; modificato?: boolean };

/** Why nothing was done: the server's refusals; `offline` and `failed` are the browser's own, when no answer came
 *  (src/components/keep-on-failure.ts). */
type SezioniRefusal = 'forbidden' | 'readOnly' | 'tooMany' | 'sessionExpired' | 'offline' | 'failed';

/** What the page showed before this press (the previous answer, as the browser hands it back — only for the screen,
 *  checked like a sent order): its order, and whether it held moves not saved yet. */
function shownBefore(prev: unknown): { ordine: SectionKey[] | null; modificato: boolean } {
  if (typeof prev !== 'object' || prev === null) return { ordine: null, modificato: false };
  const p = prev as { status?: unknown; ordine?: unknown; modificato?: unknown };
  return { ordine: parseOrdine(p.ordine), modificato: p.status === 'moved' || (p.status === 'error' && p.modificato === true) };
}

/** A refusal: nothing done, the order on screen stays — the one sent with the press, or (the reset form sends none) the
 *  one shown before —, with its unsaved moves. */
function refused(error: SezioniRefusal, prev: unknown, fd: FormData): SezioniState {
  const before = shownBefore(prev);
  const ordine = parseOrdine(fd.getAll('ordine')) ?? before.ordine;
  return ordine ? { status: 'error', error, ordine, modificato: before.modificato } : { status: 'error', error };
}

export async function ordineSezioniAction(prev: SezioniState, fd: FormData): Promise<SezioniState> {
  const user = await getSessionUser();
  if (!user) return refused('sessionExpired', prev, fd);
  if (user.mustChangePassword) return refused('forbidden', prev, fd);
  if (!can(user, 'company:edit')) return refused(holds(user, 'company:edit') ? 'readOnly' : 'forbidden', prev, fd);
  if (!rateLimit(`rilievi-sezioni:${user.id}`, 60, 60 * 1000)) return refused('tooMany', prev, fd);
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
  if (!(await setOrdineSezioni(user.companyId, user.id, ordine))) return refused('forbidden', prev, fd);
  return { status: 'saved', ordine };
}
