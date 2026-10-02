// Geared traction machines of the makers the engineer can pick (research/argano-geared/12-catalogo-argani.md): the
// ratios, the sheaves, the static load allowed on the shaft, the payloads the maker states, the largest motor and the
// mass. SICOR's current models come from the maker's technical sheets of 2025, downloaded from sicoritaly.com on
// 2026-10-02 (the conventional single wrap; the largest motor at 50 Hz, 4 poles VVVF; of a mass range the larger); the
// other makers' from the search engines' extracts of their and their dealers' pages read on 2026-10-01/02 (the documents
// themselves could not be opened). Every value is to be checked on the maker's sheet before an order. Speeds: SICOR
// gives the car's (synchronous), Sassi the sheave's. Montanari's mass is the gearbox's (without motor, sheave and
// flywheel), and its sheaves are those of the maker's typical configurations. GEM's mass is the machine's average.
// FAER's P58F and P58S are the ones GEAT Elevators (Naples) sells: GEAT distributes machines and builds none. Pure.

export const BRANDS = ['SICOR', 'Sassi', 'Montanari', 'GEM', 'FAER'] as const;
export type Brand = (typeof BRANDS)[number];

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
  /** the largest motor the maker lists [kW] and the mass [kg]; null: not found */
  kWmax: number | null;
  mass: number | null;
  /** where the values come from: the maker's page (E), a dealer (R), a copy of the maker's document (D), an earlier
   *  round (P) */
  src: string;
}

const m = (brand: Brand, model: string, ratios: string, sheaves: readonly [number, number] | null, staticKg: number, r1: number | null, r2: number | null,
  kWmax: number | null, mass: number | null, src: string): CatalogMachine => ({ brand, model, ratios: ratios.split(' '), sheaves, staticKg, payload: { r1, r2 }, kWmax, mass, src });

const MONTANARI = 'E: montanarigiulio.com';
const M73 = '1/75 1/60 1/52 1/46 1/37 2/55 2/37', M75 = '1/52 1/50 1/37 2/55 2/37', M83 = '1/69 1/60 1/50 1/43 1/37 2/42 2/50';
const M93 = '1/62 1/50 1/43 1/39 2/49 3/47 4/51', M98 = '1/65 1/52 1/47 1/37 2/61 2/49 4/57', HW134 = '1/37 1/42 1/53 1/65';

export const MACHINES: readonly CatalogMachine[] = [
  m('SICOR', 'SV110', '1/55 1/43', [480, 600], 2000, null, null, 5.5, 160, 'D: scheda tecnica SV110 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'SH110B', '1/55 1/43 2/43 2/55', [320, 600], 2100, 400, null, 5.5, 200, 'D: scheda tecnica SH110B 2025 (sicoritaly.com, 2 ottobre 2026); E: portata 400 kg'),
  m('SICOR', 'MR12C', '1/55 1/43 2/43 2/55', [340, 600], 2600, null, null, 6.7, 240, 'D: scheda tecnica MR12C 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'SH130', '1/52 1/45 1/43 1/37 2/43', [320, 700], 2600, null, null, 7.5, 250, 'D: scheda tecnica SH130 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'SH130G', '1/52 1/43 1/37', [480, 600], 2900, null, null, 7.5, 250, 'D: scheda tecnica SH130G 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'SH140', '1/71 1/59 1/52 1/45 1/37 2/71 2/53 3/47', [360, 600], 3300, null, null, 11, 280, 'D: scheda tecnica SH140 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'SH160', '1/55 1/43 1/35 2/53 2/43 3/41', [450, 700], 4300, null, null, 20, 450, 'D: scheda tecnica SH160 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'SH190', '1/40 1/51 1/62 2/59 3/47', [520, 750], 5200, null, null, 30, 620, 'D: scheda tecnica SH190 2025 (sicoritaly.com, 2 ottobre 2026)'),
  m('SICOR', 'MR21', '1/62 1/51 1/40 2/63 2/51 3/47', [520, 750], 5600, null, null, 30, 1000, 'D: scheda tecnica MR21 2025 (sicoritaly.com, 2 ottobre 2026); massa 770–1000 kg, la maggiore'),
  m('SICOR', 'MR26', '1/72 1/57 1/44 2/63 2/45 3/55', [600, 800], 6600, null, null, 43, 1600, 'D: scheda tecnica MR26 2025 (sicoritaly.com, 2 ottobre 2026); massa 1200–1600 kg, la maggiore'),
  m('SICOR', 'MR35', '1/58 1/53 2/73 2/60 3/70 3/53', [690, 885], 14200, null, null, 90, 1900, 'D: scheda tecnica MR35 2025 (sicoritaly.com, 2 ottobre 2026); massa 1600–1900 kg, la maggiore'),
  m('SICOR', 'MR12 (storico)', '1/52 1/43 2/53 2/43', [480, 600], 2600, null, null, null, 240, 'R: copie di terzi del listino MR12'),
  m('SICOR', 'MR16 (storico)', '1/55 1/43 1/35 2/53 2/43 3/41', null, 4300, null, null, 20, 450, 'R: schede di rivenditori'),
  m('SICOR', 'MR17 (storico)', '1/55 1/43 1/35 2/43 3/41', null, 5200, null, null, 15, 550, 'R: schede di rivenditori'),
  m('Sassi', 'MODY', '1/37 1/49 1/60 2/47 3/41', [320, 600], 2300, 480, 630, 6.6, null, 'E: sassi.it, MODY'),
  m('Sassi', 'LEO', '1/71 1/55 1/45 2/71 2/57 3/47', [320, 700], 3000, 630, 1000, 11, 202, 'E: sassi.it, LEO; D: manuale LEO (202–218 kg con motore 4/16, senza volano e puleggia)'),
  m('Sassi', 'TORO', '1/61 1/49 1/39 2/53 3/47', [520, 600], 4200, 1000, 2000, 20.6, 299, 'E: sassi.it, TORO; R: pulegge 520 e 600'),
  m('Sassi', 'MF48', '1/60 1/47 2/71 3/56', null, 3100, 630, 1000, 11.4, null, 'E: sassi.it, serie MF'),
  m('Sassi', 'MF84', '1/65 1/48 1/39 2/53 2/39 3/47', null, 6000, 1600, 3000, 27.9, null, 'E: sassi.it, serie MF'),
  m('Sassi', 'MF94', '1/65 1/53 2/71 2/53 4/67', [650, 1000], 8000, 2500, 4000, 27.9, 623, 'E: sassi.it, serie MF'),
  m('Montanari', 'M65', '1/63 1/50 1/46 1/37 2/46', [480, 480], 2200, 400, null, 5.5, 80, `${MONTANARI}, M65`),
  m('Montanari', 'M73', M73, [480, 700], 2200, 480, null, 5.5, 110, `${MONTANARI}, M73; R: puleggia 700 (fceu.eu)`),
  m('Montanari', 'M73H', M73, [480, 700], 2700, 480, null, 5.5, 110, `${MONTANARI}, M73H (alto carico statico, senza supporto)`),
  m('Montanari', 'M73S', M73, [480, 700], 3200, 480, null, 5.5, 115, `${MONTANARI}, M73S (con supporto)`),
  m('Montanari', 'M75', M75, [480, 480], 2000, 630, null, 7.5, 115, `${MONTANARI}, M75`),
  m('Montanari', 'M75H', M75, [480, 480], 2700, 630, null, 7.5, 115, `${MONTANARI}, M75H (alto carico statico, senza supporto)`),
  m('Montanari', 'M75S', M75, [480, 480], 3200, 630, null, 7.5, 120, `${MONTANARI}, M75S (con supporto)`),
  m('Montanari', 'M83', M83, [480, 700], 3200, 800, null, 11, 169, `${MONTANARI}, M83; R: puleggia 700 (fceu.eu)`),
  m('Montanari', 'M85', M83, [480, 700], 4000, 800, null, 11, 181, `${MONTANARI}, M85 (con supporto)`),
  m('Montanari', 'M93', M93, [520, 520], 5000, 1250, null, 22, 250, `${MONTANARI}, M93`),
  m('Montanari', 'M95', M93, [520, 520], 5000, 1250, null, 22, 253, `${MONTANARI}, M95 (con supporto)`),
  m('Montanari', 'M98', M98, [520, 580], 7000, null, null, null, 480, `${MONTANARI}, M98`),
  m('Montanari', 'M98H', M98, [520, 580], 7000, null, null, null, 402, `${MONTANARI}, M98H (alto carico statico)`),
  m('Montanari', 'M105', '1/71 1/65 1/49 2/63 2/53 4/67', [650, 650], 9800, 3000, null, 45, 520, `${MONTANARI}, M105 (massa con motore B9)`),
  m('Montanari', 'M109', '1/64 1/49 2/55 3/58', [650, 750], 15000, null, null, null, 890, `${MONTANARI}, M109 (per 2:1 e 4:1)`),
  m('GEM', 'HW134', HW134, [480, 550], 2300, null, null, 6.8, 220, 'E: gem-ita.com, HW134 CAMEL; D: catalogo GEM 2017'),
  m('GEM', 'HW134 Ø600', HW134, [600, 600], 2000, null, null, 6.8, 220, 'E: gem-ita.com, HW134 CAMEL con puleggia Ø 600; D: catalogo GEM 2017'),
  m('GEM', 'HW140C', '1/58 1/53 1/44 1/37 2/43', [480, 600], 3100, null, null, null, null, 'E: gem-ita.com, HW140C LION (puleggia a sbalzo)'),
  m('GEM', 'HW175', '1/54 1/42 1/36 2/58 2/44 3/42', [480, 600], 5200, null, null, 20, 450, 'E: gem-ita.com, HW175 ELEPHANT; D: catalogo GEM 2017'),
  m('FAER', 'P58F', '1/58', null, 3200, null, null, null, null, 'E: faer.net, P58F II serie (con supporto puleggia); R: geatelevators.it (rapporto 1/58, 3,7 kW)'),
  m('FAER', 'P58S', '1/58', null, 2800, null, null, null, null, 'E: faer.net, P58S II serie (senza supporto puleggia); R: geatelevators.it (rapporto 1/58, 3,7 kW)'),
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
  if (c.kWmax !== null && o.Pn > c.kWmax) fails.push('motor');
  if (pay !== null && o.Q > pay) fails.push('payload');
  if (!(Math.abs(dv) <= tol)) fails.push('ratio');
  return { machine: c, ratio: near, i, dv, fails };
}

/** The machines of a brand (or one model of it) in the catalogue. */
export const catalogOf = (brand: Brand, model?: string): readonly CatalogMachine[] => MACHINES.filter((c) => c.brand === brand && (!model || c.model === model));
