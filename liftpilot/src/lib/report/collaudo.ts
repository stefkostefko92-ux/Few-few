// The acceptance test in the documents (the relazione and sheet 1), in Italian: the standard, the parts the
// intervention replaces or changes, the result of a check that concerns a part staying as it is, the adaptations the
// standard asks of a replaced machine. Pure.
import appIt from '../../../messages/it.json';
import type { CheckId } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import { NORMA_SIGLA, adeguamentiDovuti, ambitoOf, type Collaudo } from '../lift/collaudo';
import type { CalcKey } from '../present/tr';
import type { BlockStatus, ReportBlock } from './model';

const LIFT = appIt.lift;
const ADAPT: readonly CalcKey[] = ['a_brake', 'a_timer', 'a_overspeed', 'a_stop', 'a_power'];

/** The parts replaced or changed, in words (tested as new: all of them). */
export const partiText = (C: Collaudo): string => (C.norma === 'en81'
  ? "tutte: l'impianto si collauda come nuovo"
  : C.parti.length ? C.parti.map((p) => LIFT[`parte_${p}` as const].toLowerCase()).join(', ') : 'nessuna');

/** The rows of the data of the installation: the standard and, for a modification, what it replaces or changes. */
export const collaudoRows = (C: Collaudo, repl: boolean): [string, string][] => [
  ['Normativa di riferimento per il collaudo', NORMA_SIGLA[C.norma]],
  ...(repl ? [['Parti sostituite o modificate', partiText(C)] as [string, string]] : []),
];

/** What the object of the relazione says of the intervention and its acceptance test (empty for a new lift). */
export function collaudoText(C: Collaudo, repl: boolean): string {
  if (!repl) return '';
  const what = C.parti.includes('machine') || C.norma === 'en81'
    ? ' La sostituzione del macchinario è una modifica costruttiva ai sensi del DPR 162/1999 e s.m.i.'
    : " L'intervento modifica un impianto esistente (DPR 162/1999 e s.m.i.).";
  if (C.norma === 'en81') return `${what} Il collaudo segue la ${NORMA_SIGLA.en81}, come per un impianto nuovo: ogni verifica entra nell'esito.`;
  return `${what} Il collaudo segue la ${NORMA_SIGLA[C.norma]} (impianto ${C.norma === '10411-1' ? 'non conforme' : 'conforme'} alla Direttiva Ascensori): `
    + `entrano nell'esito le verifiche che riguardano le parti sostituite o modificate (${partiText(C)}); le altre riguardano parti che restano come sono `
    + "e sono riportate come «esistente», con il valore calcolato.";
}

/** The result of a check in the tables: as calculated, or "existing" with the calculation beside it. */
export const esitoOf = (C: Collaudo, id: CheckId | ShaftCheckId, st: string, status: BlockStatus): { text: string; status: BlockStatus } =>
  (ambitoOf(C, id) === 'existing' ? { text: `Esistente\n(${st})`, status: 'info' } : { text: st, status });

/** The note under a table of checks with some of the parts that stay as they are. */
export const EXISTING_NOTE = "Le verifiche con esito «Esistente» riguardano parti che restano come sono e non entrano nell'esito del collaudo; tra "
  + 'parentesi l\'esito del calcolo.';

/** The section of the adaptations: its title and blocks. `t` reads the calculator's texts. */
export function adaptSection(C: Collaudo, repl: boolean, t: (k: CalcKey) => string): { title: string; blocks: ReportBlock[] } {
  if (!repl) return { title: t('c_ucmp'), blocks: [{ t: 'p', text: t('n_new') }] };
  if (adeguamentiDovuti(C)) {
    return { title: t('c_adapt'), blocks: [{ t: 'list', items: ADAPT.map((k) => t(k)) }, { t: 'p', text: t('a_src'), style: 'note' }] };
  }
  if (C.norma === 'en81') {
    return { title: 'Adeguamenti: collaudo come impianto nuovo', blocks: [{ t: 'p', text: "Collaudato secondo UNI EN 81-20:2020 e UNI EN 81-50:2020, l'impianto "
      + 'deve avere le protezioni di un impianto nuovo, tra cui quelle contro la velocità eccessiva in salita e contro i movimenti incontrollati della '
      + "cabina (UNI EN 81-20, 5.6.6 e 5.6.7): se il freno agisce sull'albero motore servono dispositivi separati e certificati." }] };
  }
  if (C.parti.includes('machine')) return { title: 'Adeguamenti per la sostituzione (UNI 10411-11)', blocks: [{ t: 'p', text: LIFT.adapt_11 }] };
  return { title: 'Adeguamenti', blocks: [{ t: 'p', text: `La macchina resta quella esistente. Gli adeguamenti che la ${NORMA_SIGLA[C.norma]} chiede per le parti `
    + 'sostituite o modificate vanno verificati sul testo della norma.' }] };
}

/** The note of sheet 1 on a modification's acceptance test (none when tested as new). */
export const collaudoNote = (C: Collaudo, tag: string): { title: string; tag: string; text: string } | null => (C.norma === 'en81' ? null : {
  title: 'COLLAUDO', tag,
  text: `Collaudo secondo ${NORMA_SIGLA[C.norma]}. Parti sostituite o modificate: ${partiText(C)}. Le verifiche con esito «ESISTENTE» riguardano parti `
    + "che restano come sono e non entrano nell'esito del collaudo.",
});
