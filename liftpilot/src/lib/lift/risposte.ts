// The answers about the parts in «Calcolo argano» (round 45, owner's decision Q1): every part of an «Ammodernamento» is
// answered «Sì» or «No» explicitly — none counts as «No» by default, which would silently turn a replaced part's checks
// into «esistente» —, except the machine, answered «Sì» on entry and changeable; a «Solo argano» asks only whether the
// ropes are replaced. Some answers are the rule's, not the user's: new ropes of their own number and diameter are
// replaced; a load the documented loads count as changed is changed, and so are a speed and a travel the logbook counts
// as changed (round 46, AUTO_PARTI); the renovation keeps the sling. The test's parts
// (Collaudo.parti) hold the «Sì» answers; which parts were answered is kept beside them (the form's draft). Pure.
import type { FormValues } from '@/calc/types';
import { AUTO_PARTI, PARTI, choiceOf, collaudoOf, type Collaudo, type Parte } from './collaudo';
import { PARTI_RIFACIMENTO, VARIAZIONI, type TipoIntervento } from './intervento';

/** An answer the rule gives (shown, not changeable): «Sì» or «No», and why. */
export type Bloccata = { si: boolean; perche: 'funi' | 'carichi' | 'velocita' | 'corsa' | 'arcata' };

/** Why the rule brings each change: the documented loads, the logbook's speed, its travel. */
const PERCHE_AUTO = { load: 'carichi', speed: 'velocita', travel: 'corsa' } as const;
const isAuto = (p: Parte): p is keyof typeof PERCHE_AUTO => AUTO_PARTI.includes(p);

/** The answer the rule gives to a part, if any. `C`: the test as the documents read it (collaudoOf). */
export function bloccata(t: TipoIntervento | null, chosen: Collaudo | undefined, C: Collaudo, V: FormValues, p: Parte): Bloccata | null {
  if (t !== 'SOLO_ARGANO' && t !== 'AMMODERNAMENTO') return null;
  if (p === 'ropes' && !V.keepRopes) return { si: true, perche: 'funi' };
  if (t === 'AMMODERNAMENTO' && isAuto(p) && C.parti.includes(p) && !choiceOf(C, chosen).includes(p)) return { si: true, perche: PERCHE_AUTO[p] };
  if (t === 'AMMODERNAMENTO' && p === 'sling' && chosen?.rifacimento) return { si: false, perche: 'arcata' };
  return null;
}

/** The parts shown with their answer for a type: the machine and the ropes for a «Solo argano» (the machine always
 *  «Sì»: it is the machine's calculation), every part for a modernisation, none for a transformation. */
export const partiDi = (t: TipoIntervento | null): readonly Parte[] => (t === 'SOLO_ARGANO' ? ['machine', 'ropes'] : t === 'AMMODERNAMENTO' ? PARTI : []);

/** The parts the user still has to answer, in their order: shown, not given by the rule, not answered. */
export function daIndicare(t: TipoIntervento | null, chosen: Collaudo | undefined, C: Collaudo, V: FormValues, risposte: readonly Parte[]): Parte[] {
  return partiDi(t).filter((p) => !(t === 'SOLO_ARGANO' && p === 'machine') && !risposte.includes(p) && !bloccata(t, chosen, C, V, p));
}

/** The test with one part answered: «Sì» among its parts (in their order), «No» out of them. */
export const rispondi = (chosen: Collaudo, p: Parte, si: boolean): Collaudo =>
  ({ ...chosen, parti: PARTI.filter((x) => (x === p ? si : chosen.parti.includes(x))) });

/** The answers a form starts with. A calculation saved with its type declared had every part answered; one saved
 *  before (or a draft without the answers) only its «Sì» parts — its «No» were the old checkboxes' default and are asked
 *  again. */
export function risposteIniziali(t: TipoIntervento | null, chosen: Collaudo | undefined, dichiarato: boolean): Parte[] {
  const shown = partiDi(t);
  return dichiarato ? [...shown] : shown.filter((p) => chosen?.parti.includes(p));
}

/** The answers kept when the type changes: those of the parts both types show (a «Solo argano»'s ropes answered stay
 *  answered in the modernisation, and back); a modernisation always starts with the machine answered. */
export function risposteDopo(next: TipoIntervento, risposte: readonly Parte[]): Parte[] {
  const shown = partiDi(next), kept = risposte.filter((p) => shown.includes(p));
  return next === 'AMMODERNAMENTO' && !kept.includes('machine') ? ['machine', ...kept] : kept;
}

/** The answers after «Rifacimento con l'arcata esistente»: on, every part it replaces answered with the sling (kept),
 *  the changes of speed, load and travel as they were; off, the machine alone. */
export function risposteRifacimento(on: boolean, risposte: readonly Parte[]): Parte[] {
  if (!on) return ['machine'];
  return PARTI.filter((p) => PARTI_RIFACIMENTO.includes(p) || p === 'sling' || (VARIAZIONI.includes(p) && risposte.includes(p)));
}

/** The test of a saved calculation as the user chose it: the record stores it normalised (collaudoOf), with the changes
 *  the rule brings among its parts (AUTO_PARTI: the load by the documented loads, the speed and the travel by the
 *  logbook) — the rule's, not answers, each left out when the rule still gives it. */
export function sceltaSalvata(V: FormValues, stored: Collaudo): Collaudo {
  if (stored.norma === 'en81') return stored;
  let out = stored;
  for (const p of AUTO_PARTI) {
    if (!out.parti.includes(p)) continue;
    const senza = { ...out, parti: out.parti.filter((x) => x !== p) };
    if (collaudoOf(V, senza).parti.includes(p)) out = senza;
  }
  return out;
}
