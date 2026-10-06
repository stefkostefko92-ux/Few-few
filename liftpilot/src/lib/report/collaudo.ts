// The acceptance test in the documents (the relazione and sheet 1), in Italian: the standards, the parts the
// intervention replaces or changes (a renovation keeps the existing sling), the result of a check that concerns a part
// staying as it is, the result under each standard and the test's, the adaptations the standard asks of a replaced
// machine. Pure.
import appIt from '../../../messages/it.json';
import type { CheckId } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import { NORMA_BREVE, NORMA_SIGLA, adeguamentiDovuti, ambitoOf, collaudoVerdict, esitiNorme, normeOf, type Collaudo } from '../lift/collaudo';
import { ADEMPIMENTI, NORME_INFO, type PuntoInSito } from '../lift/norme-collaudo';
import { KL } from '../lift/norme';
import { variazioneCarico, type Carichi, type Variazione } from '../lift/modifica';
import { ADAPT } from '../present/adapt';
import type { Tr } from '../present/tr';
import type { BlockStatus, ReportBlock } from './model';

const LIFT = appIt.lift;

/** The parts replaced or changed, in words (tested as new: all of them). */
export const partiText = (C: Collaudo): string => (C.norma === 'en81'
  ? "tutte: l’impianto si collauda come nuovo"
  : C.parti.length ? C.parti.map((p) => LIFT[`parte_${p}` as const].toLowerCase()).join(', ') : 'nessuna');

/** The standards added to the base one, in words (empty: none). */
const aggiunteText = (C: Collaudo): string => (C.aggiuntive ?? []).map((n) => NORMA_SIGLA[n]).join('; ');

const num = (x: number): string => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(x);
const pctText = (x: number): string => `${x < 0 ? '−' : '+'}${num(Math.abs(x) * 100)} %`;
const day = (d: string): string => d.split('-').reverse().join('/');

/** The answer about the CE marking, in words (modifica.ts). */
const marcaturaText = (C: Collaudo): string | null => (C.marcatura === 'si'
  ? 'presente: dichiarazione di conformità CE/UE e marcatura in cabina'
  : C.marcatura === 'no' ? 'assente'
    : C.marcatura === 'incerta' ? `non nota: ${C.servizio ? `messa in servizio il ${day(C.servizio)}, ` : ''}parte della UNI 10411 da confermare con il libretto `
      + "dell’impianto (dichiarazione di conformità)" : null);

/** The change of the loads in words: the increases and what they bring under the part of UNI 10411. */
export function variazioneText(v: Variazione): string {
  const head = `portata ${pctText(v.dQ)}, T* ${pctText(v.dT)}, contrappeso ${pctText(v.dTcp)} della portata`;
  const lim = v.limiti ? ` (ammessi senza verifiche: ${pctText(v.limiti.Q)}, ${pctText(v.limiti.T)} e ${pctText(v.limiti.Tcp)}, UNI 10411-1, prospetti 1 e 2)` : '';
  const over = v.p1 || v.p2
    ? `: ${v.limiti ? 'oltre i limiti' : 'aumento (UNI 10411-11, 6.1)'}, le verifiche del carico entrano nell’esito`
    : v.calo ? ": un carico diminuisce, le verifiche del carico entrano nell’esito (ammortizzatori, paracadute progressivo)" : ': entro i limiti';
  const str = v.strutture ? `; oltre il ${num(KL.loadStruct11 * 100)} % anche le strutture dell’edificio (UNI 10411-11, 5)` : '';
  return `${head}${lim}${over}${str}. Aggiornare la documentazione con i nuovi carichi.`;
}

/** The rows of the data of the installation: the standards and, for a modification, what it replaces or changes, the
 *  answer about the CE marking and the change of the loads from the documented ones (`ora`: the design's). */
export function collaudoRows(C: Collaudo, repl: boolean, ora?: Carichi | null): [string, string][] {
  const uni = repl && C.norma !== 'en81', ce = uni ? marcaturaText(C) : null, doc = uni ? C.documentato : undefined;
  const v = doc && ora && C.norma !== 'en81' ? variazioneCarico(C.norma, doc, ora) : null;
  return [
    ['Normativa di riferimento per il collaudo', NORMA_SIGLA[C.norma]],
    ...(C.aggiuntive?.length ? [['Altre normative di collaudo', aggiunteText(C)] as [string, string]] : []),
    ...(repl ? [['Parti sostituite o modificate', partiText(C)] as [string, string]] : []),
    ...(ce ? [['Marcatura CE dell’impianto', ce] as [string, string]] : []),
    ...(doc ? [['Carichi documentati (portata · cabina · contrappeso)', `${num(doc.Q)} · ${num(doc.P)} · ${num(doc.Mcw)} kg`] as [string, string]] : []),
    ...(v ? [['Variazione dei carichi', variazioneText(v)] as [string, string]] : []),
  ];
}

/** The title of the section with the result under each standard: in the relazione di calcolo and in the relazione
 *  tecnica (the object of each names its own). */
export const ESITI_CALCOLO = 'Esito delle verifiche di calcolo per normativa', ESITI_TECNICA = 'Esito delle verifiche per normativa';

/** What the object of the relazione says of the standards added to the base one (empty: none). */
const aggiunteSentence = (C: Collaudo, esiti: string): string => (C.aggiuntive?.length
  ? ` Il collaudo considera anche: ${aggiunteText(C)}; ogni normativa ha il suo esito (sezione «${esiti}») e l’esito complessivo è il peggiore.`
  : '');

/** What the object of the relazione says of the intervention and its acceptance test (a new lift: only the standards
 *  added, if any); `esiti` is the title of the document's section with the result under each standard. */
export function collaudoText(C: Collaudo, repl: boolean, esiti = ESITI_CALCOLO): string {
  return repl ? interventionText(C) + aggiunteSentence(C, esiti) : aggiunteSentence(C, esiti);
}

/** The renovation that keeps the existing sling: a modification, by the practice of the registry's entry. */
const RIFACIMENTO_TEXT = " Rifacimento dell’impianto con l’arcata esistente: le sostituzioni sono modifiche costruttive ai sensi del DPR 162/1999 "
  + "e s.m.i. (art. 2, comma 1, lettera cc)) e l’arcata resta quella dell’impianto, che quindi non è sostituito per intero e non si collauda come "
  + "impianto nuovo. È la prassi seguita (voce «impianto.rifacimento» del registro): il tecnico incaricato la conferma con il soggetto che esegue "
  + 'la verifica straordinaria.';

function interventionText(C: Collaudo): string {
  // a renovation is one only under UNI 10411 (collaudoOf)
  const what = C.rifacimento && C.norma !== 'en81' ? RIFACIMENTO_TEXT : C.parti.includes('machine') || C.norma === 'en81'
    ? ' La sostituzione del macchinario è una modifica costruttiva ai sensi del DPR 162/1999 e s.m.i.'
    : " L’intervento modifica un impianto esistente (DPR 162/1999 e s.m.i.).";
  if (C.norma === 'en81') return `${what} Il collaudo segue la ${NORMA_SIGLA.en81}, come per un impianto nuovo: ogni verifica entra nell’esito.`;
  const ce = C.marcatura === 'incerta'
    ? " La marcatura CE dell’impianto non è nota: la parte della UNI 10411 è quella della data di messa in servizio e va confermata con la "
      + 'dichiarazione di conformità del libretto prima della firma.'
    : '';
  return `${what} Il collaudo segue la ${NORMA_SIGLA[C.norma]} (impianto ${C.norma === '10411-1' ? 'non conforme' : 'conforme'} alla Direttiva Ascensori): `
    + `entrano nell’esito le verifiche che riguardano le parti sostituite o modificate (${partiText(C)}); le altre riguardano parti che restano come sono `
    + `e sono riportate come «esistente», con il valore calcolato.${ce}`;
}

/** The result of a check in the tables: as calculated, or "existing" with the calculation beside it. */
export const esitoOf = (C: Collaudo, id: CheckId | ShaftCheckId, st: string, status: BlockStatus): { text: string; status: BlockStatus } =>
  (ambitoOf(C, id) === 'existing' ? { text: `Esistente\n(${st})`, status: 'info' } : { text: st, status });

/** The note under a table of checks with some of the parts that stay as they are. */
export const EXISTING_NOTE = "Le verifiche con esito «Esistente» riguardano parti che restano come sono e non entrano nell’esito delle verifiche per il "
  + 'collaudo; tra parentesi l’esito del calcolo, da valutare con il tecnico quando non passa.';

/** The section of the adaptations: its title and blocks. `t` reads the calculator's texts. */
export function adaptSection(C: Collaudo, repl: boolean, t: Tr): { title: string; blocks: ReportBlock[] } {
  if (!repl) return { title: t('c_ucmp'), blocks: [{ t: 'p', text: t('n_new') }] };
  if (adeguamentiDovuti(C)) {
    return { title: t('c_adapt'), blocks: [{ t: 'list', items: ADAPT.map((k) => t(k)) }, { t: 'p', text: t('a_src'), style: 'note' }] };
  }
  if (C.norma === 'en81') {
    return { title: t('c_adapt_en81'), blocks: [{ t: 'p', text: t('a_en81') }] };
  }
  if (C.parti.includes('machine')) return { title: t('c_adapt_11'), blocks: [{ t: 'p', text: t('a_11') }] };
  return { title: t('c_adapt_other'), blocks: [{ t: 'p', text: t('a_other', { norma: NORMA_SIGLA[C.norma] }) }] };
}

/** The note of sheet 1 on the acceptance test: a modification's parts, the standards added (none when tested as new
 *  to EN 81-20/50 alone). */
export function collaudoNote(C: Collaudo, tag: string): { title: string; tag: string; text: string } | null {
  const added = C.aggiuntive?.length ? ` Anche secondo ${(C.aggiuntive ?? []).map((n) => NORMA_BREVE[n]).join(' e ')}: ogni normativa ha il suo esito, quello del collaudo è il peggiore.` : '';
  if (C.norma === 'en81') return added ? { title: 'COLLAUDO', tag, text: `Collaudo secondo ${NORMA_SIGLA.en81}.${added}` } : null;
  const rif = C.rifacimento ? " Rifacimento con l’arcata esistente: l’arcata resta quella dell’impianto, collaudato come modifica." : '';
  return { title: 'COLLAUDO', tag, text: `Collaudo secondo ${NORMA_SIGLA[C.norma]}.${rif}${added} Parti sostituite o modificate: ${partiText(C)}. Le verifiche con esito `
    + "«ESISTENTE» riguardano parti che restano come sono e non entrano nell’esito delle verifiche." };
}

/** The section of the result under each standard of the test, and the test's: a standard without a check computed
 *  (DM 236 without its case chosen in the shaft) says so. `st` names a status as the tables do. */
export function esitiBlocks(C: Collaudo, checks: readonly { id: CheckId | ShaftCheckId; status: BlockStatus }[], st: (s: 'ok' | 'warn' | 'fail') => string): ReportBlock[] {
  const E = esitiNorme(C, checks), all = collaudoVerdict(C, checks);
  const rows = E.map((e, i) => [NORMA_SIGLA[e.norma], i === 0 ? 'base' : 'aggiunta', String(e.ids.length), String(e.fails), String(e.warns), e.ids.length ? st(e.verdict) : 'non calcolata']);
  const out: ReportBlock[] = [
    { t: 'grid', head: ['Normativa', 'Ruolo', 'Verifiche', 'Non passano', 'Avvisi', 'Esito'], rows, status: E.map((e) => (e.ids.length ? e.verdict : 'info')), statusCol: 5,
      widths: [0.4, 0.1, 0.1, 0.12, 0.1, 0.18], align: ['l', 'l', 'r', 'r', 'r', 'l'] },
    { t: 'verdict', text: `Esito delle verifiche di calcolo: ${st(all.verdict)}${all.fails ? ` — ${all.fails} ${all.fails === 1 ? 'verifica non passa' : 'verifiche non passano'}` : ''}`, status: all.verdict },
    { t: 'p', style: 'note', text: "Non è l’esito del collaudo, che spetta al tecnico incaricato e all’organismo con le prove in sito. Quali verifiche entrano per ogni "
      + 'normativa è la lettura del software (voce «impianto.collaudo» del registro), da confermare sul testo vigente delle norme.' },
  ];
  if (E.some((e) => e.norma === 'dm236' && !e.ids.length)) {
    out.push({ t: 'p', style: 'note', text: 'DM 236/1989: nessuna verifica calcolata, perché nei dati del vano non è scelto il caso (edificio esistente, residenziale o non residenziale nuovo).' });
  }
  if (E.some((e) => e.norma !== 'dm236' && !e.ids.length)) {
    out.push({ t: 'p', style: 'note', text: '«Non calcolata»: la normativa non ha verifiche che il software calcola; i suoi punti si verificano in sito (sezione «Adempimenti e punti da verificare in sito»).' });
  }
  return out;
}

const punto = (p: PuntoInSito): string => `${p.rif}: ${p.testo}${p.stato === 'da_verificare' ? ' (da verificare sul testo vigente)' : ''}.`;

/** The section of what the law asks of the intervention (DPR 162/1999: a new lift, or a modification) and, for each
 *  standard of the test, its citation in the Official Journal and the points the engineer checks on site. */
export function adempimentiBlocks(C: Collaudo, repl: boolean): ReportBlock[] {
  const out: ReportBlock[] = [
    { t: 'p', text: repl
      ? "L’intervento modifica un impianto esistente: il DPR 162/1999 e s.m.i. chiede gli adempimenti che seguono. Per ogni normativa del collaudo, "
        + 'sotto, la sua citazione e i punti che il tecnico verifica in sito, con il riferimento e il valore (parafrasati: il testo delle norme non è riportato).'
      : "Impianto nuovo: il DPR 162/1999 e s.m.i. chiede gli adempimenti che seguono. Per ogni normativa del collaudo, sotto, la sua citazione e i punti "
        + 'che il tecnico verifica in sito, con il riferimento e il valore (parafrasati: il testo delle norme non è riportato).' },
    { t: 'h3', text: 'Adempimenti (DPR 162/1999)' },
    { t: 'list', items: ADEMPIMENTI[repl ? 'modifica' : 'nuovo'].map(punto) },
  ];
  for (const n of normeOf(C)) {
    const info = NORME_INFO[n];
    out.push({ t: 'h3', text: NORMA_SIGLA[n] }, { t: 'p', style: 'note', text: `Citazione: ${info.citazione}.${info.avviso ? ` Attenzione: ${info.avviso}.` : ''}` });
    if (info.punti.length) out.push({ t: 'list', items: info.punti.map(punto) });
  }
  return out;
}
