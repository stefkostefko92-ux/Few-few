// The machine to order among SICOR's and Montanari's in the relazione (Italian): every model that takes the
// installation in the order of the advice (src/lib/lift/advice.ts), the first of each maker marked, why the first comes
// first, where each machine's data come from. Informative: the calculation verifies the machine of the record. With a
// lift design's direct pull and none of them taking it, why: the sheave is the plan's drop (direct.ts). Pure.
import appIt from '../../../messages/it.json';
import type { MachineAdvice, MachineCandidate } from '../lift/advice';
import { dvText, excludedText, fillText, machineName, whyValues } from '../present/advice';
import type { BlockStatus, ReportBlock } from './model';

type Fmt = (x: number, dec?: number) => string;

const result = (c: MachineCandidate): string => (c.fails ? `${c.fails === 1 ? 'una verifica non passa' : `${c.fails} verifiche non passano`}`
  : c.warns ? `passa, ${c.warns === 1 ? 'un avviso' : `${c.warns} avvisi`}` : 'passa le verifiche del software');
const status = (c: MachineCandidate): BlockStatus => (c.fails ? 'fail' : c.warns ? 'warn' : 'ok');
/** The whole machine, with the catalogue's mass when the parts it leaves out are estimated (registry impianto.massa.argano). */
const massText = (c: MachineCandidate, fmt: Fmt): string => (c.massWhole === null ? '—'
  : c.massEstimated && c.mass !== null ? `≈ ${fmt(c.massWhole, 0)} kg ⚠ (catalogo ${fmt(c.mass, 0)} kg + stima)` : `${fmt(c.massWhole, 0)} kg`);

/** `drop`: the sheave [mm] a lift design's direct pull hangs its falls from (its plan's drop), null otherwise. */
export function adviceBlocks(A: MachineAdvice, fmt: Fmt, drop: number | null = null): ReportBlock[] {
  const T = appIt.advice;
  if (!A.candidates.length) {
    return drop ? [{ t: 'p', text: 'Nessun argano SICOR o Montanari a catalogo prende questo impianto con questi dati: resta l’argano verificato nel '
      + 'progetto, con la puleggia della calata del piano.' }, { t: 'p', style: 'note', text: dropNone(drop, fmt) }] : [{ t: 'p', text: T.none_all }];
  }
  const defl = A.candidates.some((c) => c.I.layout === 'topDefl'), d = (x: number): string => fmt(x, Number.isInteger(x) ? 0 : 1);
  const head = ['Argano', 'Rapporto · v', 'Puleggia · funi', 'Statico ammesso', 'Massa', ...(defl ? ['Basamento con rinvio'] : []), 'Fonte', 'Esito'];
  const widths = defl ? [0.17, 0.12, 0.13, 0.12, 0.08, 0.13, 0.07, 0.18] : [0.2, 0.14, 0.15, 0.14, 0.09, 0.08, 0.2];
  const rows = A.candidates.map((c, k) => [
    `${k + 1}. ${A.best.includes(c) ? '★ ' : ''}${machineName(c)}`, `${c.ratio} · ${dvText(c.dv, fmt)} %`, `Ø ${fmt(c.N.D, 0)} · ${c.N.n} × Ø ${d(c.N.d)}`,
    `${fmt(c.staticKg, 0)} kg (${fmt(c.testKg, 0)} in prova)`, massText(c, fmt),
    ...(defl ? [c.I.layout !== 'topDefl' ? '—' : c.bedplate ? `${c.bedplate.code} del costruttore` : 'su misura'] : []), c.sources.join(' + '), result(c),
  ]);
  const [a, b] = A.best, left = excludedText(A);
  return [
    { t: 'p', text: 'Ogni argano SICOR e Montanari a catalogo verificato con questo impianto, in ordine sui dati: verifiche, fonte dei dati, basamento con il '
      + 'rinvio, taglia che basta, valori al limite, disegno, velocità, massa dell’argano completo (dove il catalogo dà solo il riduttore o lo dà senza '
      + 'puleggia e volano, le parti mancanti sono stimate: voce impianto.massa.argano); il prezzo non entra nella scelta. ★ il primo di ogni costruttore. È un ordine '
      + 'tecnico sui dati dei cataloghi, non un giudizio sulla qualità né una raccomandazione commerciale; SICOR e Montanari sono marchi dei rispettivi '
      + 'titolari, citati solo per identificare i prodotti. La verifica di questa relazione resta quella dell’argano del calcolo.' },
    ...(A.wall ? [{ t: 'p' as const, style: 'note' as const, text: T.wall }] : []),
    { t: 'grid', head, rows, status: A.candidates.map(status), statusCol: head.length - 1, widths, align: head.map((_, j) => (j === 3 || j === 4 ? 'r' : 'l')) },
    ...(a && A.why ? [{ t: 'p' as const, text: fillText(T[`why_${A.why}`], whyValues(a, b, fmt)) }] : []),
    ...A.none.map((brand) => ({ t: 'p' as const, style: 'note' as const, text: fillText(T.none_brand, { brand }) })),
    ...(left ? [{ t: 'p' as const, style: 'note' as const, text: fillText(T.excluded, { list: left }) }] : []),
    { t: 'p', style: 'note', text: T.data_note },
  ];
}

/** None of the advice's makers takes a direct pull: its sheave is the plan's drop, which no machine of theirs takes with
 *  these data; another sheave asks for another project (the engineer's choice). */
const dropNone = (D: number, fmt: Fmt): string => `⚠ Con il tiro diretto la puleggia di frizione deve avere Ø ${fmt(D, 0)} mm, quanto la calata del piano `
  + '(voce impianto.calata), e nessun argano SICOR o Montanari a catalogo la prende con questi dati. Per un argano a catalogo serve la puleggia di '
  + 'rinvio nel locale macchina, che lascia libera la puleggia di frizione, oppure gli attacchi delle funi spostati perché la calata sia quella di una '
  + 'puleggia a catalogo: in entrambi i casi il progetto va ripetuto, e la scelta è del progettista.';
