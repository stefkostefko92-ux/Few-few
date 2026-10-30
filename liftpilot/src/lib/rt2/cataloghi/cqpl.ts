// The lists and tables of the owner's model (round 52; the owner holds the rights, owner's decision) read by the pages
// «Quadro di manovra», «Cabina», «Limitatore di velocità» and «Porte», as the model has them (each with its sheet and
// cells). The model's items without data or without a text are not offered (a component without its data is never
// computed): the 6th, blank, «Tipo di manovra» (E-Q6), the blank frequencies (E-Q3), the safety gear «senza» of the car
// (E-C23), the governor rope «diam. 8 - De Biase» without its breaking load (E-L5), the fire protection «' '» (E-P5);
// the cabin door's blank item is given its printed text «preesistente/i» (E-P5). Pure.

export interface VoceLista {
  /** the model's index in its list (kept: the ids of the inputs) */
  v: string;
  /** the item as the model writes it */
  t: string;
}

/** «31. Tipo di manovra», 'Quadro Manovra '!N3:O7. */
export const TIPI_MANOVRA: readonly VoceLista[] = [
  { v: '1', t: 'Universale a pulsanti' }, { v: '2', t: 'Simplex - Prenotazione discesa' }, { v: '3', t: 'Simplex - Prenotazione salita/discesa' },
  { v: '4', t: 'Duplex - Prenotazione discesa' }, { v: '5', t: 'Duplex - Prenotazione salita/discesa' },
];

/** The frequencies of the control circuit and of the door operator: 'Quadro Manovra '!N20:O22 and N26:O28 (`t`, printed
 *  before «Hz»), Porte!T36:U38 (`porte`); the model's blank items left out, its d.c. «c.c.» of Porte!U37 offered on the
 *  controller's page too (E-Q3). */
export const FREQUENZE: readonly (VoceLista & { porte: string; cc: boolean })[] = [
  { v: '50', t: '50', porte: '50 Hz.', cc: false }, { v: 'cc', t: 'c.c.', porte: 'c.c.', cc: true },
];

/** The car's safety gear, TABELLE!B66:F69 («tabella valida per cabina»: type, «Coeff. C», «Coeff. K1»), and the governor's
 *  tripping speed limit the model takes for each (Limitatore!S93:S96, read by H90). Its 5th row «senza» is not offered:
 *  the car has a safety gear. */
export interface Paracadute extends VoceLista {
  C: number;
  K1: number;
  /** the gear for UNI EN 81-20:2020, 5.6.2.2.1.1 a) (@/shaft/governor tripWindow) */
  gear: 'instantaneous' | 'roller' | 'progressive';
  /** the model's limit: a speed [m/s], or its formula 1,25·(v + 0,25/v) (S96) */
  vMaxModello: number | 'S96';
}
export const PARACADUTI: readonly Paracadute[] = [
  { v: '1', t: 'Istantaneo a cunei', C: 50, K1: 5, gear: 'instantaneous', vMaxModello: 0.8 },
  { v: '2', t: 'Istantaneo a rulli', C: 30, K1: 3, gear: 'roller', vMaxModello: 1 },
  { v: '3', t: 'Presa progressiva <= 1 m/s', C: 20, K1: 2, gear: 'progressive', vMaxModello: 1.5 },
  { v: '4', t: 'Presa progressiva > 1 m/s', C: 20, K1: 2, gear: 'progressive', vMaxModello: 'S96' },
];

/** «90. Tipo di limitatore», Limitatore!S64:W70: «Forza az.» [N], «Forza ad.» [N], «D pul.» [mm]; «altro» typed. */
export interface Limitatore extends VoceLista {
  forzaAz: number;
  forzaAd: number;
  dPuleggia: number;
}
export const LIMITATORI: readonly Limitatore[] = [
  { v: '1', t: 'PFB R1', forzaAz: 1292, forzaAd: 780, dPuleggia: 300 },
  { v: '2', t: 'PFB R3', forzaAz: 300, forzaAd: 368, dPuleggia: 255 },
  { v: '3', t: 'PFB R5', forzaAz: 550, forzaAd: 706, dPuleggia: 200 },
  { v: '4', t: 'PFB LK-200', forzaAz: 1233, forzaAd: 780, dPuleggia: 200 },
  { v: '5', t: 'PFB LK-250', forzaAz: 1766, forzaAd: 780, dPuleggia: 250 },
  { v: '6', t: 'PFB LK-300', forzaAz: 1668, forzaAd: 780, dPuleggia: 300 },
];
export const LIMITATORE_ALTRO: VoceLista = { v: '7', t: 'altro' };

/** «91. Diametro fune azionamento», Limitatore!S79:X85: diameter [mm], breaking load [N], construction, strands; «altro
 *  fornitore» typed. Its row 3 («diam. 8 - De Biase») has no breaking load: not offered (E-L5). */
export interface FuneLimitatore extends VoceLista {
  d: number;
  rottura: number;
  formazione: string;
  trefoli: number;
}
const F114 = '6 * ( 9 + 9 + 1 ) + AT = 114 fili';
export const FUNI_LIMITATORE: readonly FuneLimitatore[] = [
  { v: '1', t: 'diam. 6 - De Biase', d: 6, rottura: 21100, formazione: F114, trefoli: 6 },
  { v: '2', t: 'diam. 7 - De Biase', d: 7, rottura: 29420, formazione: F114, trefoli: 6 },
  { v: '4', t: 'diam. 6 - Donati', d: 6, rottura: 18700, formazione: F114, trefoli: 6 },
  { v: '5', t: 'diam. 7 - Donati', d: 7, rottura: 25400, formazione: F114, trefoli: 6 },
  { v: '6', t: 'diam. 8 - Donati', d: 8, rottura: 33200, formazione: F114, trefoli: 6 },
];
export const FUNE_ALTRA: VoceLista = { v: '7', t: 'altro fornitore' };

/** A door type with the two lines the page prints (columns Z and AG of the model's table). */
export interface TipoPorta extends VoceLista {
  righe: readonly string[];
  /** power operated (an operator, the limits of its closing) */
  motore: boolean;
}

/** «88. Tipo di porta» of the car, Porte!V15:AM18 (its 4th item, blank in the list, prints «preesistente/i»). */
export const PORTE_CABINA: readonly TipoPorta[] = [
  { v: '1', t: 'automatica orizzontale', motore: true,
    righe: ['La nuova porta di cabina è realizzata in lamiera d\'acciaio. L\'apertura è', 'scorrevole orizzontale ad ante multiple azionate da un motore elettrico.'] },
  { v: '2', t: 'soffietto automatica', motore: true,
    righe: ['La nuova porta di cabina è del tipo a soffietto a scorrimento orizzontale.', 'La porta è azionata da un motore elettrico.'] },
  { v: '3', t: 'soffietto manuale', motore: false,
    righe: ['La nuova porta di cabina è del tipo a soffietto a scorrimento orizzontale.', 'L\'azionamento delle porte è di tipo manuale.'] },
  { v: '4', t: 'preesistente/i', motore: false, righe: ['preesistente/i'] },
];
export const PORTA_CABINA_PREESISTENTE = '4';

/** «85. Tipo porte» of the landings, Porte!V24:AM29. */
export const PORTE_PIANO: readonly TipoPorta[] = [
  { v: '1', t: 'automatica (TLD o CLD)', motore: true,
    righe: ['Le nuove porte di piano sono realizzate in lamiera d\'acciaio e sono del tipo', 'ad ante scorrevoli orizzontali'] },
  { v: '2', t: 'manuale a battente/i', motore: false, righe: ['Le nuove porte di piano sono di tipo a battente.', 'L\'azionamento delle porte è di tipo manuale.'] },
  { v: '3', t: 'cancello a ghigliottina manuale', motore: false,
    righe: ['Le nuove porte sono costituite da cancelli a movimento verticale.', 'L\'azionamento delle porte è di tipo manuale.'] },
  { v: '4', t: 'cancello a ghigliottina automatico', motore: true,
    righe: ['Le nuove porte sono costituite da cancelli a movimento verticale.', 'Le porte sono azionate da motori elettrici.'] },
  { v: '5', t: 'soffietto manuale', motore: false,
    righe: ['Le nuove porte sono del tipo a soffietto a scorrimento orizzontale', 'L\'azionamento delle porte è di tipo manuale.'] },
  { v: '6', t: 'preesistenti', motore: false, righe: ['preesistenti'] },
];
export const PORTE_PIANO_PREESISTENTI = '6';

/** «84. Protezione al fuoco EI», Porte!T48:V51: the type and the sentence printed under it; `classe` the class for the
 *  comparison of UNI 10411-1:2024, 19.2 (rt/componenti/porte.ts confrontoFuoco; REI 120' as EI 120' for a door). */
export const FUOCO: readonly (VoceLista & { frase: string | null; classe: 'nessuna' | 'EI60' | 'EI120' })[] = [
  { v: '1', t: 'Nessuna', frase: null, classe: 'nessuna' },
  { v: '2', t: 'EI 60\'', frase: 'Nella sezione allegati sono contenuti i certificati di resistenza al fuoco.', classe: 'EI60' },
  { v: '3', t: 'EI 120\'', frase: 'Nella sezione allegati sono contenuti i certificati di resistenza al fuoco.', classe: 'EI120' },
  { v: '4', t: 'REI 120\'', frase: 'Nella sezione allegati sono contenuti i certificati di resistenza al fuoco.', classe: 'EI120' },
];

/** An item of a list by its id. */
export const voceDi = <T extends VoceLista>(xs: readonly T[], v: string | null): T | null => xs.find((x) => x.v === v) ?? null;
