// The form of the buffer pages (round 52): one buffer type per side and one «Numero ammortizzatori» (the model has a
// sheet per type and a number in each, two types enabled at once — correction X2), the model's inputs of that type in
// its order with its numbers (cabin 53–63, counterweight 64–74), one list of springs (the model's two comboboxes with
// their silent priority — S5), and the type-examination data the norm asks of the polyurethane and hydraulic buffers,
// which the model never asks (A1, H4). The masses and the speed come from the calculation, never from here. Pure.
import { str } from '../campi';
import { AUTAN, IDRAULICI, MOLLE } from '../cataloghi/ammortizzatori';
import type { CampoRt2, DatiRt2 } from '../types';
import type { LatoId, TipoAmm } from './amm-calcolo';

/** A side of the lift: the cabin's sheets or the counterweight's copies. */
export interface LatoAmm {
  id: LatoId;
  titolo: string;
  /** printed after «Ammortizzatori installati sotto:» */
  sotto: 'cabina' | 'contrappeso';
  /** the model's default «Numero ammortizzatori» (spring and autan sheets: 2 for the cabin, 1 for the counterweight) */
  naDefault: number;
  /** the labels with the model's numbers */
  lbl: Readonly<Record<'tipo' | 'na' | 'springModel' | 'springDm' | 'springWire' | 'springL0' | 'springPitch' | 'springG' | 'autanModel'
    | 'autanStroke' | 'autanF1' | 'hydrModel' | 'hydrStroke' | 'hydrSlowdown', string>>;
  /** the sheets' suffix in the type's options */
  foglio: string;
}

export const LATO_CABINA: LatoAmm = {
  id: 'ammCabina', titolo: 'Ammortizzatori di cabina', sotto: 'cabina', naDefault: 2, foglio: 'cabina',
  lbl: {
    tipo: 'Ammortizzatori cabina:', na: '53. Numero ammortizzatori:', springModel: '54. Tipo ammortizzatori:', autanModel: '55. Tipo ammortizzatori autan:',
    hydrModel: '56. Ammortizzatori idraulici tipo:', autanStroke: '57. Freccia massima:', autanF1: '57a. Carico massimo linearizzato:',
    hydrStroke: '57. Freccia massima:', hydrSlowdown: '58. Sistema di rallentamento sull\'ammortizzatore:', springDm: '59. Diametro medio:',
    springWire: '60. Diametro filo:', springL0: '61. Lunghezza libera:', springPitch: '62. Passo della molla:', springG: '63. Modulo elastico G:',
  },
};

export const LATO_CWT: LatoAmm = {
  id: 'ammCwt', titolo: 'Ammortizzatori del contrappeso', sotto: 'contrappeso', naDefault: 1, foglio: 'CWT',
  lbl: {
    tipo: 'Ammortizzatori contrappeso:', na: '64. Numero ammortizzatori:', springModel: '65. Tipo di ammortizzatori :', autanModel: '66. Tipo ammortizzatori autan:',
    hydrModel: '67. Ammortizzatori idraulici tipo:', autanStroke: '68. Freccia massima:', autanF1: '68a. Carico massimo linearizzato:',
    hydrStroke: '68. Freccia massima:', hydrSlowdown: '69. Sistema rallentamento sull\'ammortizzatore:', springDm: '70. Diametro medio:',
    springWire: '71. Diametro filo:', springL0: '72. Lunghezza libera:', springPitch: '73. Passo della molla:', springG: '74. Modulo elastico G:',
  },
};

const ALTRO = { v: 'altro', t: 'altro' } as const;
const di = (t: TipoAmm) => (x: DatiRt2): boolean => str(x, 'tipo') === t;
const altro = (t: TipoAmm, campo: string) => (x: DatiRt2): boolean => str(x, 'tipo') === t && str(x, campo) === 'altro';
const certificato = (x: DatiRt2): boolean => di('autan')(x) || di('idraulici')(x);
/** The type-examination data are required for every polyurethane buffer and for a hydraulic one not in the catalogue
 *  (the catalogue's give theirs). */
const certRichiesto = (x: DatiRt2): boolean => di('autan')(x) || altro('idraulici', 'hydrModel')(x);

export function campiAmm(l: LatoAmm): readonly CampoRt2[] {
  const L = l.lbl, mm = { unit: 'mm' } as const;
  return [
    { id: 'tipo', t: 'scelta', label: L.tipo, req: true, opzioni: [
      { v: 'molla', t: `Amm. a molla ${l.foglio}` }, { v: 'autan', t: `Amm. in autan ${l.foglio}` }, { v: 'idraulici', t: `Amm. idraulici ${l.foglio}` },
    ] },
    { id: 'na', t: 'num', label: L.na, min: 1, max: 8, step: 1, int: true, req: true, show: (x) => str(x, 'tipo') !== null },
    // «Amm. a molla …»: list A, list B and «altro» in one list (S5)
    { id: 'springModel', t: 'scelta', label: L.springModel, req: true, show: di('molla'), opzioni: [...MOLLE.map((m) => ({ v: m.id, t: m.nome })), ALTRO] },
    { id: 'g_molla', t: 'gruppo', label: 'Inserire i seguenti dati della molla', show: altro('molla', 'springModel') },
    { id: 'springDm', t: 'num', label: L.springDm, ...mm, min: 10, max: 500, step: 0.1, req: true, show: altro('molla', 'springModel') },
    { id: 'springWire', t: 'num', label: L.springWire, ...mm, min: 2, max: 80, step: 0.1, req: true, show: altro('molla', 'springModel') },
    { id: 'springL0', t: 'num', label: L.springL0, ...mm, min: 30, max: 2000, step: 0.5, req: true, show: altro('molla', 'springModel') },
    { id: 'springPitch', t: 'num', label: L.springPitch, ...mm, min: 2, max: 300, step: 0.01, req: true, show: altro('molla', 'springModel') },
    { id: 'springG', t: 'num', label: L.springG, unit: 'N/mm2', min: 50000, max: 100000, step: 100, req: true, show: altro('molla', 'springModel') },
    // «Amm. in autan …»
    { id: 'autanModel', t: 'scelta', label: L.autanModel, req: true, show: di('autan'), opzioni: [...AUTAN.map((a) => ({ v: a.id, t: a.nome })), ALTRO] },
    { id: 'g_autan', t: 'gruppo', label: 'Inserire i seguenti dati dell\' ammortizzatore in AUTAN', show: altro('autan', 'autanModel') },
    { id: 'autanStroke', t: 'num', label: L.autanStroke, ...mm, min: 5, max: 500, step: 0.5, req: true, show: altro('autan', 'autanModel') },
    { id: 'autanF1', t: 'num', label: L.autanF1, unit: 'N', min: 100, max: 1000000, step: 100, show: altro('autan', 'autanModel') },
    // «Amm. idraulici …»
    { id: 'hydrModel', t: 'scelta', label: L.hydrModel, req: true, show: di('idraulici'), opzioni: [...IDRAULICI.map((h) => ({ v: h.codice, t: h.codice })), ALTRO] },
    { id: 'g_idr', t: 'gruppo', label: 'Inserire i seguenti dati dell\' ammortizzatore idraulico', show: altro('idraulici', 'hydrModel') },
    { id: 'hydrStroke', t: 'num', label: L.hydrStroke, ...mm, min: 20, max: 2000, step: 1, req: true, show: altro('idraulici', 'hydrModel') },
    { id: 'hydrSlowdown', t: 'scelta', label: L.hydrSlowdown, req: true, show: di('idraulici'), opzioni: [{ v: 'con', t: 'CON' }, { v: 'senza', t: 'SENZA' }] },
    // the type-examination certificate (our addition: A1, H4)
    { id: 'g_cert', t: 'gruppo', label: 'Certificato di esame del tipo dell\'ammortizzatore', show: certificato },
    { id: 'certVUrto', t: 'num', label: 'Velocità d\'urto massima del certificato:', unit: 'm/s', min: 0.1, max: 15, step: 0.01, req: certRichiesto, show: certificato },
    { id: 'certMassaMin', t: 'num', label: 'Massa minima per ammortizzatore del certificato:', unit: 'kg', min: 1, max: 20000, step: 1, req: certRichiesto, show: certificato },
    { id: 'certMassaMax', t: 'num', label: 'Massa massima per ammortizzatore del certificato:', unit: 'kg', min: 1, max: 20000, step: 1, req: certRichiesto, show: certificato },
  ];
}

/** The model's defaults as proposals: its «Numero ammortizzatori» of the side (the hydraulic sheets have none: H1) and
 *  the slowdown «SENZA» — the model's «CON» would shorten the stroke the norm asks on a bare declaration (H2). */
export const proposteAmm = (l: LatoAmm) => (): DatiRt2 => ({ na: l.naDefault, hydrSlowdown: 'senza' });
