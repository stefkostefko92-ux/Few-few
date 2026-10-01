// Geared traction machines of the makers the engineer can pick (research/argano-geared/12-catalogo-argani.md): the
// ratios, the sheaves, the static load allowed on the shaft, the payloads the maker states, the motors and the mass.
// Every value comes from the search engines' extracts of the makers' and dealers' pages read on 2026-10-01 (the
// documents themselves could not be opened): it is to be checked on the maker's sheet before an order. Speeds: SICOR
// gives the car's (synchronous), Sassi the sheave's. Pure.

export type Brand = 'SICOR' | 'Sassi' | 'Montanari';
export const BRANDS: readonly Brand[] = ['SICOR', 'Sassi', 'Montanari'];

export interface CatalogMachine {
  brand: Brand;
  model: string;
  /** reduction ratios as the catalogue writes them: starts/teeth */
  ratios: readonly string[];
  /** sheave diameters the maker lists [mm]; null: not found */
  sheaves: readonly [number, number] | null;
  /** static load allowed on the shaft [kg] */
  staticKg: number;
  /** payloads the maker states for 1:1 and 2:1 [kg]; null: not found or roping not stated */
  payload: { r1: number | null; r2: number | null };
  /** motor outputs [kW] and mass [kg]; null: not found */
  kW: readonly [number, number] | null;
  mass: number | null;
  /** where the values come from: the maker's page (E), a dealer (R), an earlier round (P) */
  src: string;
}

const m = (brand: Brand, model: string, ratios: string, sheaves: readonly [number, number] | null, staticKg: number, r1: number | null, r2: number | null,
  kW: readonly [number, number] | null, mass: number | null, src: string): CatalogMachine => ({ brand, model, ratios: ratios.split(' '), sheaves, staticKg, payload: { r1, r2 }, kW, mass, src });

export const MACHINES: readonly CatalogMachine[] = [
  m('SICOR', 'SV110', '1/55 1/43', [480, 520], 2000, null, null, [2.7, 4], 160, 'E: pagina Geared SV110'),
  m('SICOR', 'SH110B', '1/55 1/43 2/43 2/55', [320, 600], 2100, 400, null, [2.7, 5.5], 210, 'E: Technical Sheet SH110B 2025'),
  m('SICOR', 'MR12C', '1/52 1/45 1/43 2/53 2/43', [340, 550], 2600, null, null, [2.7, 5.5], null, 'E: Scheda tecnica MR12C 2025'),
  m('SICOR', 'SH130', '1/52 1/45 1/43 1/37 2/53 2/43 3/47', [320, 700], 2600, null, null, [2.7, 7.5], 260, 'E: pagina Geared SH130'),
  m('SICOR', 'SH130G', '1/52 1/43 1/37', null, 2900, null, null, [5.5, 7.5], 250, 'E: pagina Geared SH130G'),
  m('SICOR', 'SH140', '1/71 1/59 1/52 1/45 1/37 2/71 2/53 3/47', null, 3300, null, null, [4, 11], 280, 'E: Technical Sheet SH140 2025'),
  m('SICOR', 'SH160', '1/55 1/43 1/35 2/53 2/43 3/41', null, 4300, null, null, null, 470, 'E: pagina Geared SH160'),
  m('SICOR', 'SH190', '1/40 1/51 1/62 2/59 3/47', [520, 650], 5200, null, null, [7.5, 30], 620, 'E: Technical Sheet SH190 2025'),
  m('SICOR', 'MR21', '1/62 1/51 1/40 2/63 2/51 3/47', null, 5600, null, null, [7.5, 30], 1000, 'E: pagina Geared MR21'),
  m('SICOR', 'MR26', '1/72 1/57 1/44 2/63 2/45 3/55', null, 6600, null, null, null, 1600, 'E: pagina Geared MR26'),
  m('SICOR', 'MR35', '1/58 1/53 2/73 2/60 3/70 3/53', null, 14200, null, null, null, 1900, 'E: pagina Geared MR35'),
  m('SICOR', 'MR12 (storico)', '1/52 1/43 2/53 2/43', [480, 600], 2600, null, null, null, 240, 'R: copie di terzi del listino MR12'),
  m('SICOR', 'MR16 (storico)', '1/55 1/43 1/35 2/53 2/43 3/41', null, 4300, null, null, [5.1, 20], 450, 'R: schede di rivenditori'),
  m('SICOR', 'MR17 (storico)', '1/55 1/43 1/35 2/43 3/41', null, 5200, null, null, [5.5, 15], 550, 'R: schede di rivenditori'),
  m('Sassi', 'MODY', '1/37 1/49 1/60 2/47 3/41', [320, 600], 2300, 480, 630, [2.2, 6.6], null, 'E: sassi.it, MODY'),
  m('Sassi', 'LEO', '1/71 1/55 1/45 2/71 2/57 3/47', [320, 700], 3000, 630, 1000, [3.3, 11], null, 'E: sassi.it, LEO'),
  m('Sassi', 'TORO', '1/61 1/49 1/39 2/53 3/47', [520, 600], 4200, 1000, 2000, [3.3, 20.6], 299, 'E: sassi.it, TORO; R: pulegge 520 e 600'),
  m('Sassi', 'MF48', '1/60 1/47 2/71 3/56', null, 3100, 630, 1000, [3.3, 11.4], null, 'E: sassi.it, serie MF'),
  m('Sassi', 'MF84', '1/65 1/48 1/39 2/53 2/39 3/47', null, 6000, 1600, 3000, [5.9, 27.9], null, 'E: sassi.it, serie MF'),
  m('Sassi', 'MF94', '1/65 1/53 2/71 2/53 4/67', [650, 1000], 8000, 2500, 4000, [11, 27.9], 623, 'E: sassi.it, serie MF'),
  m('Montanari', 'M73', '1/75 1/46', [700, 700], 2200, 480, null, [3, 5.5], null, 'R: fceu.eu, Donati M73S; statico 2200–3500 kg secondo la versione'),
];

/** i of a ratio "starts/teeth": teeth over starts. */
export const ratioValue = (r: string): number => {
  const [a, b] = r.split('/').map(Number);
  return b / a;
};

/** How a machine of the catalogue takes an option of the sizing: the ratio nearest the ideal one and the speed it
 *  gives, or why it does not (sheave, static load, motor, payload, ratio farther than `tol`). */
export interface CatalogFit {
  machine: CatalogMachine;
  ratio: string | null;
  i: number;
  /** the car's speed with that ratio over the rated one, less 1 */
  dv: number;
  fails: readonly ('sheave' | 'static' | 'motor' | 'payload' | 'ratio')[];
}

export function catalogFit(c: CatalogMachine, o: { D: number; iIdeal: number; Pn: number; staticKg: number; Q: number; r: number }, tol: number): CatalogFit {
  const near = [...c.ratios].sort((a, b) => Math.abs(ratioValue(a) / o.iIdeal - 1) - Math.abs(ratioValue(b) / o.iIdeal - 1))[0] ?? null;
  const i = near ? ratioValue(near) : 0, dv = near ? o.iIdeal / i - 1 : Infinity;
  const pay = o.r === 2 ? c.payload.r2 : c.payload.r1, fails: CatalogFit['fails'][number][] = [];
  if (c.sheaves && (o.D < c.sheaves[0] || o.D > c.sheaves[1])) fails.push('sheave');
  if (o.staticKg > c.staticKg) fails.push('static');
  if (c.kW && o.Pn > c.kW[1]) fails.push('motor');
  if (pay !== null && o.Q > pay) fails.push('payload');
  if (!(Math.abs(dv) <= tol)) fails.push('ratio');
  return { machine: c, ratio: near, i, dv, fails };
}

/** The machines of a brand (or one model of it) in the catalogue. */
export const catalogOf = (brand: Brand, model?: string): readonly CatalogMachine[] => MACHINES.filter((c) => c.brand === brand && (!model || c.model === model));
