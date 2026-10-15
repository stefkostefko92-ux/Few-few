// The cases of DPR 162/1999 art. 2 c.1 lett. cc) a modification's parts are (round 46, out of collaudo.ts in its review):
// the numbered changes and replacements, the other main components for the engineer to confirm, the case of a machine
// kept; and the points of UNI 10411 that only concern a new machine. Our words with the article's numbers. Pure.
import type { FormValues } from '@/calc/types';
import type { Collaudo, Parte } from '../lift/collaudo';
import { carichiOf, portataVariata } from '../lift/modifica';
import type { PuntoInSito } from '../lift/norme-collaudo';

/** The case of DPR 162/1999 art. 2 c.1 lett. cc) of each part a modification replaces or changes besides the machine
 *  (round 46): a change of the speed n. 1), of the rated load n. 2), of the travel n. 3); the controller, the landing
 *  doors and the car with its sling n. 5) — read on the article —; any other part is one of n. 5)'s other main
 *  components, for the engineer to confirm. With the machine kept (`resta`) they are the modification. The loads
 *  changed by the documented loads with the rated load the same (T*, the counterweight or their ratio: 'load' brought by
 *  the rule) are no case n. 2) — the article names the rated load —: the engineer places them; the car doors made
 *  sliding are the car doors already named, and the machine room is the building's, not a component (round 46 review). */
const CC = 'DPR 162/1999, art. 2 c.1 lett. cc)';
const CC_VARIAZIONE: readonly [Parte, string, string][] = [['speed', '1)', 'cambio della velocità nominale'], ['load', '2)', 'cambio della portata'],
  ['travel', '3)', 'cambio della corsa']];
const CARICHI_SENZA_PORTATA: PuntoInSito = { rif: CC, stato: 'da_verificare',
  testo: 'carichi statici variati (T*, contrappeso o il loro rapporto) senza cambio della portata: non è il caso n. 2); se e come sia una '
    + 'modifica costruttiva lo conferma il tecnico nella comunicazione' };
const LOCALE_CC: PuntoInSito = { rif: CC, stato: 'da_verificare',
  testo: 'locale del macchinario nuovo o modificato: un’opera dell’edificio, non un componente dell’impianto; se indicarlo nella comunicazione lo '
    + 'valuta il tecnico' };
export function altreModifiche(C: Collaudo, resta: boolean, nome: (p: Parte) => string, V?: FormValues): PuntoInSito[] {
  const altre: readonly Parte[] = C.norma === 'en81' ? [] : C.parti.filter((p) => p !== 'machine'), has = (p: Parte): boolean => altre.includes(p);
  const cabina = has('car') && has('sling');
  const principali = [...(has('controller') ? [nome('controller')] : []), ...(has('landingDoors') ? [nome('landingDoors')] : []), ...(cabina ? ['cabina con l’arcata'] : [])];
  const numerate: readonly Parte[] = ['speed', 'load', 'travel', 'controller', 'landingDoors', 'room'];
  const altri = altre.filter((p) => !numerate.includes(p) && !(cabina && (p === 'car' || p === 'sling')) && !(p === 'slidingDoors' && has('carDoors')));
  // the rated load: with the documented loads and the calculation's, only when it changes; answered by hand (no
  // documents to read it on), as answered
  const ora = V && C.documentato ? carichiOf(V) : null, portata = !C.documentato || !ora || portataVariata(C.documentato, ora);
  return [
    ...CC_VARIAZIONE.filter(([p]) => has(p)).map(([p, n, testo]): PuntoInSito => (p === 'load' && !portata ? CARICHI_SENZA_PORTATA
      : { rif: `${CC} n. ${n}`, stato: 'confermato', testo: `${testo}: modifica costruttiva` })),
    ...(principali.length ? [{ rif: `${CC} n. 5)`, stato: 'confermato' as const,
      testo: `sostituzione ${resta ? 'di' : 'anche di'} ${principali.join(', ')}: modifica costruttiva` }] : []),
    ...(altri.length ? [{ rif: `${CC} n. 5)`, stato: 'da_verificare' as const,
      testo: `altri componenti principali sostituiti (${altri.map(nome).join(', ')}): il tecnico conferma il caso nella comunicazione` }] : []),
    ...(has('room') ? [LOCALE_CC] : []),
  ];
}

/** With the machine kept (round 45): DPR 162/1999's case of the machine replaced is not this one, and the points of UNI
 *  10411 and UNI EN 81-20 that only concern a new machine (point 14 of UNI 10411-1/-11) are not printed. */
export const DPR_CC_RESTA: PuntoInSito = { rif: 'DPR 162/1999, art. 2 c.1 lett. cc)', stato: 'confermato',
  testo: 'la modifica è costruttiva; l’argano resta, quindi non è il caso n. 5) della sostituzione del macchinario' };
export const PUNTI_MACCHINA_NUOVA: readonly string[] = ['UNI 10411-1:2024, 14.4 a)–g)', 'UNI 10411-11:2024, 14.3 a) e App. A (14); UNI EN 81-20:2020, 5.6.6.2 e 5.6.7.3',
  'UNI 10411-11:2024, 14.3 b)', 'UNI EN 81-20:2020, C.2 e 7.3.2'];
/** With the machine kept, the apparatus moved or added in the machine room are the new controller's or the others: the
 *  9.1–9.2 point of UNI 10411-1 without the new machine among them (round 46 review). */
const LOCALE_9 = 'UNI 10411-1:2024, 9.1–9.2', MACCHINA_9 = ' (a nostro giudizio anche la macchina nuova, che ne cambia gli ingombri)';
export const restaPunto = (p: PuntoInSito): PuntoInSito =>
  (p.rif === LOCALE_9 ? { ...p, testo: p.testo.replace(MACCHINA_9, ' (l’argano resta: il quadro nuovo o le altre apparecchiature spostate)') } : p);
