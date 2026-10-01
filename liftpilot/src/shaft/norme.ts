// Registry of the shaft module (plan of the shaft, car, doors and counterweight), in the same form as the one of
// the calculation engine (src/calc/norme.ts): every number the layout takes from a standard, a law or a design
// choice lives in KV or DEFAULTS and is described by an entry, which goes into the engineer's checklist and into the
// report. Texts are in Italian: they go to the engineer and into the report. Only clause numbers and values, never
// the text of the standards.

import type { Stato } from '../calc/norme';
import { VOCI_PORTE } from './norme-porte';
import { VOCI_VERT } from './norme-vert';
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
  cwEndGap: 40,
  cwShoe: 20,
  sizeStep: 10,
  // cantilever sling: feet of the car rails inside the platform's depth; car rail foot to the counterweight rail foot
  cantRailEnd: 20,
  cantCwGap: 70,
  // cantilever sling: the car 10 mm clear of the clips on the car rails' feet (the clips' reach: src/shaft/rails.ts)
  cantClipGap: 10,
  // doors in plan: jambs of the landing door opening; car door operator by door kind (catalogues 2SG FLY, Fermator
  // 40/10 VF, taken on the long side): telescopic 1,5·L + 50, its closing side 25 mm past the opening; centre opening
  // 2·L + 60; 150 mm deep
  doorPortal: 50,
  // the portal's head over the clear opening on the landing (registry porte.imbotti)
  doorHead: 60,
  doorOpT2: [1.5, 50],
  doorOpC2: [2, 60],
  doorOpClose: 25,
  doorOpDepth: 150,
  // the operator of the supplier chosen (same extracts): 2SG FLY/LIKE 2AT 1,5·A + 40 and 2AO 2·A + 20; Fermator 40/10
  // 1,5·PL + 50 and 2·PL + 50
  doorOpMakers: { '2sg': { T2: [1.5, 40], C2: [2, 20] }, fermator: { T2: [1.5, 50], C2: [2, 50] } },
  // niches in the walls: the wall left behind a niche, the counterweight's rails clear of a niche's sides, the recess
  // of a lamp; the lamps of the shaft 1,5 m over each floor and the top one 80 mm under the slab
  nicheBackMin: 50,
  nicheGap: 20,
  nicheLightH: 400,
  lampOverFloor: 1500,
  lampUnderSlab: 80,
  // landing call station: 150 mm from the door's portal on the landing's right, its buttons' middle 1100 mm over the
  // floor; the panel 120 × 300 mm, 15 mm proud of the wall
  callOffset: 150,
  callHeight: 1100,
  callPanel: [120, 300, 15],
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
  shoeGap: 30,
  cwRailGap: 85,
} as const;

export type Allowance = keyof typeof DEFAULTS;

export type GruppoVano = 'cabina' | 'distanze' | 'accessibilita' | 'porte' | 'ingombri' | 'sezione' | 'locale' | 'carichi' | 'modello_vano';

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
    id: 'ingombri.tipici', gruppo: 'ingombri', titolo: 'Ingombri tipici nel vano (modificabili su ogni progetto)',
    valore: 'profondità della porta di piano 80 mm; gioco tra le soglie 30 mm; porta di cabina 80 mm; pareti della cabina 35 mm; '
      + 'guide e staffe della cabina 165 mm per lato; cabina–contrappeso 60 mm; spessore del contrappeso 140 mm; '
      + 'guide e staffe del contrappeso 80 mm; cabina–parete di fondo 60 mm; punta della guida–cabina 30 mm; '
      + 'contrappeso laterale–piede della guida di cabina 85 mm',
    riferimento: 'dati del costruttore di guide, porte e cabina', fonte: 'valori tipici: scelta del software', stato: 'scelta',
    verifiche: ['v_fit'],
    nota: 'pacchetto porta di catalogo (porta di cabina + gioco tra le soglie + porta di piano), da wittur.com: Hydra 210 mm a 2 ante telescopiche '
      + 'e 180 mm a 2 ante centrali, Hydra 3000 180 e 130, Augusta EVO 190 e 110, Sematic 2000 C-MOD 185 e 117, Fineline 115 e 85; Sematic 2000 B '
      + '255 e 165 (cabina 90 e 45, gioco 30, piano 135 e 90, da una copia della brochure). Con le porte scelte, i tre ingombri vanno portati alla '
      + 'somma del fornitore (oggi 80 + 30 + 80 = 190 mm)',
  },
  {
    id: 'ingombri.contrappeso.laterale', gruppo: 'ingombri', titolo: 'Contrappeso laterale',
    valore: 'tra la parete e la guida della cabina, centrato sull\'asse delle guide di cabina, con le sue guide alle estremità (pattini 20 mm) '
      + 'e la guida di cabina su una staffa a ponte; a 40 mm dalle zone delle porte; lunghezza in pianta da 400 a 900 mm (sotto 400 mm: '
      + '«Attenzione»); con il contrappeso sul fondo, al massimo la larghezza tra le guide della cabina',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['cwMinLength', 'cwMaxLength', 'cwEndGap', 'cwShoe'], verifiche: ['v_cwlen'],
  },
  {
    id: 'ingombri.arcata.zaino', gruppo: 'ingombri', titolo: 'Arcata a zaino (due accessi adiacenti a 90°)',
    valore: 'entrambe le guide di cabina sulla parete opposta all\'accesso laterale, con le lame affacciate lungo la parete (il momento della cabina '
      + 'a sbalzo va sulle facce delle lame); piedi delle guide a 20 mm dentro la profondità della piattaforma; contrappeso tra le guide, '
      + 'contro la parete, con le sue guide alle estremità e i piedi a 70 mm da quelli delle guide di cabina (staffe); la cabina a 10 mm dalle '
      + 'bride che tengono i piedi delle guide sulle staffe (bride forgiate della misura della guida, con la piastra oltre il piede)',
    riferimento: '—', fonte: 'scelta del software (principio: cataloghi di arcate a zaino); disposizione da confermare con il fornitore dell\'arcata', stato: 'scelta',
    costanti: ['cantRailEnd', 'cantCwGap', 'cantClipGap'],
  },
  {
    id: 'ingombri.nicchie', gruppo: 'ingombri', titolo: 'Nicchie nelle pareti del vano',
    valore: 'contrappeso in nicchia: il contrappeso con le sue guide sta nella nicchia della parete su cui corre, con almeno 20 mm tra le guide '
      + 'e i fianchi della nicchia (con le staffe Panev, lo spazio della piastra del supporto dietro il piede di ogni guida); la distanza dalla '
      + 'parete si misura dal fondo della nicchia e la cabina guadagna la sua profondità, senza '
      + 'scendere sotto gli ingombri delle guide; luce del vano in nicchia: una nicchia alta 400 mm per lampada, le lampade 1500 mm sopra ogni '
      + 'piano e l\'ultima a 80 mm sotto il solaio; canalina in nicchia: dal fondo della fossa al solaio; ogni nicchia dentro la sua parete, fuori '
      + 'dai telai delle porte di piano e dalle altre nicchie, con almeno 50 mm di muro dietro; altrimenti «Non conforme»',
    riferimento: '—', fonte: 'scelta del software; la resistenza della parete con la nicchia va verificata dal progettista', stato: 'scelta',
    costanti: ['nicheBackMin', 'nicheGap', 'nicheLightH', 'lampOverFloor', 'lampUnderSlab'], verifiche: ['v_niche'],
  },
  {
    id: 'ingombri.staffe.contrappeso', gruppo: 'ingombri', titolo: 'Staffe delle guide del contrappeso (catalogo Panev)',
    valore: 'per default il supporto Panev SU o SD con la guida SG, la guida serrata sulla flangia della SG da due bride N1: il supporto più corto il '
      + 'cui campo stampato prende la distanza della guida dalla parete (o dal fondo della nicchia) e la cui piastra sta sulla parete: SU, SD 150 '
      + 'e SD 220 lunghi 160 mm da 45 a 155 mm (SD 220 da 50), lunghi 180 mm da 45 a 195 mm, lunghi 200 mm da 45 a 215 mm; nessuno adatto: '
      + '«Non conforme» (si possono scegliere staffe generiche, da dimensionare a parte)',
    riferimento: 'catalogo staffe Panev 2026, pp. 20-59', fonte: 'catalogo del costruttore (panev/docs/catalogo-staffe-panev-2026.pdf)', stato: 'confermato',
    verifiche: ['v_staffa'],
  },
  {
    id: 'ingombri.limitatore', gruppo: 'ingombri', titolo: 'Limitatore di velocità e tenditore (pianta, locale macchina, 3D)',
    valore: 'per velocità il più piccolo PFB che la regge: LK200 (Ø 200, fune 6) fino a 1,48 m/s, LK250 fino a 1,74, LK300 fino a 2,93, R12BF fino a '
      + '4,00; oppure il modello scelto se regge la velocità: PFB (LX, LK, R1, R10BF) o Montanari (RQ-A 200, 250 e 300, NOR fino a 1,50 m/s, RG 200 '
      + 'fino a 0,30). Disegnati nelle proporzioni del LK200 (alto 370 mm, base 220 × 165) salvo LX120 alto 178, R10BF 488 su base 460 × 196, '
      + 'R12BF 524 su base 520 × 116, R1-LR 344 su base 285 × 80. Tenditore in fossa sulla guida di cabina: a leva con 22 kg (come PFB R4K) o '
      + 'verticale con 44 kg (come PFB R4R)',
    riferimento: 'dati del fornitore del limitatore', stato: 'da_verificare',
    fonte: 'pagine pfb.it e montanarigiulio.com, schede di elevatorequipment.co.uk (altezze, basi), estratti di ricerca del 1° ottobre 2026',
    nota: 'per le RQ-A Montanari 0,15–3,0 m/s è il campo della famiglia: il limite di ogni taglia va letto sul manuale; delle basi pubblicate non è detto '
      + 'quale lato stia nel piano della puleggia (il lato lungo è disegnato in quel piano, come nel LK200)',
  },
  {
    id: 'modello.passo', gruppo: 'modello_vano', titolo: 'Dimensioni proposte della cabina',
    valore: 'la cabina più grande che entra nel vano, a passi di 10 mm, con superficie entro il limite della portata; a parità di superficie, la più profonda',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    costanti: ['sizeStep'],
  },
  {
    id: 'modello.quote', gruppo: 'modello_vano', titolo: 'Quote della pianta fissate a mano',
    valore: 'ogni quota della pianta (cabina, porte, operatore della porta di cabina, guide, contrappeso) si può fissare a mano al posto di '
      + 'quella proposta; la cabina resta fuori dalle zone di porte, guide e contrappeso, le guide del contrappeso nel loro spazio (laterale: '
      + 'fuori dalle zone delle porte che ha di fronte più il gioco d\'estremità; arcata a zaino: tra i piedi delle guide di cabina meno il gioco '
      + 'delle staffe) e la luce di ogni porta dentro la cabina; altrimenti «Non conforme». Anche gli ammortizzatori si possono '
      + 'spostare: quelli di cabina restano con il piatto sotto la piattaforma e fuori dalla pianta dello spazio di rifugio in fossa '
      + '(UNI EN 81-20, 5.2.5.8), quello del contrappeso dentro la lunghezza del contrappeso',
    riferimento: '—', fonte: 'scelta del software', stato: 'scelta',
    verifiche: ['v_place', 'v_doorcar', 'v_buffer'],
  },
  {
    id: 'modello.limiti', gruppo: 'modello_vano', titolo: 'Limiti del modello del vano',
    valore: 'pianta, sezione A-A e locale macchina da un modello semplificato: arcata, operatori delle porte, ammortizzatori e macchina hanno '
      + 'posizioni e ingombri tipici, da sostituire con i dati dei fornitori; il rilievo dal disegno CAD va controllato in cantiere',
    riferimento: '—', fonte: 'limite del modello attuale', stato: 'scelta',
  },
  ...VOCI_PORTE,
  ...VOCI_VERT,
];

const ACCESS_VOCE: Readonly<Record<Access, string | null>> = {
  none: null, dm236_existing: 'accessibilita.esistenti', dm236_residential: 'accessibilita.residenziale', dm236_public: 'accessibilita.non.residenziale',
};

/** The entries behind a design: all of them but the accessibility cases the design does not apply. */
export const vociOfDesign = (access: Access): VoceVano[] => VOCI_VANO.filter((v) => v.gruppo !== 'accessibilita' || v.id === ACCESS_VOCE[access]);
