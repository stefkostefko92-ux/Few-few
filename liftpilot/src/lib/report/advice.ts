// The machine to order among SICOR's and Montanari's in the relazione (Italian): every model that takes the
// installation in the order of the advice (src/lib/lift/advice.ts), the first of each maker marked, why the first comes
// first, where each machine's data come from. Informative: the calculation verifies the machine of the record. Pure.
import appIt from '../../../messages/it.json';
import type { MachineAdvice, MachineCandidate } from '../lift/advice';
import { dvText, excludedText, fillText, machineName, whyValues } from '../present/advice';
import type { BlockStatus, ReportBlock } from './model';

type Fmt = (x: number, dec?: number) => string;

const result = (c: MachineCandidate): string => (c.fails ? `${c.fails === 1 ? 'una verifica non passa' : `${c.fails} verifiche non passano`}`
  : c.warns ? `passa, ${c.warns === 1 ? 'un avviso' : `${c.warns} avvisi`}` : 'passa le verifiche del software');
const status = (c: MachineCandidate): BlockStatus => (c.fails ? 'fail' : c.warns ? 'warn' : 'ok');

export function adviceBlocks(A: MachineAdvice, fmt: Fmt): ReportBlock[] {
  const T = appIt.advice;
  if (!A.candidates.length) return [{ t: 'p', text: T.none_all }];
  const defl = A.candidates.some((c) => c.I.layout === 'topDefl'), d = (x: number): string => fmt(x, Number.isInteger(x) ? 0 : 1);
  const head = ['Argano', 'Rapporto · v', 'Puleggia · funi', 'Statico ammesso', 'Massa', ...(defl ? ['Basamento con rinvio'] : []), 'Fonte', 'Esito'];
  const widths = defl ? [0.17, 0.12, 0.13, 0.12, 0.08, 0.13, 0.07, 0.18] : [0.2, 0.14, 0.15, 0.14, 0.09, 0.08, 0.2];
  const rows = A.candidates.map((c, k) => [
    `${k + 1}. ${A.best.includes(c) ? '★ ' : ''}${machineName(c)}`, `${c.ratio} · ${dvText(c.dv, fmt)} %`, `Ø ${fmt(c.N.D, 0)} · ${c.N.n} × Ø ${d(c.N.d)}`,
    `${fmt(c.staticKg, 0)} kg (${fmt(c.testKg, 0)} in prova)`, c.mass === null ? '—' : `${fmt(c.mass, 0)} kg`,
    ...(defl ? [c.I.layout !== 'topDefl' ? '—' : c.bedplate ? `${c.bedplate.code} del costruttore` : 'su misura'] : []), c.sources.join(' + '), result(c),
  ]);
  const [a, b] = A.best, left = excludedText(A);
  return [
    { t: 'p', text: 'Ogni argano SICOR e Montanari a catalogo verificato con questo impianto, in ordine sui dati: verifiche, fonte dei dati, basamento con il '
      + 'rinvio, taglia che basta, valori al limite, disegno, velocità, massa; il prezzo non entra nella scelta. ★ il primo di ogni costruttore. È un ordine '
      + 'tecnico sui dati dei cataloghi, non un giudizio sulla qualità né una raccomandazione commerciale; SICOR e Montanari sono marchi dei rispettivi '
      + 'titolari, citati solo per identificare i prodotti. La verifica di questa relazione resta quella dell’argano del calcolo.' },
    { t: 'grid', head, rows, status: A.candidates.map(status), statusCol: head.length - 1, widths, align: head.map((_, j) => (j === 3 || j === 4 ? 'r' : 'l')) },
    ...(a && A.why ? [{ t: 'p' as const, text: fillText(T[`why_${A.why}`], whyValues(a, b, fmt)) }] : []),
    ...A.none.map((brand) => ({ t: 'p' as const, style: 'note' as const, text: fillText(T.none_brand, { brand }) })),
    ...(left ? [{ t: 'p' as const, style: 'note' as const, text: fillText(T.excluded, { list: left }) }] : []),
    { t: 'p', style: 'note', text: T.data_note },
  ];
}
