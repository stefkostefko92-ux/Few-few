// Parts of the relazione di calcolo (build.ts), kept apart for its size: the machine's proposal, the registry entries
// used with their status, the note on the machine's mass the loads take, the rope geometry entered against the shaft
// design's. Italian texts. Pure.
import { VOCI, type Stato, type Voce } from '@/calc/norme';
import type { Machine, Sizing } from '@/calc/types';
import type { VoceVano } from '@/shaft';
import { shapeOf } from '../catalog/shapes';
import type { MachineMass } from '../lift/machine-mass';
import type { ValueMarks } from '../lift/marks';
import { VOCI_IMPIANTO } from '../lift/norme';
import type { Texts } from '../present/texts';
import type { MachineSpec } from '@/shaft/machine-room';
import { LIMITI_MODELLO } from './cases';
import { shapeRows } from './machine-shape';
import type { ReportBlock } from './model';

type Fmt = (x: number, dec?: number) => string;

export const STATO: Record<Stato, string> = { confermato: 'confermato', da_verificare: 'da verificare', stima: 'stima', derivazione: 'derivazione', scelta: 'scelta del software', prassi: 'prassi di cantiere' };

/** The proposal of the machine (informative): the catalogue's machine taken, else the sizing on the grid. */
export function proposalBlocks(x: { X: Texts; fmt: Fmt; N: Machine; sizing: Sizing; m: ValueMarks; machine: MachineSpec | null; through: boolean; design: boolean }): ReportBlock[] {
  const { X, fmt, N, sizing, m } = x, B: ReportBlock[] = [];
  if (m.catalog) {
    B.push({ t: 'p', text: `Argano a catalogo: ${m.catalog.brand} ${m.catalog.model}, rapporto ${m.catalog.ratio}, carico statico ammesso ${fmt(m.catalog.staticKg, 0)} kg `
      + `(fonte: ${m.catalog.src}). Il calcolo usa questo rapporto, il carico statico e la massa del catalogo; motore, gola e freno sono dimensionati dal `
      + 'software con il rapporto del catalogo e con la geometria dell’argano com’è; i dati vanno verificati sulla scheda del costruttore prima dell’ordine.' });
    const S = shapeOf(m.catalog.brand, m.catalog.model);
    if (S) B.push({ t: 'kv', rows: shapeRows(S, N.D, fmt, x.machine?.rinvio ?? null, x.through) });
    // the machine verified is the catalogue's: the sizing's grid would describe another machine
    B.push({ t: 'p', style: 'note', text: 'Il dimensionamento su griglia del software non si riporta: l’argano verificato è quello del catalogo indicato sopra.' });
  } else if (sizing.pick) {
    B.push({ t: 'kv', rows: X.proposalRows(sizing.pick, N, sizing.fixedD, !!sizing.keep) });
    B.push({ t: 'h3', text: X.altText(sizing) });
    B.push({ t: 'grid', head: X.proposalHead(), rows: sizing.options.map((o) => X.proposalCells(o, sizing.pick)), widths: [0.16, 0.14, 0.16, 0.1, 0.12, 0.16, 0.16] });
    if (x.design) {
      B.push({ t: 'p', style: 'note', text: `Le alternative sono calcolate con la geometria della puleggia verificata (Ø ${fmt(N.D, 0)} mm): con un’altra puleggia `
        + 'la calata, la distanza del rinvio e l’angolo di avvolgimento del progetto cambiano, e la verifica va ripetuta nel progetto.' });
    }
  } else {
    B.push({ t: 'p', text: X.noneText(sizing) });
  }
  B.push({ t: 'p', text: X.critText(sizing), style: 'note' });
  return B;
}

/** The registry entries the document uses — the checks', the model's limits, the shaft's, the values the software
 *  filled in (`filled`) — with their status. */
export function vociBlocks(ids: ReadonlySet<string>, vano: readonly VoceVano[], filled: ReadonlySet<string>): ReportBlock[] {
  const used: readonly Voce[] = VOCI.filter((v) => v.verifiche?.some((c) => ids.has(c)));
  const listed = [...used, ...VOCI.filter((v) => LIMITI_MODELLO.includes(v.id)), ...vano, ...VOCI_IMPIANTO.filter((v) => filled.has(v.id))];
  return [{ t: 'grid', head: ['Voce', 'Valore nel software', 'Dove si verifica', 'Stato'], rows: listed.map((v) => [v.titolo, v.valore, v.riferimento, STATO[v.stato]]),
    status: listed.map((v) => (v.stato === 'confermato' ? 'ok' : v.stato === 'da_verificare' ? 'warn' : 'info')), widths: [0.27, 0.33, 0.26, 0.14], align: ['l', 'l', 'l', 'l'] }];
}

const KIND_IT = { totale: 'l’argano completo', senza_volano_puleggia: 'l’argano senza volano e puleggia', senza_puleggia: 'l’argano senza puleggia',
  riduttore: 'il solo riduttore, senza motore, volano e puleggia' } as const;

/** What the machine's mass of the calculation is, and the whole machine the loads on the building take (registry
 *  impianto.massa.argano); none when it is the whole machine. */
export function massNote(w: MachineMass, catalogue: number, fmt: Fmt): ReportBlock[] {
  if (!w.estimate) return [];
  const parts = [...(w.motor ? [`motore ${fmt(w.motor, 0)} kg`] : []), ...(w.sheave ? [`puleggia ${fmt(w.sheave, 0)} kg`] : []), ...(w.flywheel ? [`volano ${fmt(w.flywheel, 0)} kg`] : [])];
  return [{ t: 'p', style: 'note', text: `⚠ La massa del catalogo (${fmt(catalogue, 0)} kg) è ${KIND_IT[w.kind]}: nei carichi sull’edificio (soletta, travi, foglio 1 `
    + `delle tavole) il software conta l’argano completo, ${fmt(w.kg, 0)} kg, con la stima di ciò che manca (${parts.join(', ')}; voce impianto.massa.argano); `
    + 'nel calcolo e nel tiro sugli ancoraggi resta la massa del catalogo. Sostituire la stima con la massa dell’argano completo dalla scheda del costruttore.' }];
}

/** The rope beyond the travel or a machine below's Hv entered by hand, with the shaft design's value beside it. */
export const drawnText = (entered: number, drawn: number | null | undefined, fmt: Fmt): string =>
  (drawn == null ? '' : Math.abs(entered - drawn) < 0.005 ? ' (inserita, uguale al progetto del vano)' : ` (inserita a mano; dal progetto del vano ${fmt(drawn, 2)} m ⚠)`);
