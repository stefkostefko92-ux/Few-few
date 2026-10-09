// Parts of the relazione di calcolo (build.ts), kept apart for its size: the machine's proposal, the registry entries
// used with their status, the note on the machine's mass the loads take, the rope geometry entered against the shaft
// design's, the rope schemes of a machine below, the space under the shaft of one under the pit, the tables' cells.
// Italian texts. Pure.
import { VOCI, type Stato, type Voce } from '@/calc/norme';
import { SHEAVE_GRID } from '@/calc/sizing';
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
import type { BlockStatus, ReportBlock } from './model';
import type { BottomScheme } from '../lift/bottom';
import { dropSheaves, type SheaveHold } from '../lift/direct';
import type { Cell } from '../present/tables';
import { KV_VERT } from '@/shaft';

type Fmt = (x: number, dec?: number) => string;

export const STATO: Record<Stato, string> = { confermato: 'confermato', da_verificare: 'da verificare', stima: 'stima', derivazione: 'derivazione', scelta: 'scelta del software', prassi: 'prassi di cantiere' };

/** The proposal of the machine (informative): the catalogue's machine the one form's proposal took (`catalog`), else
 *  the sizing — with a lift design's direct pull only the sheave its plan hangs the falls from (`hold`, direct.ts). */
export function proposalBlocks(x: { X: Texts; fmt: Fmt; N: Machine; sizing: Sizing; hold: SheaveHold; catalog: ValueMarks['catalog']; machine: MachineSpec | null;
  through: boolean; design: boolean }): ReportBlock[] {
  const { X, fmt, N, sizing, catalog: c } = x, B: ReportBlock[] = [];
  if (c) {
    B.push({ t: 'p', text: `Argano a catalogo: ${c.brand} ${c.model}, rapporto ${c.ratio}, carico statico ammesso ${fmt(c.staticKg, 0)} kg `
      + `(fonte: ${c.src}). Il calcolo usa questo rapporto, il carico statico e la massa del catalogo; motore, gola e freno sono dimensionati dal `
      + 'software con il rapporto del catalogo e con la geometria dell’argano com’è; i dati vanno verificati sulla scheda del costruttore prima dell’ordine.' });
    const S = shapeOf(c.brand, c.model);
    if (S) B.push({ t: 'kv', rows: shapeRows(S, N.D, fmt, x.machine?.rinvio ?? null, x.through) });
    // the machine verified is the catalogue's: the sizing's grid would describe another machine
    B.push({ t: 'p', style: 'note', text: 'Il dimensionamento su griglia del software non si riporta: l’argano verificato è quello del catalogo indicato sopra.' });
  } else if (sizing.pick) {
    B.push({ t: 'kv', rows: X.proposalRows(sizing.pick, N, x.hold, !!sizing.keep) });
    B.push({ t: 'h3', text: X.altText(sizing) });
    B.push({ t: 'grid', head: X.proposalHead(), rows: sizing.options.map((o) => X.proposalCells(o, sizing.pick)), widths: [0.16, 0.14, 0.16, 0.1, 0.12, 0.16, 0.16] });
    if (x.design) B.push({ t: 'p', style: 'note', text: sheaveNote(x.hold, sizing.pick.D, N.D, fmt) });
  } else {
    B.push({ t: 'p', text: x.hold === 'drop' ? `${DROP(N.D, fmt)}. ${dropSheaves(N.D).length ? X.noneText(sizing) : `È fuori dalla gamma del dimensionamento (da ${SHEAVE_GRID[0]} `
      + `a ${SHEAVE_GRID[SHEAVE_GRID.length - 1]} mm): il software non propone un argano, e con questa calata va scelto con il costruttore.`}` : X.noneText(sizing) });
  }
  B.push({ t: 'p', text: X.critText(sizing), style: 'note' });
  return B;
}

/** A direct pull's sheave: the plan's drop (registry impianto.calata). */
const DROP = (D: number, fmt: Fmt): string => `Tiro diretto: le due calate scendono dai lati della puleggia di frizione, che ha quindi il diametro della calata `
  + `del piano, Ø ${fmt(D, 0)} mm (voce impianto.calata)`;

/** What the proposal of a lift design's relazione is computed with: on a direct pull the plan's sheave, which another
 *  machine cannot change without a new project; else the verified sheave's geometry — a proposal with another sheave
 *  (`D` against the verified `Dv`) is not the machine verified, and its own geometry is still to be checked. */
function sheaveNote(hold: SheaveHold, D: number, Dv: number, fmt: Fmt): string {
  if (hold === 'drop') {
    return `${DROP(Dv, fmt)}: la proposta e le alternative hanno questa puleggia. Un argano con un’altra puleggia richiede la puleggia di rinvio nel `
      + 'locale macchina o gli attacchi delle funi spostati, e il progetto va ripetuto.';
  }
  const alt = `con un’altra puleggia la calata, la distanza del rinvio e l’angolo di avvolgimento del progetto cambiano`;
  return D === Dv ? `Le alternative sono calcolate con la geometria della puleggia verificata (Ø ${fmt(Dv, 0)} mm): ${alt}, e la verifica va ripetuta nel progetto.`
    : `⚠ La puleggia proposta (Ø ${fmt(D, 0)} mm) non è quella verificata nel progetto (Ø ${fmt(Dv, 0)} mm): proposta e alternative sono calcolate con la `
      + `geometria della puleggia verificata, e ${alt}. Prima di sceglierla il progetto va ripetuto con quella puleggia.`;
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

/** The rope schemes of a machine below, in the relazione's words (src/lib/lift/bottom.ts). */
export const BOTTOM_IT: Readonly<Record<BottomScheme, string>> = {
  head: 'in basso, rinvii in testata, macchina accanto al vano',
  room: 'in basso, locale pulegge sopra il vano, macchina accanto al vano',
  under: 'macchina sotto il vano, rinvii in testata',
};

export const cellText = (c: Cell | undefined): string => (c === undefined ? '' : typeof c === 'string' ? c : `${c.text}${c.flag ? ' ⚠' : ''}${c.sub ? `\n${c.sub}` : ''}`);
export const rowStatus = (row: readonly Cell[]): BlockStatus => { const s = row.find((c) => typeof c === 'object' && c.status); return typeof s === 'object' && s.status ? s.status : ''; };

/** A machine under the pit: the space under the shaft as sheet 1 has it (its note, its row and the check sg_cw;
 *  registry paracadute.contrappeso) — the pit floor for its load besides P5–P8, the counterweight's safety gear given in
 *  the data of the installation, in a modification (UNI 10411-1/-11) an existing pillar in its place as the designer
 *  chooses. */
export function underPitText(modification: boolean): string {
  const K = KV_VERT, v = K.cwGearInstantV;
  return `Spazio accessibile sotto il vano (UNI EN 81-20:2020, 5.2.5.4): fondo della fossa progettato per almeno ${K.pitFloorAccessible} N/m² oltre ai `
    + 'carichi P5–P8 del foglio 1 delle tavole (sotto ogni guida del contrappeso anche la presa del paracadute); paracadute del contrappeso, '
    + `progressivo oltre ${v} m/s e fino a ${v} m/s anche istantaneo, azionato dal limitatore o, fino a ${v} m/s, dalla rottura della sospensione o `
    + 'da una fune di sicurezza: tipo e azionamento si indicano nei dati dell’impianto e la verifica del foglio 1 non passa finché mancano'
    + (modification ? '; in una modifica può stare al suo posto un pilastro esistente fino al terreno sotto gli ammortizzatori del contrappeso, '
      + 'verificato per i nuovi carichi (UNI 10411-1:2024, 6.14): è una scelta del progettista' : '');
}
