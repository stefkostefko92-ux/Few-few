// The answers about the parts in «Calcolo argano» (round 45, owner's decision Q1): every part of an «Ammodernamento» is
// answered «Sì» or «No» explicitly — none counts as «No» by default, which would silently turn a replaced part's checks
// into «esistente» —, except the machine, answered «Sì» on entry and changeable; a «Solo argano» asks only whether the
// ropes are replaced. Some answers are the rule's, not the user's: new ropes of their own number and diameter are
// replaced; a load the documented loads count as changed is changed, and so are a speed and a travel the logbook counts
// as changed (round 46, AUTO_PARTI); the renovation keeps the sling; a new machine on an existing controller without a
// speed regulation replaces the controller in a modernisation (round 46, B6, 'inverter'). The optional parts (B7,
// owner's decision Q3) are a group of their own, «No» unless answered. Round 47 (owner's decision D1): the documents
// decide the changes of speed, load and travel both ways — where they show none, the part starts answered «No» («dai
// documenti», esitoParte), an answer the user can change; derived at each render from the documents and the values,
// never stored. The test's parts (Collaudo.parti) hold the «Sì» answers; which parts were answered is kept beside them
// (the form's draft). Pure.
import type { FormValues } from '@/calc/types';
import { AUTO_PARTI, PARTI, choiceOf, collaudoOf, type Collaudo, type Parte } from './collaudo';
import { PARTI_FACOLTATIVE, PARTI_RIFACIMENTO, VARIAZIONI, regolazioneChiesta, senzaRegolazione, type TipoIntervento } from './intervento';
import { esitoDocumenti, type EsitoDoc } from './modifica';

/** An answer the rule gives (shown, not changeable): «Sì» or «No», and why. */
export type Bloccata = { si: boolean; perche: 'funi' | 'carichi' | 'velocita' | 'corsa' | 'arcata' | 'inverter' };

/** A modernisation's new machine on the existing controller answered without a speed regulation: the controller is
 *  replaced (UNI 10411-1:2024 11.2.1, UNI 10411-11:2024 11.2). `chosen`: the parts as the user answered them. */
const quadroForzato = (t: TipoIntervento | null, chosen: Collaudo | undefined): boolean =>
  t === 'AMMODERNAMENTO' && !!chosen && chosen.parti.includes('machine') && senzaRegolazione(chosen.regolazione);

/** Why the rule brings each change: the documented loads, the logbook's speed, its travel. */
const PERCHE_AUTO = { load: 'carichi', speed: 'velocita', travel: 'corsa' } as const;
const isAuto = (p: Parte): p is keyof typeof PERCHE_AUTO => AUTO_PARTI.includes(p);

/** The answer the rule gives to a part, if any. `C`: the test as the documents read it (collaudoOf). */
export function bloccata(t: TipoIntervento | null, chosen: Collaudo | undefined, C: Collaudo, V: FormValues, p: Parte): Bloccata | null {
  if (t !== 'SOLO_ARGANO' && t !== 'AMMODERNAMENTO') return null;
  if (p === 'ropes' && !V.keepRopes) return { si: true, perche: 'funi' };
  if (t === 'AMMODERNAMENTO' && isAuto(p) && C.parti.includes(p) && !choiceOf(C, chosen).includes(p)) return { si: true, perche: PERCHE_AUTO[p] };
  if (t === 'AMMODERNAMENTO' && p === 'sling' && chosen?.rifacimento) return { si: false, perche: 'arcata' };
  if (p === 'controller' && quadroForzato(t, chosen)) return { si: true, perche: 'inverter' };
  return null;
}

/** The test as the save sends it: the parts answered with the rule's answers — new ropes of their own number and
 *  diameter replaced, and in a modernisation the controller replaced under a new machine when the existing one has no
 *  speed regulation ('inverter'). */
export function effettiva(t: TipoIntervento | null, chosen: Collaudo | undefined, V: FormValues): Collaudo | undefined {
  if (!chosen || (t !== 'SOLO_ARGANO' && t !== 'AMMODERNAMENTO')) return chosen;
  const funi = !V.keepRopes && !chosen.parti.includes('ropes'), quadro = quadroForzato(t, chosen) && !chosen.parti.includes('controller');
  return funi || quadro ? { ...chosen, parti: PARTI.filter((x) => chosen.parti.includes(x) || (funi && x === 'ropes') || (quadro && x === 'controller')) } : chosen;
}

/** Whether the form asks the existing controller's speed regulation: a new machine staying on it (a «Solo argano»; a
 *  modernisation with the machine «Sì» and the controller answered «No»), or the answer is what replaces the controller
 *  (so that it can be changed). `chosen`: as answered, `risposte`: the parts answered. */
export const chiediRegolazione = (t: TipoIntervento | null, chosen: Collaudo | undefined, risposte: readonly Parte[]): boolean =>
  !!chosen && (quadroForzato(t, chosen) || (regolazioneChiesta(t, chosen) && (t === 'SOLO_ARGANO' || risposte.includes('controller'))));

/** The test of an example loaded with the button (complete: every part answered): a new machine on the existing
 *  controller has it with a frequency converter, as the examples' machines are sized (round 46). */
export const esempioCollaudo = (t: TipoIntervento, c: Collaudo): Collaudo => (regolazioneChiesta(t, c) && !c.regolazione ? { ...c, regolazione: 'vvvf' } : c);

/** The parts shown with their answer for a type: the machine and the ropes for a «Solo argano» (the machine always
 *  «Sì»: it is the machine's calculation), every part but the optional ones for a modernisation, none for a
 *  transformation. */
export const partiDi = (t: TipoIntervento | null): readonly Parte[] =>
  (t === 'SOLO_ARGANO' ? ['machine', 'ropes'] : t === 'AMMODERNAMENTO' ? PARTI.filter((p) => !PARTI_FACOLTATIVE.includes(p)) : []);

/** The optional parts a modernisation shows (round 46, owner's decision Q3: «No» unless answered, never still to answer):
 *  the car doors made sliding only with the car doors replaced. */
export const facoltativeDi = (t: TipoIntervento | null, chosen: Collaudo | undefined): readonly Parte[] =>
  (t === 'AMMODERNAMENTO' ? PARTI_FACOLTATIVE.filter((p) => p !== 'slidingDoors' || !!chosen?.parti.includes('carDoors')) : []);

/** What the documents of the existing lift say of a modernisation's change of speed, load or travel (round 47, D1;
 *  modifica.ts esitoDocumenti): `C` the test as the documents read it (collaudoOf: its part of UNI 10411, its documented
 *  loads and logbook). Null for any other part, type or standard. */
export function esitoParte(t: TipoIntervento | null, C: Collaudo, V: FormValues, p: Parte): EsitoDoc {
  if (t !== 'AMMODERNAMENTO' || (p !== 'speed' && p !== 'load' && p !== 'travel') || (C.norma !== '10411-1' && C.norma !== '10411-11')) return null;
  return esitoDocumenti(C.norma, C, V)[p];
}

/** A change the documents show none of: answered «No» from them until the user answers it (round 47, D1). */
export const dalDocumento = (t: TipoIntervento | null, C: Collaudo, V: FormValues, p: Parte): boolean => esitoParte(t, C, V, p) === 'no';

/** The parts the user still has to answer, in their order: shown, not given by the rule, not answered — nor answered
 *  «No» by the documents, nor waiting for the calculation's value the documents are read against (round 47: that value
 *  is itself still to enter). */
export function daIndicare(t: TipoIntervento | null, chosen: Collaudo | undefined, C: Collaudo, V: FormValues, risposte: readonly Parte[]): Parte[] {
  return partiDi(t).filter((p) => !(t === 'SOLO_ARGANO' && p === 'machine') && !risposte.includes(p) && !bloccata(t, chosen, C, V, p)
    && !['no', 'attesa'].includes(esitoParte(t, C, V, p) ?? ''));
}

/** The test with one part answered: «Sì» among its parts (in their order), «No» out of them; the car doors «No» take
 *  their sliding doors with them. */
export const rispondi = (chosen: Collaudo, p: Parte, si: boolean): Collaudo =>
  ({ ...chosen, parti: PARTI.filter((x) => (x === p ? si : chosen.parti.includes(x) && !(x === 'slidingDoors' && p === 'carDoors' && !si))) });

/** The answers a form starts with. A calculation saved with its type declared had every part answered; one saved
 *  before (or a draft without the answers) only its «Sì» parts — its «No» were the old checkboxes' default and are asked
 *  again. Round 47 review (D1): a declared record's «No» to a change the documents show none of, read against its
 *  values `V`, is the documents' answer, not the user's — left out of the answers, it stays derived and is asked again
 *  once the documents stop deciding it (values or documents changed); without `V`, every part as before. */
export function risposteIniziali(t: TipoIntervento | null, chosen: Collaudo | undefined, dichiarato: boolean, V?: FormValues): Parte[] {
  const shown = partiDi(t);
  if (!dichiarato) return shown.filter((p) => chosen?.parti.includes(p));
  if (!V || !chosen) return [...shown];
  const C = collaudoOf(V, chosen);
  return shown.filter((p) => !VARIAZIONI.includes(p) || chosen.parti.includes(p) || !dalDocumento(t, C, V, p));
}

/** The answers kept when the type changes: those of the parts both types show (a «Solo argano»'s ropes answered stay
 *  answered in the modernisation, and back); a modernisation always starts with the machine answered. */
export function risposteDopo(next: TipoIntervento, risposte: readonly Parte[]): Parte[] {
  const shown = partiDi(next), kept = risposte.filter((p) => shown.includes(p));
  return next === 'AMMODERNAMENTO' && !kept.includes('machine') ? ['machine', ...kept] : kept;
}

/** The answers after «Rifacimento con l'arcata esistente»: on, every part it replaces answered with the sling (kept),
 *  the changes of speed, load and travel as they were — unanswered, they follow the documents (round 47, D1:
 *  esitoParte); off, the machine alone. */
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
