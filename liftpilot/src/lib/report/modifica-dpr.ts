// The cases of DPR 162/1999 art. 2 c.1 lett. cc) a modification's parts are (round 46, out of collaudo.ts in its review):
// the numbered changes and replacements, the other main components for the engineer to confirm, the case of a machine
// kept; and the points of UNI 10411 that only concern a new machine. Our words with the article's numbers. Pure.
import type { FormValues } from '@/calc/types';
import type { Collaudo, Parte } from '../lift/collaudo';
import { carichiOf, carichiVariati, portataVariata } from '../lift/modifica';
import type { PuntoInSito } from '../lift/norme-collaudo';

/** The case of DPR 162/1999 art. 2 c.1 lett. cc) of each part a modification replaces or changes besides the machine
 *  (round 46): a change of the speed n. 1), of the rated load n. 2), of the travel n. 3); the controller, the landing
 *  doors and the car with its sling n. 5) — read on the article —; whether any other part is one of n. 5)'s other main
 *  components the article does not say (the alarm, the UCM protection, the ropes…): the engineer says it, the line does
 *  not (round 46 recheck). With the machine kept (`resta`) they are the modification. The loads
 *  changed by the documented loads with the rated load the same (T*, the counterweight or their ratio: 'load' brought by
 *  the rule) are no case n. 2) — the article names the rated load —: the engineer places them; 'load' answered by hand
 *  while the documented loads are the design's is the answer for the engineer to confirm (round 46 recheck); the rated
 *  load changed on the documents is n. 2) even when the rule does not bring the load among the parts — T* and the
 *  counterweight within what UNI 10411 allows (round 46 final check); the car doors made sliding are the car doors
 *  already named, and the machine room is the building's, not a component (round 46 review). */
const CC = 'DPR 162/1999, art. 2 c.1 lett. cc)';
const CC_VARIAZIONE: readonly [Parte, string, string][] = [['speed', '1)', 'cambio della velocità nominale'], ['load', '2)', 'cambio della portata'],
  ['travel', '3)', 'cambio della corsa']];
const CARICHI_SENZA_PORTATA: PuntoInSito = { rif: CC, stato: 'da_verificare',
  testo: 'carichi statici variati (T*, contrappeso o il loro rapporto) senza cambio della portata: non è il caso n. 2); se e come sia una '
    + 'modifica costruttiva lo conferma il tecnico nella comunicazione' };
const CARICHI_INVARIATI: PuntoInSito = { rif: `${CC} n. 2)`, stato: 'da_verificare',
  testo: 'portata indicata come variata, ma i carichi documentati (portata, T* e contrappeso) coincidono con quelli del progetto entro '
    + 'l’arrotondamento dei dati: se sia un cambio della portata lo conferma il tecnico nella comunicazione' };
const PORTATA_DOCUMENTATA = 'cambio della portata secondo i carichi documentati, anche se T* e contrappeso non portano le verifiche del carico '
  + '(UNI 10411, 6.1): modifica costruttiva';
const LOCALE_CC: PuntoInSito = { rif: CC, stato: 'da_verificare',
  testo: 'locale del macchinario nuovo o modificato: un’opera dell’edificio, non un componente dell’impianto; se indicarlo nella comunicazione lo '
    + 'valuta il tecnico' };
export function altreModifiche(C: Collaudo, resta: boolean, nome: (p: Parte) => string, V?: FormValues): PuntoInSito[] {
  const altre: readonly Parte[] = C.norma === 'en81' ? [] : C.parti.filter((p) => p !== 'machine'), has = (p: Parte): boolean => altre.includes(p);
  const cabina = has('car') && has('sling');
  const principali = [...(has('controller') ? [nome('controller')] : []), ...(has('landingDoors') ? [nome('landingDoors')] : []), ...(cabina ? ['cabina con l’arcata'] : [])];
  const numerate: readonly Parte[] = ['speed', 'load', 'travel', 'controller', 'landingDoors', 'room'];
  const altri = altre.filter((p) => !numerate.includes(p) && !(cabina && (p === 'car' || p === 'sling')) && !(p === 'slidingDoors' && has('carDoors')));
  // the rated load: with the documented loads and the calculation's, n. 2) only when it changes, the static loads
  // changed without it for the engineer, nothing changed on the documents the hand's answer for the engineer to
  // confirm; answered by hand without documents to read it on, as answered
  const doc = C.documentato, ora = V && doc ? carichiOf(V) : null, norma = C.norma === 'en81' ? null : C.norma;
  const portata = !!doc && !!ora && !!norma && portataVariata(doc, ora);
  const carichi = !doc || !ora || !norma || portata ? null : carichiVariati(norma, doc, ora) ? CARICHI_SENZA_PORTATA : CARICHI_INVARIATI;
  return [
    ...CC_VARIAZIONE.filter(([p]) => has(p) || (p === 'load' && portata)).map(([p, n, testo]): PuntoInSito => (p === 'load' && carichi ? carichi
      : { rif: `${CC} n. ${n}`, stato: 'confermato', testo: p === 'load' && !has(p) ? PORTATA_DOCUMENTATA : `${testo}: modifica costruttiva` })),
    ...(principali.length ? [{ rif: `${CC} n. 5)`, stato: 'confermato' as const,
      testo: `sostituzione ${resta ? 'di' : 'anche di'} ${principali.join(', ')}: modifica costruttiva` }] : []),
    ...(altri.length ? [{ rif: `${CC} n. 5)`, stato: 'da_verificare' as const,
      testo: `altre parti sostituite (${altri.map(nome).join(', ')}): se siano «altri componenti principali» lo conferma il tecnico nella `
        + 'comunicazione' }] : []),
    ...(has('room') ? [LOCALE_CC] : []),
  ];
}

/** Whether the lines of the other parts (altreModifiche, `V` the calculation's values) confirm a numbered case of the
 *  article — a change of speed, rated load or travel, a controller, landing doors or car with its sling replaced: with
 *  the machine kept, what makes the modification a constructive one (round 46 final check). */
export const casoNumerato = (C: Collaudo, V?: FormValues): boolean => altreModifiche(C, true, (p) => p, V).some((p) => p.stato === 'confermato');

/** With the machine kept (round 45): DPR 162/1999's case of the machine replaced is not this one, and the points of UNI
 *  10411 and UNI EN 81-20 that only concern a new machine (point 14 of UNI 10411-1/-11) are not printed. The modification
 *  is a constructive one by a numbered case among the other parts (`numerata`, casoNumerato); without one, whether it
 *  is one the engineer confirms (round 46 final check: never «costruttiva» for the optional parts alone). */
export const ccResta = (numerata: boolean): PuntoInSito => (numerata
  ? { rif: CC, stato: 'confermato', testo: 'l’argano resta, quindi non è il caso n. 5) della sostituzione del macchinario; la modifica è costruttiva '
    + 'per i casi numerati delle parti che seguono' }
  : { rif: CC, stato: 'da_verificare', testo: 'l’argano resta, quindi non è il caso n. 5) della sostituzione del macchinario, e nessuna delle parti '
    + 'che seguono è un caso numerato dell’articolo: se la modifica sia costruttiva lo conferma il tecnico nella comunicazione' });
export const PUNTI_MACCHINA_NUOVA: readonly string[] = ['UNI 10411-1:2024, 14.4 a)–g)', 'UNI 10411-11:2024, 14.3 a) e App. A (14); UNI EN 81-20:2020, 5.6.6.2 e 5.6.7.3',
  'UNI 10411-11:2024, 14.3 b)', 'UNI EN 81-20:2020, C.2 e 7.3.2'];
/** With the machine kept, the apparatus moved or added in the machine room are the new controller's or the others: the
 *  9.1–9.2 point of UNI 10411-1 without the new machine among them (round 46 review). */
const LOCALE_9 = 'UNI 10411-1:2024, 9.1–9.2', MACCHINA_9 = ' (a nostro giudizio anche la macchina nuova, che ne cambia gli ingombri)';
export const restaPunto = (p: PuntoInSito): PuntoInSito =>
  (p.rif === LOCALE_9 ? { ...p, testo: p.testo.replace(MACCHINA_9, ' (l’argano resta: il quadro nuovo o le altre apparecchiature spostate)') } : p);
