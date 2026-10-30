// The buffers of the owner's model (sheets «Amm. a molla …», «Amm. in autan …», «Amm. idraulici …», round 52; the owner
// holds the rights, owner's decision): the two lists of springs, the polyurethane («autan») buffers and the hydraulic
// buffers, as the model lists them (the cabin's sheets; the counterweight's are cell-for-cell copies). The rows without
// data («-», empty, the default item) are not offered (corrections S5 and H5: a buffer without its data is never
// computed). Every value as the model has it, with its cells; the one row whose data contradict each other (78.026,
// correction S6) keeps the model's value here and is corrected where it is read (MOLLE_CORRETTE). Pure.

/** A spring of the model: the columns of its list (the calculation reads Dm, d, L0, G and the pitch). */
export interface MollaCat {
  /** «A8» (list A, its index), «B3» (list B, its index) */
  id: string;
  /** the name the model's combobox shows */
  nome: string;
  /** outer and mean diameter, wire, free length [mm] */
  De: number;
  Dm: number;
  d: number;
  L0: number;
  /** the catalogue's stroke [mm] and rate (TAA rows N/mm, the others daN/mm), unused by the model's formulas; null: empty */
  fCat: number | null;
  K: number | null;
  /** shear modulus [N/mm²] */
  G: number;
  /** active coils as the catalogue gives them (the pitch then derives from them), or null where the catalogue gives the
   *  pitch (TAA rows: the coils derive from it) */
  n: number | null;
  /** the catalogue's maximum load [N] */
  Cmax: number;
  /** the pitch the catalogue gives [mm] (TAA rows), else null (derived: (L0 − 1,5·d)/n) */
  p: number | null;
  /** list B: the manufacturer's article code (column AP, unused) */
  articolo?: string;
}

const A = (k: number, nome: string, De: number, Dm: number, d: number, L0: number, fCat: number, K: number, G: number, n: number | null, Cmax: number, p: number | null): MollaCat =>
  ({ id: `A${k}`, nome, De, Dm, d, L0, fCat, K, G, n, Cmax, p });
const B = (k: number, nome: string, De: number, Dm: number, d: number, L0: number, fCat: number | null, K: number | null, n: number, Cmax: number, articolo?: string): MollaCat =>
  ({ id: `B${k}`, nome, De, Dm, d, L0, fCat, K, G: 78500, n, Cmax, p: null, ...(articolo ? { articolo } : {}) });

/** List A, «Amm. a molla cabina»!P53:AA64 (items 13 «» and 15 «» without data, 14 «altro»: the manual data). */
export const MOLLE_A: readonly MollaCat[] = [
  A(1, 'TAA90E1', 73, 60, 13, 195, 65, 158.31, 76600, null, 10290, 20.65),
  A(2, 'TAA90F1', 74, 61, 13, 382, 135, 73.17, 76600, null, 9878, 20.71),
  A(3, 'TAA90G1', 106, 90, 16, 311, 135, 96.28, 76600, null, 12998, 30.21),
  A(4, 'TAA90H1', 70, 58, 12, 185, 65, 127.09, 76600, null, 8261, 19.65),
  A(5, '78.021 Centoducati', 85, 71, 14, 230, 73.6, 11.4, 78500, 9.25, 8370, null),
  A(6, '78.022 Centoducati', 90, 75, 15, 210, 75.4, 16.24, 78500, 7.25, 12240, null),
  A(7, '78.023 Centoducati', 92, 76, 16, 225, 77, 19.5, 78500, 7.5, 15040, null),
  A(8, '78.024 Centoducati', 98, 80, 18, 250, 78.5, 25.9, 78500, 7.75, 20390, null),
  A(9, '78.025 Centoducati', 85, 71, 14, 460, 153.4, 5.54, 78500, 19, 8500, null),
  A(10, '78.026 Centoducati', 90, 75, 15, 420, 153.4, 7.72, 78500, 14.25, 11840, null),
  A(11, '78.027 Centoducati', 92, 76, 16, 430, 154.4, 9.93, 78500, 14.75, 15330, null),
  A(12, '78.028 Centoducati', 98, 80, 18, 500, 160.3, 12.38, 78500, 16.25, 19840, null),
];

/** List B «AMMORTIZZATORI LOGIC-UP DONATI / CMM», «Amm. a molla cabina»!AD54:AP63 (items 1, 12, 13 «-» and 14 «»
 *  without data); the outer diameter of the AM rows is the model's Dm + d. */
export const MOLLE_B: readonly MollaCat[] = [
  B(2, 'RC01709 - 14x85xH 235', 85, 71, 14, 235, 74.7, 11.09, 9.5, 8282, '150140'),
  B(3, 'RC01710 - 15x89xH 210', 89, 74, 15, 210, 71.25, 16.35, 7.5, 11646, '150150'),
  B(4, 'RC01711 - 16x92xH 225', 92, 76, 16, 225, 77, 19.53, 7.5, 15040, '150160'),
  B(5, 'RC01712 - 18x98xH 250', 98, 80, 18, 250, 73.6, 25.15, 8, 18509, '150180'),
  B(6, 'RC01713 - 14x94xH 330', 94, 80, 14, 330, 138.9, 6.4, 11.5, 8893, '150210'),
  B(7, 'RC01714 - 15x94xH 330', 94, 79, 15, 330, 141.75, 9.6, 10.5, 13602, '150220'),
  B(8, 'RC01715 - 18x98xH 420', 98, 80, 18, 420, 134.7, 14.9, 13.5, 20074, '150230'),
  B(9, 'AM 0003', 71 + 14, 71, 14, 240, null, null, 9.16, 9962),
  B(10, 'AM 0004', 75 + 15, 75, 15, 225, null, null, 7.6, 14297),
  B(11, 'AM 0005', 80 + 18, 80, 18, 250, null, null, 7.93, 19027),
];

/** Correction S6: the row «78.026 Centoducati» gives 14,25 active coils, but its own stroke (153,4 mm), rate (7,72
 *  daN/mm) and maximum load (11840 N) all follow from 15,25 with the model's formulas (f = 420 − 15·(1 + 1,1·15,25) =
 *  153,4 mm; G·d⁴/(8·D³·n) = 77,2 N/mm; 153,4 × 77,2 = 11840 N); with 14,25 the stroke comes out 169,9 mm and the force
 *  14037 N, above the catalogue's maximum (unsafe for the 2,5–4 check). */
export const MOLLE_CORRETTE: Readonly<Record<string, Partial<Pick<MollaCat, 'n'>>>> = { A10: { n: 15.25 } };

export const MOLLE: readonly MollaCat[] = [...MOLLE_A, ...MOLLE_B];
export const mollaCat = (id: string): MollaCat | null => {
  const m = MOLLE.find((x) => x.id === id);
  return m ? { ...m, ...(MOLLE_CORRETTE[id] ?? {}) } : null;
};

/** A polyurethane («autan») buffer of the model: its stroke and its linearised maximum load. */
export interface AutanCat {
  id: string;
  nome: string;
  codice: string;
  /** «f max» [mm], «F1» [N] */
  fMax: number;
  F1: number;
}

/** «Amm. in autan cabina»!N64:R69 (item 7 «altro»: the manual data; 8 «» without data). */
export const AUTAN: readonly AutanCat[] = [
  { id: '1', nome: 'MAA 320 H1', codice: '300 171', fMax: 152, F1: 32200 },
  { id: '2', nome: 'MAA 320 H2', codice: '300 172', fMax: 152, F1: 45400 },
  { id: '3', nome: 'MAA 320 H3', codice: '300 178', fMax: 76, F1: 44200 },
  { id: '4', nome: 'MAA 320 H4', codice: '300 147', fMax: 152, F1: 81800 },
  { id: '5', nome: 'MAA 320 H5', codice: '300 116', fMax: 76, F1: 21900 },
  { id: '6', nome: 'MAA 320 H6', codice: '300 183', fMax: 76, F1: 79900 },
];
export const autanCat = (id: string): AutanCat | null => AUTAN.find((x) => x.id === id) ?? null;

/** A hydraulic buffer of the model's DONATI list («codice DONATI pagina 19 catalogo 2011»). */
export interface IdraulicoCat {
  codice: string;
  /** «v nom» as the cabin's sheet writes it, and its upper figure [m/s] (the counterweight's sheet: that number only) */
  vNom: string;
  vNomMax: number;
  /** «carico [kg]» min and max (per buffer) */
  massaMin: number;
  massaMax: number;
  /** «corsa reale», «H», «B» = H − corsa, «diam.» [mm]; «TIPO»; «Q.tà olio» [kg] */
  corsa: number;
  H: number;
  B: number;
  diam: number;
  tipo: string;
  olio: number;
}

/** «Amm. idraulici cabina»!S75:AC76 (items 3, 4 «-» and 5–10, 12 «» without data; 11 «altro»: the stroke by hand). */
export const IDRAULICI: readonly IdraulicoCat[] = [
  { codice: '150510', vNom: '1 / 1,6', vNomMax: 1.6, massaMin: 300, massaMax: 2000, corsa: 180, H: 600, B: 600 - 180, diam: 100, tipo: 'A 202/1', olio: 2 },
  { codice: '150520', vNom: '1,6 / 2', vNomMax: 2, massaMin: 300, massaMax: 2000, corsa: 280, H: 815, B: 815 - 280, diam: 110, tipo: 'A 203', olio: 2.5 },
];
export const idraulicoCat = (codice: string): IdraulicoCat | null => IDRAULICI.find((x) => x.codice === codice) ?? null;
