// Geared traction machines of the makers the engineer can pick (research/argano-geared/12-catalogo-argani.md and
// 17-argani-tutti-i-costruttori.md): the ratios, the sheaves, the static load allowed on the shaft, the payloads the
// maker states, the largest motor and the mass. Read on 2026-10-02 in the makers' documents: SICOR's technical sheets of
// 2025 and its "Geared" brochure of April 2026 (sicoritaly.com), Sassi's catalogue REV 2022/03 (a full copy), GEM's
// model sheets of 2019 and its catalogue REV2021 (gem-ita.com), FAER's model sheets (faer.net); Montanari's and ITG's
// sites cannot be reached from here: Montanari's from its technical catalogue Mod. RA – CG/17/07 of 2018 (the copy its
// distributor ITASIA publishes), where the catalogue and the extracts of its pages differ the safer value (the smaller
// static load), M105 (not in the catalogue) and ITG's from the search engines' extracts of their pages. On 2026-10-03
// the client supplied Montanari's range sheets (M65, M73, M75; M93-M95, M98 and PENTA Rev 21_05_24) and Sassi's
// catalogue REV 2023/01 (its values those of REV 2022/03): they are the sources of those models now; of Montanari's the
// largest motor is the 4-pole inverter's at 50 Hz of the sheet's tables. Every value is
// to be checked on the maker's sheet before an order. Of a mass range the
// larger, as the maker defines it (Sassi's without flywheel and sheave; Montanari's the gearbox's; the masses of Sassi's
// MB series, without the motor, are left out). Payloads: SICOR's and FAER's the largest of their tables at 1:1 (machine
// above, counterweight 50 %, efficiency 0.80); Sassi's from its pages. FAER's motors are in HP (1 HP = 0.746 kW, our
// conversion). Where a sheave fits some ratios only, the range common to all. Pure.

export const BRANDS = ['SICOR', 'Sassi', 'Montanari', 'GEM', 'FAER', 'ITG'] as const;
export type Brand = (typeof BRANDS)[number];

/** The makers' sites, as the sources below name them. */
export const MAKER_SITE: Readonly<Record<Brand, string>> = {
  SICOR: 'sicoritaly.com', Sassi: 'sassi.it', Montanari: 'montanarigiulio.com', GEM: 'gem-ita.com', FAER: 'faer.net', ITG: 'top-gears.it',
};

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
  /** where the values come from: a document of the maker (D), the maker's page (E), a dealer (R), an earlier round (P) */
  src: string;
  /** proposed only when the engineer names it: a machine no longer built, a variant for a special mounting (long
   *  shaft), a market other than Italy */
  byName?: true;
}

const m = (brand: Brand, model: string, ratios: string, sheaves: readonly [number, number] | null, staticKg: number, r1: number | null, r2: number | null,
  kWmax: number | null, mass: number | null, src: string): CatalogMachine => ({ brand, model, ratios: ratios.split(' '), sheaves, staticKg, payload: { r1, r2 }, kWmax, mass, src });
const named = (c: CatalogMachine): CatalogMachine => ({ ...c, byName: true });
const hp = (x: number): number => Math.round(x * 0.746 * 10) / 10;

/** The day the catalogues' values were read (the documents say it with their sources). */
export const CATALOG_READ_ON = '2 ottobre 2026';
const DAY = CATALOG_READ_ON;
const sicor = (model: string, page: number, note = ''): string =>
  `D: scheda tecnica ${model} 2025 e brochure Geared 2026, p. 9 e ${page} (sicoritaly.com, ${DAY})${note}`;
const CLIENT = 'documento fornito dal cliente il 3 ottobre 2026';
const sassi = (page: number, note: string): string =>
  `D: catalogo argani Sassi REV 2023/01, p. ${page} (${CLIENT}; valori uguali alla REV 2022/03); ${note}; E: portate da sassi.it`;
const gem = (model: string, note = ''): string => `D: scheda ${model} (catalogo GEM 2019, gem-ita.com, ${DAY})${note}`;
const faer = (sheet: string, HP: number, note = ''): string => `D: scheda ${sheet} (faer.net, ${DAY}); motore max ${HP} HP ≈ ${hp(HP)} kW${note}`;
const MONTANARI = 'E: montanarigiulio.com', INDIA = 'E: montanarigiulio.in (sito India)';
const montanari = (model: string, page: number, note = ''): string =>
  `D: catalogo tecnico Montanari Mod. RA – CG/17/07 (2018), p. ${page} (copia del distributore ITASIA, itasia.it, ${DAY}), ${model}${note}; ${MONTANARI} (portata e motore)`;
/** a range sheet the client supplied: its data box (static load, mass, payload, ratios) and its load tables (motor) */
const sheet = (doc: string, pages: string, model: string, note = ''): string => `D: ${doc}, pp. ${pages} (${CLIENT}), ${model}${note}`;
const S65 = 'scheda Montanari Gearbox M65', S73 = 'scheda Montanari Gearbox M73', S75 = 'scheda Montanari Gearbox M75';
const S93 = 'scheda Montanari M93-M95 Rev 21_05_24', S98 = 'scheda Montanari M98 Rev 21_05_24', SPENTA = 'scheda Montanari PENTA Rev 21_05_24';
const DOWN = '; statico 2200 kg per tiro verso il basso sulla scheda, 2000 kg nel catalogo tecnico 2018: si usa il minore';
const SH140 = '1/71 1/59 1/52 1/45 1/37 2/71 2/53 3/47', SH160 = '1/55 1/43 1/35 2/53 2/43 3/41';
const MR21 = '1/62 1/51 1/40 2/63 2/51 3/47', MR26 = '1/72 1/57 1/44 2/63 2/45 3/55';
const M73 = '1/75 1/60 1/52 1/46 1/37 2/55 2/37', M75 = '1/52 1/50 1/37 2/55 2/37', M83 = '1/69 1/60 1/50 1/43 1/37 2/42 2/50';
const M93 = '1/62 1/50 1/43 1/39 2/49 3/47 4/51', M98 = '1/65 1/52 1/47 1/37 2/61 2/49 4/57', M77 = '1/55 1/37 2/55';
const HW134 = '1/37 1/42 1/53 1/65', HW140 = '1/58 1/53 1/44 1/37 2/43', P58 = '1/76 1/66 1/58 1/52 1/44 1/37';
const MB94 = '1/65 1/53 2/71 2/53 4/67';

export const MACHINES: readonly CatalogMachine[] = [
  m('SICOR', 'SV110', '1/55 1/43', [480, 600], 2000, 450, null, 5.5, 160, sicor('SV110', 10)),
  m('SICOR', 'SH110B', '1/55 1/43 2/43 2/55', [320, 600], 2100, 400, null, 5.5, 200, sicor('SH110B', 18)),
  m('SICOR', 'MR12C', '1/55 1/43 2/43 2/55', [340, 600], 2600, 550, null, 6.7, 240, sicor('MR12C', 25, '; rapporti del riquadro dati: le tabelle portate ne danno altri, da chiedere a SICOR')),
  m('SICOR', 'SH130', '1/52 1/45 1/43 1/37 2/43', [320, 700], 2600, 550, null, 7.5, 250, sicor('SH130', 35, '; con la puleggia larga 90 (Ø 480-550) statico 2400 kg; rapporti del riquadro dati')),
  m('SICOR', 'SH130G', '1/52 1/43 1/37', [480, 600], 2900, 630, null, 7.5, 250, sicor('SH130G', 43)),
  m('SICOR', 'SH140', SH140, [360, 600], 3300, 875, null, 11, 280, sicor('SH140', 49)),
  m('SICOR', 'SH160', SH160, [450, 700], 4300, 1250, null, 20, 450, sicor('SH160', 61)),
  m('SICOR', 'SH190', '1/40 1/51 1/62 2/59 3/47', [520, 750], 5200, 1800, null, 30, 620, sicor('SH190', 73)),
  m('SICOR', 'MR21', MR21, [520, 750], 5600, 2000, null, 30, 1000, sicor('MR21', 82, '; massa 770-1000 kg, la maggiore')),
  m('SICOR', 'MR21TS', MR21, [520, 750], 7400, 2000, null, 30, null, sicor('MR21', 82, '; TS: terzo supporto')),
  m('SICOR', 'MR26', MR26, [600, 800], 6600, 3000, null, 43, 1600, sicor('MR26', 92, '; massa 1200-1600 kg, la maggiore; Ø 560 solo ESW (statico 6000 kg)')),
  m('SICOR', 'MR26TS', MR26, [600, 800], 8175, 3000, null, 43, null, sicor('MR26', 92, '; TS: terzo supporto')),
  m('SICOR', 'MR35', '1/58 1/53 2/73 2/60 3/70 3/53', [690, 885], 14200, 5500, null, 90, 1900, sicor('MR35', 101, '; massa 1600-1900 kg, la maggiore')),
  named(m('SICOR', 'SH140LS', SH140, [360, 600], 2000, 875, null, 11, null, sicor('SH140', 59, '; albero lungo: statico 2000/1700/1500 kg con A = 500/600/725 mm'))),
  named(m('SICOR', 'SH160LS', SH160, [450, 700], 4300, 1250, null, 20, 495, sicor('SH160', 69, '; albero lungo: statico 4300/3700/3200 kg con B = 150/175/200 mm'))),
  named(m('SICOR', 'MR12 (storico)', '1/52 1/43 2/53 2/43', [480, 600], 2600, null, null, null, 240, 'R: copie di terzi del listino MR12')),
  named(m('SICOR', 'MR16 (storico)', SH160, null, 4300, null, null, 20, 450, 'R: schede di rivenditori')),
  named(m('SICOR', 'MR17 (storico)', '1/55 1/43 1/35 2/43 3/41', null, 5200, null, null, 15, 550, 'R: schede di rivenditori')),
  m('Sassi', 'MODY', '1/37 1/49 1/60 2/47 3/41', [320, 600], 2300, 480, 630, 6.6, 169, sassi(12, 'massa 158-169 kg senza volano e puleggia')),
  m('Sassi', 'LEO', '1/71 1/55 1/45 2/71 2/57 3/47', [320, 700], 3000, 630, 1000, 11, 218, sassi(19, 'massa 181-218 kg senza puleggia')),
  m('Sassi', 'TORO', '1/61 1/49 1/39 2/53 3/47', [320, 700], 4200, 1000, 2000, 20.6, 299, sassi(26, 'massa 246-299 kg senza volano e puleggia')),
  m('Sassi', 'MF48', '1/60 1/47 2/71 3/56', [450, 700], 3100, 630, 1000, 11.4, 268, sassi(38, 'massa 245-268 kg senza volano e puleggia; pulegge 400-700 a p. 39, 450-800 a p. 4: le comuni')),
  m('Sassi', 'MF84', '1/65 1/48 1/39 2/53 2/39 3/47', [450, 800], 6000, 1600, 3000, 27.9, 454, sassi(44, 'massa 354-454 kg senza volano e puleggia')),
  m('Sassi', 'MF94', MB94, [450, 800], 8000, 2500, 4000, 27.9, 623, sassi(51, 'massa 529-623 kg senza volano e puleggia')),
  m('Sassi', 'MB94', MB94, [450, 800], 8000, null, null, 40.4, null, sassi(53, 'massa 534 kg senza motore, volano e puleggia')),
  m('Sassi', 'MB95', '1/53 1/48 2/80 2/64 3/80 3/66 3/50', [450, 800], 12000, 3000, 5000, 50.7, null, sassi(59, 'massa 980 kg senza motore, volano e puleggia')),
  m('Sassi', 'MB108', '1/64 1/48 2/71 2/57 3/68 4/59', [520, 800], 15000, 5000, 10000, 91.9, null, sassi(64, 'massa 1405 kg senza motore, volano e puleggia')),
  m('Montanari', 'M65', '1/63 1/50 1/46 1/37 2/46', [360, 600], 2200, 400, null, 5.5, 80, sheet(S65, '25-27', 'M65', '; catalogo tecnico 2018, p. 22; R: Donati scrive 2300 kg')),
  m('Montanari', 'M73', M73, [360, 700], 2000, 480, null, 5.5, 110, sheet(S73, '35-37', 'M73', DOWN)),
  m('Montanari', 'M73H', M73, [360, 700], 2700, 480, null, 5.5, 110, sheet(S73, '35-37', 'M73H (alto carico statico, senza supporto)')),
  m('Montanari', 'M73S', M73, [360, 700], 3200, 480, null, 5.5, 115, sheet(S73, '35-37', 'M73S (con supporto)', '; R: Donati scrive 2000 kg')),
  m('Montanari', 'M75', M75, [360, 700], 2000, 630, null, 7.5, 115, sheet(S75, '41-43', 'M75', DOWN)),
  m('Montanari', 'M75H', M75, [360, 700], 2700, 630, null, 7.5, 115, sheet(S75, '41-43', 'M75H (alto carico statico, senza supporto)')),
  m('Montanari', 'M75S', M75, [360, 700], 3200, 630, null, 7.5, 120, sheet(S75, '41-43', 'M75S (con supporto)')),
  m('Montanari', 'PENTA', '1/65 1/55 1/43 1/37 2/71 2/55 3/47', [360, 600], 3000, 630, null, 11, 210, sheet(SPENTA, '49-51', 'PENTA (argano verticale)', '; massa con il motore; 1/65 al posto dell\'1/46 del catalogo tecnico 2018')),
  m('Montanari', 'PENTA 830', '1/50 1/37 2/42 3/43', [400, 700], 3200, 800, null, 9, 180, montanari('PENTA 830 (argano verticale)', 45)),
  m('Montanari', 'M83', M83, [450, 700], 3200, 800, null, 11, 169, montanari('M83', 39)),
  m('Montanari', 'M85', M83, [450, 700], 4000, 800, null, 11, 181, montanari('M85 (con supporto)', 41, '; pulegge dalle tabelle M83 M85, pp. 42-44')),
  m('Montanari', 'M93', M93, [450, 800], 5000, 1250, null, 22, 250, sheet(S93, '71-73', 'M93')),
  m('Montanari', 'M95', M93, [450, 800], 5000, 1250, null, 22, 253, sheet(S93, '71-73', 'M95 (con supporto)', '; massa 250 kg nel catalogo tecnico 2018')),
  m('Montanari', 'M98', M98, [450, 800], 7000, 1600, null, 26, 480, sheet(S98, '79-82', 'M98 (con supporto)')),
  m('Montanari', 'M98H', M98, [450, 800], 7000, 1600, null, 26, 402, sheet(S98, '79-82', 'M98H (alto carico statico)')),
  m('Montanari', 'M105', '1/71 1/65 1/49 2/63 2/53 4/67', [650, 650], 9800, 3000, null, 45, 520, `${MONTANARI}, M105 (massa con motore B9; non è nel catalogo tecnico 2018)`),
  m('Montanari', 'M109', '1/64 1/49 2/55 3/58', [450, 800], 15000, null, null, 90, 890, montanari('M109 (per 2:1 e 4:1)', 76, '; motore fino a 90 kW dalla brochure generale 2015')),
  named(m('Montanari', 'M73AL', M73, [360, 700], 2500, 480, null, 5.5, 145, sheet(S73, '35-37', 'M73AL (albero lungo)'))),
  named(m('Montanari', 'M75AL', M75, [360, 700], 2500, 630, null, 7.5, 150, sheet(S75, '41-43', 'M75AL (albero lungo)', '; la scheda scrive «M73AL - 150 kg» nella pagina della M75: 150 kg anche nel catalogo tecnico 2018'))),
  named(m('Montanari', 'M83AL', M83, [450, 700], 3000, 800, null, 11, 199, montanari('M83AL (albero lungo)', 40))),
  named(m('Montanari', 'M93AL', M93, [450, 800], 3600, 1250, null, 22, 329, sheet(S93, '71-73', 'M93AL (albero lungo)'))),
  named(m('Montanari', 'M98HAL', M98, [450, 800], 5100, 1600, null, 26, 460, sheet(S98, '79-82', 'M98HAL (albero lungo)'))),
  named(m('Montanari', 'M77', M77, null, 2300, 544, null, null, 100, `${INDIA}, M77`)),
  named(m('Montanari', 'M77H', M77, null, 2700, 544, null, null, 100, `${INDIA}, M77H`)),
  named(m('Montanari', 'M87', '1/37 2/42 2/50', null, 3200, null, null, null, 169, `${INDIA}, M87 (portata 888 kg, taglia non indicata)`)),
  named(m('Montanari', 'M104', '2/63 2/53', null, 12000, 2500, null, null, 780, `${INDIA}, M104`)),
  m('GEM', 'HW134', HW134, [480, 550], 2300, null, null, 6.8, 220, gem('HW134 CAMEL')),
  m('GEM', 'HW134 Ø600', HW134, [600, 600], 2000, null, null, 6.8, 220, gem('HW134 CAMEL', ' con puleggia Ø 600')),
  m('GEM', 'HW134L', HW134, [480, 550], 2700, null, null, 6.8, 220, gem('HW134L', ' (supporto esterno)')),
  m('GEM', 'HW134L Ø600', HW134, [600, 600], 2300, null, null, 6.8, 220, gem('HW134L', ' (supporto esterno) con puleggia Ø 600')),
  m('GEM', 'HW134VF', HW134, [480, 600], 2300, null, null, 5.5, 160, gem('HW134VF', ' (solo VVVF)')),
  m('GEM', 'HW134VF con supporto', HW134, [480, 600], 2700, null, null, 5.5, 160, gem('HW134VF', ' (solo VVVF, con supporto)')),
  m('GEM', 'HW135VF', '1/37 1/42 1/53', [480, 550], 2300, null, null, 6.1, 180, gem('HW135VF')),
  m('GEM', 'HW135L-VF', '1/37 1/42', [480, 550], 2700, null, null, 7.6, 210, gem('HW135L-VF', ' (con supporto)')),
  m('GEM', 'HW140C', HW140, [480, 600], 3100, null, null, 10.8, 260, gem('HW140C LION', ' (puleggia a sbalzo; 240 kg sulla pagina web)')),
  m('GEM', 'HW140CL', HW140, [480, 600], 3800, null, null, 11.5, 240, `D: catalogo prodotti GEM REV2021, p. 10 (gem-ita.com, ${DAY}), HW140CL LION (supporto esterno)`),
  m('GEM', 'HW175', '1/54 1/42 1/36 2/58 2/44 3/42', [480, 600], 5200, null, null, 20, 450, gem('HW175 ELEPHANT')),
  m('FAER', 'P58S', P58, [440, 600], 2800, 670, null, hp(10), null, faer('P58S II serie (senza supporto puleggia)', 10, '; Ø 650 e 700 solo con 1/76 e 1/66')),
  m('FAER', 'P58F', P58, [440, 600], 3200, 670, null, hp(10), null, faer('P58F II serie (con supporto, doppio albero)', 10, '; Ø 650 e 700 solo con 1/76 e 1/66')),
  m('FAER', 'P60F', '1/44 1/37 2/50', [440, 600], 3500, 670, null, hp(10), null, faer('P60F II serie', 10)),
  m('FAER', 'P68F', '1/69 1/62 1/52 1/44 1/38 2/60 2/43', [520, 650], 6000, 1040, null, hp(16), null, faer('P68F III serie', 16)),
  m('FAER', 'P70F', '1/65 1/55 1/48 1/38 2/54', [520, 700], 8000, 1600, null, hp(25), null, faer('P70F III serie', 25)),
  m('FAER', 'P80F', '1/55 1/48 1/38 2/54', [550, 550], 8000, 1900, null, hp(30), null, faer('P80F', 30, '; 1/55 solo a 6 poli')),
  m('ITG', 'ITG 127', '1/55 1/45 2/57', null, 2600, 630, null, 8.6, null, 'E: top-gears.it, ITG 127 serie 130 (estratti del motore di ricerca: il sito non si apre da qui)'),
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

/** What a catalogue's mass is, as the maker defines it: the whole machine (`totale`), without flywheel and sheave
 *  (`senza_volano_puleggia`), without the sheave (`senza_puleggia`), the gearbox alone, without motor, flywheel and
 *  sheave (`riduttore`). The loads on the building count the whole machine: what the catalogue leaves out is estimated
 *  (src/lib/lift/machine-mass.ts). */
export type MassKind = 'totale' | 'senza_volano_puleggia' | 'senza_puleggia' | 'riduttore';

/** By maker, as their documents define the mass (see the header); the models that differ from their maker's. SICOR's
 *  sheets and GEM's give the machine's mass (GEM's «massa media» without a definition: taken as the whole machine), FAER
 *  and ITG none. */
const MASS_KIND: Readonly<Record<Brand, MassKind>> = {
  SICOR: 'totale', Sassi: 'senza_volano_puleggia', Montanari: 'riduttore', GEM: 'totale', FAER: 'totale', ITG: 'totale',
};
const MASS_KIND_MODEL: Readonly<Record<string, MassKind>> = {
  // Sassi: LEO's mass is without the sheave only; the MB series' without motor, flywheel and sheave
  'Sassi LEO': 'senza_puleggia', 'Sassi MB94': 'riduttore', 'Sassi MB95': 'riduttore', 'Sassi MB108': 'riduttore',
  // Montanari: PENTA's sheet and M105's page give the mass with the motor
  'Montanari PENTA': 'senza_volano_puleggia', 'Montanari M105': 'senza_volano_puleggia',
};

/** What the catalogue's mass of the machine `c` includes. */
export const massKindOf = (c: Pick<CatalogMachine, 'brand' | 'model'>): MassKind => MASS_KIND_MODEL[`${c.brand} ${c.model}`] ?? MASS_KIND[c.brand];
