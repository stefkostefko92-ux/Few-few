// The relazione tecnica di modifica after the owner's model (round 52, RT engine 2): the fascicolo of the Excel model the
// owner gave — «Dati Generali», one or more pages per component chosen, «Allegati» — with its inputs, formulas, texts and
// catalogues, corrected where the model contradicts the standard (docs/rules.md → «Relazione tecnica di modifica»,
// the list of the corrections). What LiftPilot already holds is read where it is — the calculation (loads, speed,
// travel, roping, ropes, machine), the acceptance test (documented loads, logbook, controller), the registry, the plant
// data — and never asked again; a component asks only what its page needs beyond that. The contract every component
// module implements (componenti/*.ts). Types and the lists the schemas need. Pure.
import type { FormValues, Results } from '@/calc/types';
import type { Libretto, Norma10411, Variazione, VariazioneVelocita } from '../lift/modifica';
import type { Parte } from '../lift/collaudo';
import type { RegimeKey } from '../rt/types';
import type { FBlock } from '../report/rt2/model';

/** The components of the fascicolo, in its order (the model's page counting): one module each (componenti/index.ts). */
export const COMPONENTI_RT2 = ['quadro', 'cabina', 'funi', 'guideCabina', 'ammCabina', 'contrappeso', 'ammCwt', 'macchina', 'limitatore', 'porte'] as const;
export type ComponenteRt2 = (typeof COMPONENTI_RT2)[number];
export const isComponenteRt2 = (x: unknown): x is ComponenteRt2 => COMPONENTI_RT2.some((c) => c === x);

/** The roping factor (the model's «Sospensione»: Diretto, Indiretto 1:2, Indiretto 1:4). */
export type Taglia = 1 | 2 | 4;
/** The machine room (the model's «Locale macchinario»). */
export type Locale = 'alto' | 'basso';
/** The drive (the model's «Azionamento»: 1 velocità, 2 velocità, VVVF). */
export type Azionamento = '1v' | '2v' | 'vvvf';
/** The model's «Ascensore per». */
export type AscensorePer = 'persone' | 'merci' | 'merci_carrelli';

/** The technical data of the first page, before or after the modification; null: not known (before: not documented —
 *  the same as after). */
export interface DatiTecnici {
  /** rated load [kg], the empty car complete [kg], the counterweight [kg] */
  Q: number | null;
  P: number | null;
  Mcw: number | null;
  /** rated speed [m/s], travel [m] */
  v: number | null;
  H: number | null;
  r: Taglia | null;
  locale: Locale | null;
  azionamento: Azionamento | null;
  /** persons, stops, the car's useful area [m²] */
  capienza: number | null;
  fermate: number | null;
  superficie: number | null;
}

/** What every component reads besides its own inputs: built once by the server from the base calculation, its
 *  acceptance test, the registry, the plant data and the RT's first page (contesto.ts). */
export interface ContestoRt2 {
  norma: Norma10411;
  dopo: DatiTecnici;
  prima: DatiTecnici;
  /** the regime the lift was approved under (the model's «Collaudato secondo»), when known */
  regime: RegimeKey | null;
  ascensorePer: AscensorePer;
  /** the parts the calculation's intervention replaces or changes («Sì»), the load/speed/travel changes among them */
  parti: readonly Parte[];
  /** what the logbook documents (speed, the speed after 50 Hz, travel): the speed's change is measured from it */
  libretto: Libretto | null;
  /** the change of the loads from the documented ones (UNI 10411-1 6.1, prospetti 1 and 2 on T* = P + Q — the model's
   *  rope tension corrected, E-DG-4) and of the speed from the logbook's (15.1, 15.16); null: nothing documented */
  carico: Variazione | null;
  velocita: VariazioneVelocita | null;
  /** the ropes replaced (the part «Funi» Sì; the model's «funi sostituzione») or only verified */
  funiSostituite: boolean;
  /** the base calculation: its values and, when they derive, its results (the ropes' safety by UNI EN 81-50, the
   *  traction cases) */
  calc: { V: FormValues; res: Results | null };
}

/** A value of a component's form. */
export type ValoreRt2 = number | string | boolean;
/** A component's inputs as entered (validated against its fields: campi.ts). */
export type DatiRt2 = Readonly<Record<string, ValoreRt2 | undefined>>;

export interface OpzioneRt2 {
  v: string;
  /** the label as the model writes it */
  t: string;
}

interface CampoBase {
  id: string;
  /** the label as the model writes it, with its number («90. Tipo di limitatore:»), unit apart */
  label: string;
  /** required to issue: always, or when this holds */
  req?: boolean | ((x: DatiRt2, ctx: ContestoRt2) => boolean);
  /** shown only when this holds (hidden fields are neither asked nor validated as required) */
  show?: (x: DatiRt2, ctx: ContestoRt2) => boolean;
  /** a rare refinement: hidden in «Semplice» (never when required or invalid) */
  esperto?: boolean;
}
export type CampoRt2 =
  | (CampoBase & { t: 'num'; unit?: string; min: number; max: number; step: number; int?: boolean })
  | (CampoBase & { t: 'scelta'; opzioni: readonly OpzioneRt2[] })
  | (CampoBase & { t: 'testo'; max: number })
  | (CampoBase & { t: 'si_no' })
  /** a heading inside the component's card (the model's group titles); no value */
  | { id: string; t: 'gruppo'; label: string; show?: (x: DatiRt2, ctx: ContestoRt2) => boolean };

/** How a check compares its value with its limit(s). */
export type ConfrontoRt2 = '>=' | '<=' | '>' | '<' | 'tra';
export type EsitoVerificaRt2 = 'ok' | 'fail' | 'warn' | 'info';

/** A check of a component: printed on its page next to its value, counted in the RT's verdict (info never). */
export interface VerificaRt2 {
  /** stable id «<componente>.<nome>» */
  id: string;
  /** what is checked, in Italian */
  testo: string;
  valore: number | null;
  limite: number | null;
  /** 'tra': the lower limit is `limite`, the upper one `limite2` */
  limite2?: number | null;
  confronto: ConfrontoRt2;
  unita: string;
  dec: number;
  esito: EsitoVerificaRt2;
  /** the clause with its standard («UNI EN 81-20:2020, 5.8.2.1.1») */
  rif: string;
}

export interface EsitoRt2 {
  verifiche: VerificaRt2[];
  /** the inputs required to issue that are missing (field ids), and the data of the base missing (texts) */
  mancanti: string[];
  /** the values the page prints and the screen shows, by name */
  valori: Readonly<Record<string, number | string | null>>;
  /** warnings for the screen (never blocking) */
  avvisi: string[];
}

/** The page header's data a component's pages print under the frame's «Matricola n° … Commessa n° …». */
export interface PaginaCtx {
  /** «Documentazione tecnica relativa alla modifica su impianto ascensore preesistente non conforme alla Direttiva
   *  Ascensori» (UNI 10411-1) or its counterpart for a lift built to the directives (UNI 10411-11) */
  titolo: string;
  /** the standard of reference as printed («UNI 10411-1:2024») */
  norma: string;
  /** the declaration of fitness of the building's structures among the attachments (allegati.ts idoneitaEdificio): the
   *  pages that state the forces on the structures refer to it instead of declaring them non-significant */
  idoneitaAllegata?: boolean;
}

/** A component of the fascicolo. */
export interface ModuloRt2 {
  id: ComponenteRt2;
  /** the name in the list of components and on the screen («Quadro di manovra») */
  titolo: string;
  campi: readonly CampoRt2[];
  /** the values the software proposes for empty fields (from the base, or the model's defaults); never written into
   *  the inputs — shown as «proposto» and used while the field stays empty */
  proposte?: (ctx: ContestoRt2) => DatiRt2;
  calcola: (ctx: ContestoRt2, x: DatiRt2) => EsitoRt2;
  /** the printed page(s): blocks, each page starting with { t: 'pagina' } and its title */
  pagine: (ctx: ContestoRt2, x: DatiRt2, e: EsitoRt2, p: PaginaCtx) => FBlock[];
}
