// The rail catalogue of the owner's model (round 52, sheet TABELLE) verbatim — the catalogue the owner uses — with the
// two safety-gear lists of the rails' sheets. The model's ω tables (TABELLE!S3:AB233) are not repeated here: their
// formulas for Rm 370 are the registry's (KV_GUIDE.omega370) and those of its counterweight column for Rm 520 are
// KR.omega520 (its car column for Rm 520 is wrong: docs, differenze-guide.ts E-13). The impact factors K1 of the gear
// lists are the registry's (KV_VERT, UNI EN 81-20:2020 prospetto 14: the model's 5/3/2, asserted by rt2-guide.test.ts).
// Where a profile is also in LiftPilot's RAIL_TYPES (src/shaft/rails.ts) the section data differ slightly (the model's
// catalogue is an older makers' table): the RT follows the model's, the shaft keeps its own. Pure.
import { KV_VERT } from '@/shaft/norme-vert';

/** A rail of the model's catalogue (TABELLE!B:M, row = index + 3). */
export interface GuidaCatalogo {
  /** the model's index (TABELLE!B, the value of its comboboxes) */
  n: number;
  /** «Tipo», «Dimensioni», «Lavorazione» as the model writes them (trailing spaces included) */
  tipo: string;
  dimensioni: string;
  lavorazione: string;
  /** second moments of area about the axis parallel to the foot (x) and the axis of symmetry (y) [mm⁴], section moduli
   *  [mm³], area [mm²], tensile strength σr [N/mm²], width of the sliding surface «Sup.Scorr» [mm], thickness c of the
   *  blade's root [mm] */
  Jx: number;
  Jy: number;
  Wx: number;
  Wy: number;
  A: number;
  Rm: number;
  lsc: number;
  c: number;
}

const g = (n: number, tipo: string, dimensioni: string, lavorazione: string, Jx: number, Jy: number, Wx: number, Wy: number, A: number,
  Rm: number, lsc: number, c: number): GuidaCatalogo => ({ n, tipo, dimensioni, lavorazione, Jx, Jy, Wx, Wy, A, Rm, lsc, c });

// TABELLE!B4:M33 (the values the model enters as a formula a·10^k, e.g. F7 =11.24*10^4, written as their result)
export const GUIDE_CATALOGO: readonly GuidaCatalogo[] = [
  g(1, 'RT 40', '40 x 40 x 5', 'trafilate', 53500, 21700, 1950, 1080, 340, 360, 30, 5),
  g(2, 'T 45x15  ', '45 x 35 x 15', 'lamiera piegata', 33142, 26094, 1473, 1087, 226, 330, 30, 15),
  g(3, 'ISO T45/A; TLH45; RT45', '45 x 45 x 5', 'trafilate', 80800, 38400, 2530, 1710, 425, 370, 40, 5),
  g(4, 'ISO T50/A', '50 x 50 x 5', 'trafilate', 112400, 52500, 3150, 2100, 475, 370, 40, 5),
  g(5, 'RF 50', '50 x 50 x 9', 'trafilate', 173600, 70200, 5260, 2810, 707, 360, 35, 7.5),
  g(6, 'TLH60; RT 60', '60 x 60 x 7', 'trafilate', 259800, 127500, 6170, 4250, 788, 370, 53, 7),
  g(7, 'T4; RF 65; T 65/A', '65 x 54 x 7,9', 'trafilate', 200900, 109200, 5444, 3360, 624, 370, 20, 5),
  g(8, 'ISO T70-1/A; T70/9; RF 70 ', '70 x 65 x 9', 'trafilate', 413000, 186500, 9240, 5350, 951, 370, 34, 6),
  g(9, 'ISO T70-2/A; TLH70; RT 70', '70 x 70 x 8', 'trafilate', 474300, 231300, 9630, 6610, 1052, 370, 62, 8),
  g(10, 'T70-70-9/A; RF 70-9', '70 x 70 x 9', 'trafilate', 528100, 246200, 10790, 7020, 1125, 370, 35, 7.9),
  g(11, 'ISO T75-1/A', '75 x 55 x 9', 'trafilate', 246000, 156000, 6580, 4170, 798, 370, 30, 7),
  g(12, 'ISO T75-2/A', '75 x 62 x 9', 'trafilate', 373200, 261200, 8490, 6970, 1012, 370, 30, 7),
  g(13, 'ISO T75-3/A; RF 75', '75 x 62 x 10', 'trafilate', 403500, 264900, 9290, 7060, 1099, 360, 30, 8),
  g(14, 'ISO T75-3/B; RP 75', '75 x 62 x 10', 'lavorate', 403500, 264900, 9290, 7060, 1099, 430, 30, 8),
  g(15, 'T78/B; RP 78', '78x56x10', 'lavorate', 299000, 261000, 7560, 6710, 982, 430, 25, 7),
  g(16, 'TLH80; RT80; T80-80-9/A', '80 x 80 x 9', 'trafilate', 802000, 388300, 14210, 9700, 1356, 370, 71, 9),
  g(17, 'ISO T82/A; RF 82; T3', '82,5 x 68,25 x 9', 'trafilate', 494000, 305000, 10200, 7400, 1090, 370, 25.4, 7.5),
  g(18, 'ISO T82/B', '82,5 x 68,25 x 9', 'lavorate', 494000, 305000, 10200, 7400, 1090, 370, 25.4, 7.5),
  g(19, 'ISO T89/A; T2; RF 89', '89 x 62 x 15,88', 'trafilate', 595200, 524000, 14250, 11800, 1570, 370, 33.4, 10),
  g(20, 'ISO T89/B; T2; RP 89', '89 x 62 x 15,88', 'lavorate', 595200, 524000, 14250, 11800, 1570, 370, 33.4, 10),
  g(21, 'ISO T90/A; TFH4/81; RF 90', '90 x 75 x 16', 'trafilate', 1020000, 526000, 20870, 11800, 1725, 370, 42, 10),
  g(22, 'ISO T90/B: TFH4/81; RP 90', '90 x 75 x 16', 'lavorate', 1020000, 526000, 20870, 11800, 1725, 370, 42, 10),
  g(23, 'T114/B; RP 114', '114 x 88,9 x 15,88', 'lavorate', 1790000, 1090000, 29700, 19100, 2085, 430, 38, 9.5),
  g(24, 'ISO T125/A ', '125 x 82 x 16', 'trafilate', 1510000, 1590000, 26200, 25400, 2283, 430, 42, 10),
  g(25, 'ISO T125/B; TFH5; RP 125', '125 x 82 x 16', 'lavorate', 1510000, 1590000, 26200, 25400, 2283, 430, 42, 10),
  g(26, 'ISO T127-1/B; RP 127 L', '127 x 88,9 x 15,88', 'lavorate', 1862000, 1480000, 30400, 23400, 2264, 430, 44.5, 10),
  g(27, 'ISO T127-2/A    ', '127 x 88,9 x 15,88', 'trafilate', 1984000, 2300000, 30900, 36200, 2863, 430, 50.8, 10),
  g(28, 'ISO T127-2/B; N.1; RP 127', '127 x 88,9 x 15,88', 'lavorate', 1984000, 2300000, 30900, 36200, 2863, 430, 50.8, 10),
  g(29, 'T140-1/B; RP 140 L', '140 x 108 x 19', 'lavorate', 4040000, 3100000, 53400, 44300, 3520, 370, 50.8, 12.7),
  g(30, 'T140-2/B; T169', '140 x 102 x 28,6', 'lavorate', 4570000, 3580000, 68000, 51200, 4322, 370, 50.8, 17.5),
];

/** The model's indexes of a rail typed by hand (TABELLE!B34 «altra cwt», B35 «altra cabina»): its data are the inputs of
 *  the component. Each list offers only its own (the model offers both on both lists: corrected). */
export const ALTRA = { contrappeso: 31, cabina: 32 } as const;
export const NOME_ALTRA: Readonly<Record<keyof typeof ALTRA, string>> = { contrappeso: 'altra cwt', cabina: 'altra cabina' };

export const guidaDi = (n: number): GuidaCatalogo | null => GUIDE_CATALOGO.find((r) => r.n === n) ?? null;

/** A safety gear of the rails' sheets: the model's index, its name, its «Coeff. C» (used by no formula of the model) and
 *  its impact factor K1 (none: without a safety gear). */
export interface ParacaduteGuide {
  n: number;
  tipo: string;
  C: number | null;
  K1: number | null;
}

// TABELLE!B56:F59 «tabella valida per contrappeso» (its fifth row B60 is empty: left out)
export const PARACADUTE_CWT: readonly ParacaduteGuide[] = [
  { n: 1, tipo: 'Istantaneo a cunei', C: 50, K1: KV_VERT.k1Instant },
  { n: 2, tipo: 'Istantaneo a rulli', C: 30, K1: KV_VERT.k1Roller },
  { n: 3, tipo: 'Presa progressiva', C: 20, K1: KV_VERT.k1Progressive },
  { n: 4, tipo: 'senza', C: null, K1: null },
];

// TABELLE!B66:F69 «tabella valida per cabina» (its row 5 «senza», B70, is left out: a car always has a safety gear,
// UNI EN 81-20:2020 5.6.1 — E-11)
export const PARACADUTE_CABINA: readonly ParacaduteGuide[] = [
  { n: 1, tipo: 'Istantaneo a cunei', C: 50, K1: KV_VERT.k1Instant },
  { n: 2, tipo: 'Istantaneo a rulli', C: 30, K1: KV_VERT.k1Roller },
  { n: 3, tipo: 'Presa progressiva <= 1 m/s', C: 20, K1: KV_VERT.k1Progressive },
  { n: 4, tipo: 'Presa progressiva > 1 m/s', C: 20, K1: KV_VERT.k1Progressive },
];

/** The instantaneous safety gears of the lists (wedges, rollers): allowed up to KV_GUIDE.gearInstantV. */
export const istantaneo = (n: number): boolean => n === 1 || n === 2;
