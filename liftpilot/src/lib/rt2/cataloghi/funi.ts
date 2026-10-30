// The ropes of the owner's model (sheet «Funi», round 52; the owner holds the rights, owner's decision): the two lists of
// suspension ropes it offers — «FUNI DONATI (Uber)» and «FUNI TELCAL» — and its compensation chains and ropes, as the
// model lists them (values with their source: the model, sheet and cells). The model's Donati rows of 114 wires have
// no section, mass or breaking load: they are not offered (correction E-F2: a rope without its data is never computed),
// nor its row «15» without data; its index column skips 10 (P214 = 8, E-F1): each rope here has its own id. Pure.

export interface FunePeso {
  /** «donati:10-152» */
  id: string;
  marca: 'Donati' | 'Telcal';
  /** the model's «Tipo Fune» */
  tipo: string;
  d: number;
  trefoli: number;
  /** metallic section [mm²], mass [kg/m], minimum breaking load [N] */
  S: number;
  q: number;
  MBL: number;
  /** wire grade [N/mm²] and construction, as written */
  classe: string;
  formazione: string;
}

const D = (tipo: string, d: number, S: number, q: number, MBL: number): FunePeso =>
  ({ id: `donati:${tipo}`, marca: 'Donati', tipo, d, trefoli: 8, S, q, MBL, classe: '1370/1770', formazione: '8*19S + FC = 152 fili' });
const T = (tipo: string, d: number, trefoli: 6 | 8, S: number, q: number, MBL: number): FunePeso =>
  ({ id: `telcal:${tipo}`, marca: 'Telcal', tipo, d, trefoli, S, q, MBL, classe: '1370/1770', formazione: trefoli === 6 ? '6*19 + FC = 114 fili' : '8*19 + FC = 152 fili' });

/** «FUNI DONATI (Uber)», Funi!P205:Y220 (the rows with data). */
export const FUNI_DONATI: readonly FunePeso[] = [
  D('8-152', 8, 23.7, 0.22, 29400), D('9-152', 9, 27.9, 0.27, 37300), D('10-152', 10, 36.5, 0.34, 46000), D('11-152', 11, 44, 0.42, 55700),
  D('12-152', 12, 52.6, 0.51, 66200), D('13-152', 13, 58.2, 0.58, 77700), D('16-152', 16, 88.4, 0.87, 118000),
];

/** «FUNI TELCAL», Funi!P232:Y248. */
export const FUNI_TELCAL: readonly FunePeso[] = [
  T('8-114', 8, 6, 26, 0.24, 33200), T('8-152', 8, 8, 23, 0.22, 28100), T('9-114', 9, 6, 32, 0.3, 42000), T('9-152', 9, 8, 29, 0.28, 35600),
  T('10-114', 10, 6, 40, 0.37, 51800), T('10-152', 10, 8, 36, 0.34, 44000), T('11-114', 11, 6, 48, 0.45, 62700), T('11-152', 11, 8, 44, 0.42, 53200),
  T('12-114', 12, 6, 57, 0.53, 74600), T('12-152', 12, 8, 52, 0.49, 63300), T('13-114', 13, 6, 67, 0.62, 87600), T('13-152', 13, 8, 61, 0.58, 74300),
  T('15-114', 15, 6, 90, 0.83, 117000), T('15-152', 15, 8, 81, 0.77, 98900), T('16-152', 16, 8, 92, 0.88, 113000),
];

export const FUNI_CATALOGO: readonly FunePeso[] = [...FUNI_DONATI, ...FUNI_TELCAL];
export const funeDi = (id: unknown): FunePeso | null => FUNI_CATALOGO.find((f) => f.id === id) ?? null;
/** The rope as the lists write it: «Telcal 10-152». */
export const nomeFune = (f: FunePeso): string => `${f.marca} ${f.tipo}`;

/** A compensation chain or rope: diameter of the rope or link [mm], mass [kg/m]. */
export interface CompVoce { d: number; q: number }

/** «Catene di compensazione», Funi!AE115:AG123 (the model's 10th row has no data). */
export const CATENE_COMP: readonly CompVoce[] = [
  { d: 5.4, q: 0.5 }, { d: 6.4, q: 0.8 }, { d: 7.5, q: 1.1 }, { d: 8, q: 1.35 }, { d: 10, q: 2 }, { d: 12, q: 2.6 }, { d: 14, q: 3.5 },
  { d: 16, q: 5.25 }, { d: 20, q: 8 },
];
/** «Funi compensazione», Funi!AI115:AK124. */
export const FUNI_COMP: readonly CompVoce[] = [
  { d: 8, q: 0.22 }, { d: 9, q: 0.28 }, { d: 10, q: 0.34 }, { d: 11, q: 0.42 }, { d: 12, q: 0.49 }, { d: 13, q: 0.58 }, { d: 14, q: 0.67 },
  { d: 15, q: 0.77 }, { d: 16, q: 0.88 }, { d: 17, q: 0.99 },
];
