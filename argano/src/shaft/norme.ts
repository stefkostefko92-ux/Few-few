// Registry of the shaft module (plan of the shaft, car, doors and counterweight), in the same form as the one of
// the calculation engine (src/calc/norme.ts): every number the layout takes from a standard, a law or a design
// choice lives in KV or DEFAULTS and is described by an entry, which goes into the engineer's checklist and into the
// report. Texts are in Italian: they go to the engineer and into the report. Only clause numbers and values, never
// the text of the standards.

import type { Stato } from '../calc/norme';
import type { Access, ShaftCheckId } from './types';

export const KV = {
  // UNI EN 81-20:2020, 5.4.2.1 (Tabella 6): rated load [kg] → maximum available car area [m²], linear in between
  areaTable: [[100, 0.37], [180, 0.58], [225, 0.7], [300, 0.9], [375, 1.1], [400, 1.17], [450, 1.3], [525, 1.45], [600, 1.6], [630, 1.66], [675, 1.75],
    [750, 1.9], [800, 2], [825, 2.05], [900, 2.2], [975, 2.35], [1000, 2.4], [1050, 2.5], [1125, 2.65], [1200, 2.8], [1250, 2.9], [1275, 2.95], [1350, 3.1],
    [1425, 3.25], [1500, 3.4], [1600, 3.56], [2000, 4.2], [2500, 5]] as const,
  areaPer100kgOver2500: 0.16,
  // UNI EN 81-20:2020 (Tabella 8): passengers → minimum available car area [m²]
  personsTable: [[1, 0.28], [2, 0.49], [3, 0.6], [4, 0.79], [5, 0.98], [6, 1.17], [7, 1.31], [8, 1.45], [9, 1.59], [10, 1.73], [11, 1.87], [12, 2.01],
    [13, 2.15], [14, 2.29], [15, 2.43], [16, 2.57], [17, 2.71], [18, 2.85], [19, 2.99], [20, 3.13]] as const,
  areaPerPersonOver20: 0.115,
  personMass: 75,
  // clearances in plan [mm]
  wallFacingEntranceMax: 150,
  sillGapMax: 35,
  carCwMin: 50,
  // DM 236/1989, 8.1.12: car width × depth and door clear width [mm]
  dm236Residential: [950, 1300, 800],
  dm236Public: [1100, 1400, 800],
  dm236Existing: [800, 1200, 750],
  // choices of the software
  doorStackT2: 1.5,
  doorStackC2: 2,
  doorFrame: 110,
  carDoorMargin: 50,
  carMinDepth: 800,
  cwMinLength: 400,
  cwMaxLength: 900,
  cwRailClear: 100,
  cwEndGap: 40,
  sizeStep: 10,
} as const;

export type CostanteVano = keyof typeof KV;

/** Allowances of the layout [mm]: typical values, editable on every design. */
export const DEFAULTS = {
  landingDepth: 80,
  sillGap: 30,
  carDoorDepth: 80,
  carWall: 35,
  railZone: 165,
  cwCarGap: 60,
  cwDepth: 140,
  cwWallGap: 80,
  rearGap: 60,
} as const;

export type Allowance = keyof typeof DEFAULTS;

export type GruppoVano = 'cabina' | 'distanze' | 'accessibilita' | 'porte' | 'ingombri' | 'modello_vano';

export interface VoceVano {
  id: string;
  gruppo: GruppoVano;
  titolo: string;
  valore: string;
  riferimento: string;
  fonte: string;
  stato: Stato;
  costanti?: readonly CostanteVano[];
  verifiche?: readonly ShaftCheckId[];
  nota?: string;
}

const EW = 'Elevator World, «Rated Load and Maximum Available Car Area» (fonte secondaria)';
const DM = 'sintesi pubblicate del DM 236/1989 (disabili.com, studiomadera.it), fonti secondarie concordi';

export const VOCI_VANO: readonly VoceVano[] = [
  {
    id: 'cabina.superficie', gruppo: 'cabina', titolo: 'Superficie utile massima della cabina per portata',
    valore: '100 kg 0,37 m²; 180 kg 0,58; 225 kg 0,70; 300 kg 0,90; 375 kg 1,10; 400 kg 1,17; 450 kg 1,30; 525 kg 1,45; 600 kg 1,60; 630 kg 1,66; '
      + '675 kg 1,75; 750 kg 1,90; 800 kg 2,00; 825 kg 2,05; 900 kg 2,20; 975 kg 2,35; 1000 kg 2,40; 1050 kg 2,50; 1125 kg 2,65; 1200 kg 2,80; '
      + '1250 kg 2,90; 1275 kg 2,95; 1350 kg 3,10; 1425 kg 3,25; 1500 kg 3,40; 1600 kg 3,56; 2000 kg 4,20; 2500 kg 5,00; '
      + 'oltre 2500 kg +0,16 m² ogni 100 kg; interpolazione lineare',
    riferimento: 'UNI EN 81-20:2020, 5.4.2.1 (Tabella 6)', fonte: `${EW}; valori della EN 81-1 (Tabella 1.1)`, stato: 'da_verificare',
    costanti: ['areaTable', 'areaPer100kgOver2500'], verifiche: ['v_area'],
    nota: 'la superficie è calcolata come larghezza × profondità interne, senza nicchie né rientranze della porta',
  },
  {
    id: 'cabina.passeggeri', gruppo: 'cabina', titolo: 'Numero di passeggeri',
    valore: 'il minore tra Q/75 arrotondato per difetto e il numero ammesso dalla superficie: 1 persona 0,28 m²; 2 0,49; 3 0,60; 4 0,79; 5 0,98; '
      + '6 1,17; 7 1,31; 8 1,45; 9 1,59; 10 1,73; 11 1,87; 12 2,01; 13 2,15; 14 2,29; 15 2,43; 16 2,57; 17 2,71; 18 2,85; 19 2,99; 20 3,13; '
      + 'oltre 20 +0,115 m² per persona',
    riferimento: 'UNI EN 81-20:2020, 5.4.2 (Tabella 8)', fonte: 'valori della EN 81-1 (Tabella 1.2), edizione superata', stato: 'da_verificare',
    costanti: ['personsTable', 'areaPerPersonOver20', 'personMass'],
  },
  {
    id: 'distanze.parete.entrata', gruppo: 'distanze', titolo: 'Parete del vano di fronte all\'entrata della cabina',
    valore: 'distanza orizzontale dalla soglia o dal telaio della porta di cabina ≤ 150 mm (qui: profondità della porta di piano + gioco tra le soglie)',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.3.1', fonte: 'schede EN 81-20 dei costruttori (KONE), fonti secondarie', stato: 'da_verificare',
    costanti: ['wallFacingEntranceMax'], verifiche: ['v_wall'],
  },
  {
    id: 'distanze.soglie', gruppo: 'distanze', titolo: 'Gioco tra soglia di cabina e soglia di piano',
    valore: 'distanza orizzontale ≤ 35 mm',
    riferimento: 'UNI EN 81-20:2020 (clausola da individuare; 11.2.3 nella EN 81-1)', fonte: 'fonti secondarie concordi', stato: 'da_verificare',
    costanti: ['sillGapMax'], verifiche: ['v_sill'],
  },
  {
    id: 'distanze.contrappeso', gruppo: 'distanze', titolo: 'Distanza tra cabina e contrappeso',
    valore: '≥ 50 mm tra la cabina con i suoi componenti e il contrappeso con i suoi',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.5.1', fonte: 'schede EN 81-20 dei costruttori (KONE), fonti secondarie', stato: 'da_verificare',
    costanti: ['carCwMin'], verifiche: ['v_cw'],
  },
  {
    id: 'accessibilita.residenziale', gruppo: 'accessibilita', titolo: 'Edifici residenziali nuovi: cabina e porta minime',
    valore: 'cabina larga 950 mm e profonda 1300 mm, porta di 800 mm sul lato corto; piattaforma davanti alla porta 1,50 × 1,50 m (non verificata)',
    riferimento: 'DM 236/1989, 8.1.12', fonte: DM, stato: 'da_verificare',
    costanti: ['dm236Residential'], verifiche: ['v_acc_car', 'v_acc_door', 'v_acc_side'],
  },
  {
    id: 'accessibilita.non.residenziale', gruppo: 'accessibilita', titolo: 'Edifici non residenziali nuovi: cabina e porta minime',
    valore: 'cabina larga 1100 mm e profonda 1400 mm, porta di 800 mm sul lato corto; piattaforma davanti alla porta 1,50 × 1,50 m (non verificata)',
    riferimento: 'DM 236/1989, 8.1.12', fonte: DM, stato: 'da_verificare',
    costanti: ['dm236Public'], verifiche: ['v_acc_car', 'v_acc_door', 'v_acc_side'],
  },
  {
    id: 'accessibilita.esistenti', gruppo: 'accessibilita', titolo: 'Adeguamento di edifici esistenti: cabina e porta minime',
    valore: 'cabina larga 800 mm e profonda 1200 mm, porta di 750 mm sul lato corto; piattaforma davanti alla porta 1,40 × 1,40 m (non verificata)',
    riferimento: 'DM 236/1989, 8.1.12', fonte: DM, stato: 'da_verificare',
    costanti: ['dm236Existing'], verifiche: ['v_acc_car', 'v_acc_door', 'v_acc_side'],
  },
  {
    id: 'porte.ingombro', gruppo: 'porte', titolo: 'Ingombro della porta di piano lungo la parete del vano',
    valore: 'telescopica a 2 ante: 1,5·L + 110 mm; centrale a 2 ante: 2·L + 110 mm (L = luce netta)',
    riferimento: 'dato del fornitore delle porte', fonte: 'valori tipici: scelta del software da confermare con il fornitore', stato: 'scelta',
    costanti: ['doorStackT2', 'doorStackC2', 'doorFrame'], verifiche: ['v_door'],
  },
  {
    id: 'porte.cabina', gruppo: 'porte', titolo: 'Larghezza della cabina rispetto alla porta',
    valore: 'larghezza interna ≥ luce della porta + 50 mm; profondità interna ≥ 800 mm',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['carDoorMargin', 'carMinDepth'], verifiche: ['v_fit'],
  },
  {
    id: 'ingombri.tipici', gruppo: 'ingombri', titolo: 'Ingombri tipici nel vano (modificabili su ogni progetto)',
    valore: 'profondità della porta di piano 80 mm; gioco tra le soglie 30 mm; porta di cabina 80 mm; pareti della cabina 35 mm; '
      + 'guide e staffe della cabina 165 mm per lato; cabina–contrappeso 60 mm; spessore del contrappeso 140 mm; '
      + 'guide e staffe del contrappeso 80 mm; cabina–parete di fondo 60 mm',
    riferimento: 'dati del costruttore di guide, porte e cabina', fonte: 'valori tipici: scelta del software', stato: 'scelta',
    verifiche: ['v_fit'],
  },
  {
    id: 'ingombri.contrappeso.laterale', gruppo: 'ingombri', titolo: 'Contrappeso laterale',
    valore: 'la guida della cabina su quel lato sta a metà profondità della cabina, il contrappeso dietro di essa, a 100 mm dal suo asse e a 40 mm '
      + 'dalla parete di fondo; lunghezza del contrappeso in pianta da 400 a 900 mm (sotto 400 mm: «Attenzione»); con il contrappeso sul fondo, '
      + 'al massimo la larghezza tra le guide della cabina',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['cwMinLength', 'cwMaxLength', 'cwRailClear', 'cwEndGap'], verifiche: ['v_cwlen'],
  },
  {
    id: 'modello.passo', gruppo: 'modello_vano', titolo: 'Dimensioni proposte della cabina',
    valore: 'la cabina più grande che entra nel vano, a passi di 10 mm, con superficie entro il limite della portata; a parità di superficie, la più profonda',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['sizeStep'],
  },
  {
    id: 'modello.solo.pianta', gruppo: 'modello_vano', titolo: 'Limiti del progetto in pianta',
    valore: 'solo la pianta: fossa, testata e spazi di rifugio non sono verificati; il rilievo dal disegno CAD va controllato in cantiere',
    riferimento: 'UNI EN 81-20:2020, 5.2.5.7 e 5.2.5.8 (fossa e testata)', fonte: 'limite del modello attuale', stato: 'scelta',
  },
];

const ACCESS_VOCE: Readonly<Record<Access, string | null>> = {
  none: null, dm236_existing: 'accessibilita.esistenti', dm236_residential: 'accessibilita.residenziale', dm236_public: 'accessibilita.non.residenziale',
};

/** The entries behind a design: all of them but the accessibility cases the design does not apply. */
export const vociOfDesign = (access: Access): VoceVano[] => VOCI_VANO.filter((v) => v.gruppo !== 'accessibilita' || v.id === ACCESS_VOCE[access]);
