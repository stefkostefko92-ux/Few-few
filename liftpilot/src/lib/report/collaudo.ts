// The acceptance test in the documents (the relazione and sheet 1), in Italian: the standards, the parts the
// intervention replaces or changes, the result of a check that concerns a part staying as it is, the result under each
// standard and the test's, the adaptations the standard asks of a replaced machine. Pure.
import appIt from '../../../messages/it.json';
import type { CheckId } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import { NORMA_BREVE, NORMA_SIGLA, adeguamentiDovuti, ambitoOf, collaudoVerdict, esitiNorme, type Collaudo } from '../lift/collaudo';
import type { CalcKey } from '../present/tr';
import type { BlockStatus, ReportBlock } from './model';

const LIFT = appIt.lift;
const ADAPT: readonly CalcKey[] = ['a_brake', 'a_timer', 'a_overspeed', 'a_stop', 'a_power'];

/** The parts replaced or changed, in words (tested as new: all of them). */
export const partiText = (C: Collaudo): string => (C.norma === 'en81'
  ? "tutte: l'impianto si collauda come nuovo"
  : C.parti.length ? C.parti.map((p) => LIFT[`parte_${p}` as const].toLowerCase()).join(', ') : 'nessuna');

/** The standards added to the base one, in words (empty: none). */
const aggiunteText = (C: Collaudo): string => (C.aggiuntive ?? []).map((n) => NORMA_SIGLA[n]).join('; ');

/** The rows of the data of the installation: the standards and, for a modification, what it replaces or changes. */
export const collaudoRows = (C: Collaudo, repl: boolean): [string, string][] => [
  ['Normativa di riferimento per il collaudo', NORMA_SIGLA[C.norma]],
  ...(C.aggiuntive?.length ? [['Altre normative di collaudo', aggiunteText(C)] as [string, string]] : []),
  ...(repl ? [['Parti sostituite o modificate', partiText(C)] as [string, string]] : []),
];

/** What the object of the relazione says of the standards added to the base one (empty: none). */
const aggiunteSentence = (C: Collaudo): string => (C.aggiuntive?.length
  ? ` Il collaudo considera anche: ${aggiunteText(C)}; ogni normativa ha il suo esito (sezione «Esito del collaudo per normativa») e l'esito del collaudo è il peggiore.`
  : '');

/** What the object of the relazione says of the intervention and its acceptance test (a new lift: only the standards
 *  added, if any). */
export function collaudoText(C: Collaudo, repl: boolean): string {
  return repl ? interventionText(C) + aggiunteSentence(C) : aggiunteSentence(C);
}

function interventionText(C: Collaudo): string {
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

/** The note of sheet 1 on the acceptance test: a modification's parts, the standards added (none when tested as new
 *  to EN 81-20/50 alone). */
export function collaudoNote(C: Collaudo, tag: string): { title: string; tag: string; text: string } | null {
  const added = C.aggiuntive?.length ? ` Anche secondo ${(C.aggiuntive ?? []).map((n) => NORMA_BREVE[n]).join(' e ')}: ogni normativa ha il suo esito, quello del collaudo è il peggiore.` : '';
  if (C.norma === 'en81') return added ? { title: 'COLLAUDO', tag, text: `Collaudo secondo ${NORMA_SIGLA.en81}.${added}` } : null;
  return { title: 'COLLAUDO', tag, text: `Collaudo secondo ${NORMA_SIGLA[C.norma]}.${added} Parti sostituite o modificate: ${partiText(C)}. Le verifiche con esito `
    + "«ESISTENTE» riguardano parti che restano come sono e non entrano nell'esito del collaudo." };
}

/** The section of the result under each standard of the test, and the test's: a standard without a check computed
 *  (DM 236 without its case chosen in the shaft) says so. `st` names a status as the tables do. */
export function esitiBlocks(C: Collaudo, checks: readonly { id: CheckId | ShaftCheckId; status: BlockStatus }[], st: (s: 'ok' | 'warn' | 'fail') => string): ReportBlock[] {
  const E = esitiNorme(C, checks), all = collaudoVerdict(C, checks);
  const rows = E.map((e, i) => [NORMA_SIGLA[e.norma], i === 0 ? 'base' : 'aggiunta', String(e.ids.length), String(e.fails), String(e.warns), e.ids.length ? st(e.verdict) : 'non calcolata']);
  const out: ReportBlock[] = [
    { t: 'grid', head: ['Normativa', 'Ruolo', 'Verifiche', 'Non passano', 'Avvisi', 'Esito'], rows, status: E.map((e) => (e.ids.length ? e.verdict : 'info')), statusCol: 5,
      widths: [0.4, 0.1, 0.1, 0.12, 0.1, 0.18], align: ['l', 'l', 'r', 'r', 'r', 'l'] },
    { t: 'verdict', text: `Esito del collaudo: ${st(all.verdict)}${all.fails ? ` — ${all.fails} ${all.fails === 1 ? 'verifica non passa' : 'verifiche non passano'}` : ''}`, status: all.verdict },
  ];
  if (E.some((e) => e.norma === 'dm236' && !e.ids.length)) {
    out.push({ t: 'p', style: 'note', text: 'DM 236/1989: nessuna verifica calcolata, perché nei dati del vano non è scelto il caso (edificio esistente, residenziale o non residenziale nuovo).' });
  }
  return out;
}
