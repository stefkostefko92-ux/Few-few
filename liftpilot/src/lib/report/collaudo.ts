// The acceptance test in the documents (the relazione and sheet 1), in Italian: the standards, the parts the
// intervention replaces or changes (a renovation keeps the existing sling), the result of a check that concerns a part
// staying as it is, the result under each standard and the test's, the adaptations the standard asks of a replaced
// machine. Pure.
import appIt from '../../../messages/it.json';
import { PROFILO } from '@/calc/norme';
import type { CheckId, MachineStd } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft';
import { NORMA_BREVE, NORMA_SIGLA, adeguamentiDovuti, ambitoOf, collaudoVerdict, esitiNorme, normeOf, type Collaudo } from '../lift/collaudo';
import { ADEMPIMENTI, NORME_INFO, obblighiParti, type PuntoInSito } from '../lift/norme-collaudo';
import { KL } from '../lift/norme';
import { variazioneCarico, type Carichi, type Norma10411, type Variazione } from '../lift/modifica';
import { slingCheck, tStarOf } from '../lift/arcata';
import { ADAPT } from '../present/adapt';
import type { Tr } from '../present/tr';
import type { BlockStatus, ReportBlock } from './model';
import { MACCHINA_81_1 } from './refs';

const LIFT = appIt.lift;

/** What DPR 162/1999 asks of a new installation, in the references (the articles of ADEMPIMENTI.nuovo). */
const DPR_NUOVO = 'impianto nuovo: conformità con un organismo notificato e marcatura CE (artt. 4-bis, 6-bis e 7), messa in esercizio '
  + '(art. 12) e verifiche periodiche (art. 13)';

/** The machine to UNI EN 81-1 (its original standard) under the test: the clause of UNI 10411 that admits it and the
 *  edition it names (refs.ts MACCHINA_81_1). */
const origine = (norma: Collaudo['norma']): string => { const m = MACCHINA_81_1[norma]; return `${m.via ? ` (${m.via})` : ''}, la ${m.sigla}`; };
/** The machine to UNI EN 81-1 in the relazione's object: the points of that standard the checks take. */
export const std81_1 = (norma: Collaudo['norma']): string => ` Macchina secondo la norma di origine${origine(norma)}: con la cabina o il contrappeso `
  + 'bloccati vale la sua 9.3 c), senza l’alternativa del dispositivo elettrico, e la manovra di emergenza segue la sua 12.5.';
const en81_1 = (norma: Collaudo['norma']): string[] => [MACCHINA_81_1[norma].sigla, `la macchina secondo la norma di origine${origine(norma)}: aderenza `
  + '(9.3), funi (9.2.2), freno (12.4.2), manovra di emergenza (12.5); punti letti sulla UNI EN 81-1:2008'];

/** The clauses of the existing pillar to the ground under the counterweight's buffers that a modification may keep in
 *  place of the counterweight's safety gear over a space under the shaft (registry paracadute.contrappeso), checked for
 *  the new loads: UNI 10411-1:2024, 6.14 for a lift not built to the Lifts Directive; a CE-marked one keeps what its
 *  edition of UNI EN 81-1 allowed (5.5 a)), UNI 10411-11:2024 has no such clause: its safety gear of the counterweight,
 *  if any (6.6), and the other parts the change of load affects (6.13) are checked for the new loads. */
export const pilastroRif = (norma: Norma10411): string => (norma === '10411-1' ? 'UNI 10411-1:2024, 6.14'
  : `${MACCHINA_81_1[norma].sigla}, 5.5 a); UNI 10411-11:2024, 6.6 e 6.13`);

/** UNI EN 81-20 in a calculation without a shaft design: only what it checks (the distances in the shaft and the car's
 *  area are the shaft design's). */
const EN81_20_MACCHINA = 'funi (5.5), freno (5.9.2.2) e manovra di emergenza (5.9.2.3)';

/** A modification that replaces other parts besides the machine, in the references (registry PROFILO, DPR 162/1999). */
const DPR_PARTI = 'sostituzione del macchinario e delle altre parti come modifiche costruttive (art. 2 c.1 lett. cc)); verifica straordinaria (art. 14)';

/** The references of the relazione, by the case: an existing installation is modified under DPR 162/1999 and tested to
 *  the UNI 10411 part chosen; a new one is placed on the market and put into service (section «Adempimenti»), with no UNI
 *  10411 and no extraordinary inspection; DM 236/1989 with a shaft design; UNI EN 81-1 with a machine to it. */
export function riferimentiRows(repl: boolean, C: Pick<Collaudo, 'norma' | 'parti'>, std: MachineStd, design: boolean): string[][] {
  const norma = C.norma, altre = repl && norma !== 'en81' && C.parti.some((p) => p !== 'machine');
  const rows = PROFILO.documenti
    .filter((d) => (d.sigla.startsWith('UNI 10411') ? repl && d.sigla.startsWith(`UNI ${norma}:`) : d.sigla.startsWith('DM 236') ? design : true))
    .map((d) => [d.sigla, d.sigla.startsWith('DPR 162/1999') && (!repl || altre) ? (repl ? DPR_PARTI : DPR_NUOVO)
      : !design && d.sigla === 'UNI EN 81-20:2020' ? EN81_20_MACCHINA : d.ambito]);
  return std === 'en81-1' ? [...rows, en81_1(norma)] : rows;
}

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

/** The change of the loads in words: the increases and what they bring under the part of UNI 10411; `arcata`: the
 *  existing sling under them, to be checked for the new loads (arcata.ts). */
export function variazioneText(v: Variazione, arcata = false): string {
  const head = `portata ${pctText(v.dQ)}, T* ${pctText(v.dT)}, contrappeso ${pctText(v.dTcp)} della portata`;
  const lim = v.limiti ? ` (ammessi senza verifiche: ${pctText(v.limiti.Q)}, ${pctText(v.limiti.T)} e ${pctText(v.limiti.Tcp)}, UNI 10411-1, prospetti 1 e 2)` : '';
  const over = v.p1 || v.p2
    ? `: ${v.limiti ? 'oltre i limiti' : 'aumento (UNI 10411-11, 6.1)'}, le verifiche del carico entrano nell’esito`
    : v.calo ? ": un carico diminuisce, le verifiche del carico entrano nell’esito (ammortizzatori, paracadute progressivo)" : ': entro i limiti';
  const str = v.strutture ? `; oltre il ${num(KL.loadStruct11 * 100)} % anche le strutture dell’edificio (UNI 10411-11, 5)` : '';
  return `${head}${lim}${over}${str}.${arcata ? ARCATA : ''} Aggiornare la documentazione con i nuovi carichi.`;
}

/** The existing sling under an increased or unknown T*: what the engineer does (the check sl_frame of the result). */
const ARCATA = ' L’arcata esistente va verificata per i nuovi carichi (6.9) con i dati del suo costruttore o il calcolo del tecnico.';

/** A modification that changes the car or the load without the documented loads: T* cannot be compared. */
const carichiMancanti = (norma: Norma10411, arcata: boolean): string => `⚠ carichi documentati mancanti: T* non confrontabile con quello del verbale `
  + `di collaudo o dell’ultima verifica straordinaria (UNI ${norma}, 6.1); indicarli nei dati del collaudo.${arcata ? ARCATA : ''}`;

/** The rows of the data of the installation: the standards and, for a modification, what it replaces or changes, the
 *  answer about the CE marking and the change of the loads from the documented ones (`ora`: the design's). */
export function collaudoRows(C: Collaudo, repl: boolean, ora?: Carichi | null): [string, string][] {
  const uni = repl && C.norma !== 'en81', ce = uni ? marcaturaText(C) : null, doc = uni ? C.documentato : undefined;
  const v = doc && ora && C.norma !== 'en81' ? variazioneCarico(C.norma, doc, ora) : null;
  // the existing sling under a new car or rated load (arcata.ts); T* not comparable without the documented loads
  const arcata = uni && slingCheck(C, ora ?? null) !== null, missing = uni && tStarOf(C, ora ?? null) === 'ignoto';
  return [
    ['Normativa di riferimento per il collaudo', NORMA_SIGLA[C.norma]],
    ...(C.aggiuntive?.length ? [['Altre normative di collaudo', aggiunteText(C)] as [string, string]] : []),
    ...(repl ? [['Parti sostituite o modificate', partiText(C)] as [string, string]] : []),
    ...(ce ? [['Marcatura CE dell’impianto', ce] as [string, string]] : []),
    ...(doc ? [['Carichi documentati (portata · cabina · contrappeso)', `${num(doc.Q)} · ${num(doc.P)} · ${num(doc.Mcw)} kg`] as [string, string]] : []),
    ...(v ? [['Variazione dei carichi', variazioneText(v, arcata)] as [string, string]] : []),
    ...(missing && C.norma !== 'en81' ? [['Variazione dei carichi', carichiMancanti(C.norma, arcata)] as [string, string]] : []),
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

/** The section of the adaptations: its title and blocks, the machine's then those of the other parts replaced or
 *  changed (norme-collaudo.ts obblighiParti). `t` reads the calculator's texts. */
export function adaptSection(C: Collaudo, repl: boolean, t: Tr): { title: string; blocks: ReportBlock[] } {
  if (!repl) return { title: t('c_ucmp'), blocks: [{ t: 'p', text: t('n_new') }] };
  if (C.norma === 'en81') return { title: t('c_adapt_en81'), blocks: [{ t: 'p', text: t('a_en81') }] };
  const altre = obblighiParti(C), others: ReportBlock[] = altre.length
    ? [{ t: 'h3', text: 'Altre parti sostituite o modificate' }, { t: 'list', items: altre.map(punto) }] : [];
  if (adeguamentiDovuti(C)) {
    return { title: t('c_adapt'), blocks: [{ t: 'list', items: ADAPT.map((k) => t(k)) }, { t: 'p', text: t('a_src'), style: 'note' }, ...others] };
  }
  if (C.parti.includes('machine')) return { title: t('c_adapt_11'), blocks: [{ t: 'p', text: t('a_11') }, ...others] };
  return { title: t('c_adapt_other'), blocks: [{ t: 'p', text: t('a_other', { norma: NORMA_SIGLA[C.norma] }) }, ...others] };
}

/** The note of sheet 1 on the acceptance test: a modification's parts, the standards added (none when tested as new
 *  to EN 81-20/50 alone); with the design's loads `ora`, the documented loads missing and the existing sling to check
 *  for the new loads (arcata.ts). */
export function collaudoNote(C: Collaudo, tag: string, ora?: Carichi | null): { title: string; tag: string; text: string } | null {
  const added = C.aggiuntive?.length ? ` Anche secondo ${(C.aggiuntive ?? []).map((n) => NORMA_BREVE[n]).join(' e ')}: ogni normativa ha il suo esito, quello del collaudo è il peggiore.` : '';
  if (C.norma === 'en81') return added ? { title: 'COLLAUDO', tag, text: `Collaudo secondo ${NORMA_SIGLA.en81}.${added}` } : null;
  const rif = C.rifacimento ? " Rifacimento con l’arcata esistente: l’arcata resta quella dell’impianto, collaudato come modifica." : '';
  const carichi = ora !== undefined && tStarOf(C, ora) === 'ignoto' ? ` Carichi documentati mancanti: T* non confrontabile (UNI ${C.norma}, 6.1).` : '';
  const arcata = ora !== undefined && slingCheck(C, ora) ? ' L’arcata esistente va verificata per i nuovi carichi (6.9).' : '';
  return { title: 'COLLAUDO', tag, text: `Collaudo secondo ${NORMA_SIGLA[C.norma]}.${rif}${carichi}${arcata}${added} Parti sostituite o modificate: ${partiText(C)}. Le verifiche con esito `
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

/** The parts a modification replaces or changes besides the machine: modifications too, the case of DPR 162/1999 art. 2
 *  c.1 lett. cc) of each for the engineer to name (the list of the cases is not in the texts read). */
function altreModifiche(C: Collaudo): PuntoInSito[] {
  const altre = C.norma === 'en81' ? [] : C.parti.filter((p) => p !== 'machine');
  return altre.length ? [{ rif: 'DPR 162/1999, art. 2 c.1 lett. cc)', stato: 'da_verificare',
    testo: `sono modifiche costruttive anche le altre parti sostituite o modificate (${altre.map((p) => LIFT[`parte_${p}` as const].toLowerCase()).join(', ')}): `
      + 'il caso della lettera cc) di ciascuna lo indica il tecnico nella comunicazione' }] : [];
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
    { t: 'list', items: [...ADEMPIMENTI[repl ? 'modifica' : 'nuovo'], ...(repl ? altreModifiche(C) : [])].map(punto) },
  ];
  for (const n of normeOf(C)) {
    const info = NORME_INFO[n];
    out.push({ t: 'h3', text: NORMA_SIGLA[n] }, { t: 'p', style: 'note', text: `Citazione: ${info.citazione}.${info.avviso ? ` Attenzione: ${info.avviso}.` : ''}` });
    if (info.punti.length) out.push({ t: 'list', items: info.punti.map(punto) });
  }
  return out;
}
